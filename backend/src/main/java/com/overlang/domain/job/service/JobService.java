package com.overlang.domain.job.service;

import com.overlang.api.dto.job.*;
import com.overlang.domain.cache.service.ResultCacheService;
import com.overlang.domain.cache.service.ResultCopyService;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.CurrentStage;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.queue.JobQueuePayload;
import com.overlang.domain.job.queue.JobQueueProducer;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.learning.entity.LearningContent;
import com.overlang.domain.learning.repository.LearningContentRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobService {

  private static final String WORD_SPLIT_REGEX = "\\s+";

  private final ProjectRepository projectRepository;
  private final JobRepository jobRepository;
  private final S3UploadService s3UploadService;
  private final JobQueueProducer jobQueueProducer;
  private final ResultCacheService resultCacheService;
  private final ResultCopyService resultCopyService;
  private final LearningContentRepository learningContentRepository;
  private final JobResultService jobResultService;

  @Value("${worker.secret}")
  private String workerSecret;

  @Transactional
  public JobCreateResponse createJob(Long projectId, Long memberId, JobCreateRequest request) {
    Project project = findProjectByIdAndMemberId(projectId, memberId);

    validateJobCreateRequest(request);

    Job savedJob = jobRepository.save(createJobEntity(project, request));

    var reusableJob = resultCacheService.findReusableJob(project, request);

    if (reusableJob.isPresent()) {
      resultCopyService.copyResults(reusableJob.get(), savedJob);
      savedJob.complete(100, CurrentStage.FINALIZING, null, null);
      project.markCompleted();

      return JobCreateResponse.from(savedJob, true);
    }

    enqueueJob(project, savedJob);

    return JobCreateResponse.from(savedJob, false);
  }

  private void validateJobCreateRequest(JobCreateRequest request) {
    requireNonNull(request.jobType(), "jobType");
    requireNonNull(request.sourceLanguage(), "sourceLanguage");
    requireNonNull(request.targetLanguage(), "targetLanguage");

    if (request.sourceLanguage() == request.targetLanguage()) {
      throw new IllegalArgumentException("sourceLanguage와 targetLanguage는 같을 수 없습니다.");
    }
  }

  private void requireNonNull(Object value, String fieldName) {
    if (value == null) {
      throw new IllegalArgumentException(fieldName + "은(는) 필수입니다.");
    }
  }

  private JobQueuePayload createQueuePayload(Project project, Job job) {
    SourceType sourceType = project.getSourceType();

    return switch (sourceType) {
      case UPLOAD -> {
        String presignedUrl = s3UploadService.generatePresignedGetUrl(project.getFileKey());

        yield new JobQueuePayload(
            job.getId(),
            project.getId(),
            project.getMember().getId(),
            sourceType,
            null,
            project.getFileKey(),
            presignedUrl,
            job.getJobType(),
            job.getSourceLanguage(),
            job.getTargetLanguage(),
            job.getTranslationProvider());
      }

      case YOUTUBE ->
          new JobQueuePayload(
              job.getId(),
              project.getId(),
              project.getMember().getId(),
              sourceType,
              project.getSourceUrl(),
              null,
              null,
              job.getJobType(),
              job.getSourceLanguage(),
              job.getTargetLanguage(),
              job.getTranslationProvider());
    };
  }

  @Transactional(readOnly = true)
  public List<JobResponse> getJobsByProject(Long projectId, Long memberId) {
    Project project = findProjectByIdAndMemberId(projectId, memberId);

    return jobRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()).stream()
        .map(JobResponse::from)
        .toList();
  }

  @Transactional(readOnly = true)
  public JobDetailResponse getJobDetail(Long jobId, Long memberId) {
    Job job = findJobByIdAndMemberId(jobId, memberId);

    return JobDetailResponse.from(job);
  }

  @Transactional
  public JobRetryResponse retryJob(Long projectId, Long memberId) {
    Project project = findProjectByIdAndMemberId(projectId, memberId);
    Job latestJob = findLatestJobByProjectId(project.getId());

    if (latestJob.getStatus() != JobStatus.FAILED) {
      throw new IllegalArgumentException("FAILED 상태의 작업만 재처리할 수 있습니다.");
    }

    Job savedJob = jobRepository.save(createRetryJobEntity(project, latestJob));

    enqueueJob(project, savedJob);

    return new JobRetryResponse(
        project.getId(),
        savedJob.getId(),
        savedJob.getStatus(),
        project.getStatus(),
        "분석 재처리 요청이 생성되었습니다.");
  }

  private void validateWorkerSecret(String requestWorkerSecret) {
    if (requestWorkerSecret == null || !workerSecret.equals(requestWorkerSecret)) {
      throw new IllegalArgumentException("Worker Secret이 일치하지 않습니다.");
    }
  }

  @Transactional
  public JobCallbackResponse handleCallback(
      Long pathJobId, String requestWorkerSecret, JobCallbackRequest request) {
    validateWorkerSecret(requestWorkerSecret);
    validateCallbackJobId(pathJobId, request.jobId());

    Job job = findJobById(pathJobId);

    switch (request.status()) {
      case RUNNING -> handleRunningCallback(job, request);
      case COMPLETED -> handleCompletedCallback(job, request);
      case FAILED -> handleFailedCallback(job, request);
      default -> throw new IllegalArgumentException("지원하지 않는 작업 상태입니다.");
    }

    return new JobCallbackResponse(job.getId(), true);
  }

  private void validateCallbackJobId(Long pathJobId, Long bodyJobId) {
    if (!pathJobId.equals(bodyJobId)) {
      throw new IllegalArgumentException("URI jobId와 Body jobId가 일치하지 않습니다.");
    }
  }

  private Job findJobById(Long jobId) {
    return jobRepository
        .findById(jobId)
        .orElseThrow(() -> new IllegalArgumentException("작업을 찾을 수 없습니다."));
  }

  private void handleRunningCallback(Job job, JobCallbackRequest request) {
    job.updateRunning(request.progress(), request.currentStage());
    job.getProject().markProcessing();
  }

  private void handleCompletedCallback(Job job, JobCallbackRequest request) {
    job.complete(
        request.progress(), request.currentStage(), request.errorCode(), request.errorMessage());

    jobResultService.deletePreviousResults(job.getId());
    jobResultService.saveSegments(job, request);
    jobResultService.saveOcrItems(job, request);
    saveLearningContents(job, request.learningData());

    job.getProject().markCompleted();
  }

  private void handleFailedCallback(Job job, JobCallbackRequest request) {
    job.fail(
        request.progress(), request.currentStage(), request.errorCode(), request.errorMessage());

    job.getProject().markFailed();
  }

  private void saveLearningContents(Job job, CallbackLearningDataRequest learningData) {
    if (learningData == null || learningData.contents() == null) {
      return;
    }

    List<LearningContent> learningContents =
        learningData.contents().stream()
            .map(
                content ->
                    new LearningContent(
                        job,
                        content.contentType(),
                        content.textType(),
                        content.title(),
                        content.content(),
                        content.startTime(),
                        content.endTime()))
            .toList();

    learningContentRepository.saveAll(learningContents);
  }

  private Project findProjectByIdAndMemberId(Long projectId, Long memberId) {
    return projectRepository
        .findByIdAndMemberId(projectId, memberId)
        .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
  }

  private Job findJobByIdAndMemberId(Long jobId, Long memberId) {
    return jobRepository
        .findByIdAndProjectMemberId(jobId, memberId)
        .orElseThrow(() -> new IllegalArgumentException("작업을 찾을 수 없습니다."));
  }

  private Job findLatestJobByProjectId(Long projectId) {
    return jobRepository
        .findTopByProjectIdOrderByCreatedAtDesc(projectId)
        .orElseThrow(() -> new IllegalArgumentException("재처리할 작업이 없습니다."));
  }

  private Job createJobEntity(Project project, JobCreateRequest request) {
    return new Job(
        project,
        request.jobType(),
        request.sourceLanguage(),
        request.targetLanguage(),
        request.translationProvider());
  }

  private Job createRetryJobEntity(Project project, Job latestJob) {
    return new Job(
        project,
        latestJob.getJobType(),
        latestJob.getSourceLanguage(),
        latestJob.getTargetLanguage(),
        latestJob.getTranslationProvider());
  }

  private void enqueueJob(Project project, Job job) {
    project.updateStatus(ProjectStatus.PROCESSING);

    JobQueuePayload payload = createQueuePayload(project, job);
    jobQueueProducer.enqueue(payload);
  }
}
