package com.overlang.domain.job.service;

import com.overlang.api.dto.job.JobCallbackRequest;
import com.overlang.api.dto.job.JobCallbackResponse;
import com.overlang.api.dto.job.JobCreateRequest;
import com.overlang.api.dto.job.JobCreateResponse;
import com.overlang.api.dto.job.JobDetailResponse;
import com.overlang.api.dto.job.JobResponse;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.queue.JobQueuePayload;
import com.overlang.domain.job.queue.JobQueueProducer;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.ocr.entity.OcrItem;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.repository.SegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobService {

  private final ProjectRepository projectRepository;
  private final JobRepository jobRepository;
  private final S3UploadService s3UploadService;
  private final JobQueueProducer jobQueueProducer;
  private final SegmentRepository segmentRepository;
  private final OcrItemRepository ocrItemRepository;

  @Value("${worker.secret}")
  private String workerSecret;

  @Transactional
  public JobCreateResponse createJob(Long projectId, Long memberId, JobCreateRequest request) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));

    validateJobCreateRequest(request);

    Job job =
        new Job(
            project,
            request.jobType(),
            request.sourceLanguage(),
            request.targetLanguage(),
            request.translationProvider(),
            request.useUserApiKey());

    Job savedJob = jobRepository.save(job);

    project.updateStatus(ProjectStatus.PROCESSING);

    JobQueuePayload payload = createQueuePayload(project, savedJob);

    jobQueueProducer.enqueue(payload);

    return JobCreateResponse.from(savedJob);
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
            job.getTranslationProvider(),
            job.getUseUserApiKey());
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
              job.getTranslationProvider(),
              job.getUseUserApiKey());
    };
  }

  @Transactional(readOnly = true)
  public List<JobResponse> getJobsByProject(Long projectId, Long memberId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));

    return jobRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()).stream()
        .map(JobResponse::from)
        .toList();
  }

  @Transactional(readOnly = true)
  public JobDetailResponse getJobDetail(Long jobId, Long memberId) {
    Job job =
        jobRepository
            .findByIdAndProjectMemberId(jobId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("작업을 찾을 수 없습니다."));

    return JobDetailResponse.from(job);
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

    saveSegments(job, request);
    saveOcrItems(job, request);

    job.getProject().markCompleted();
  }

  private void handleFailedCallback(Job job, JobCallbackRequest request) {
    job.fail(
        request.progress(), request.currentStage(), request.errorCode(), request.errorMessage());

    job.getProject().markFailed();
  }

  private void saveSegments(Job job, JobCallbackRequest request) {
    if (request.segments() == null) return;

    List<Segment> segments =
        request.segments().stream()
            .map(
                s ->
                    new Segment(
                        job,
                        s.startTime(),
                        s.endTime(),
                        s.seq(),
                        s.text(),
                        s.translatedText(),
                        s.languageCode()))
            .toList();

    segmentRepository.saveAll(segments);
  }

  private void saveOcrItems(Job job, JobCallbackRequest request) {
    if (request.ocrItems() == null) return;

    List<OcrItem> ocrItems =
        request.ocrItems().stream()
            .map(
                o ->
                    new OcrItem(
                        job,
                        o.startTime(),
                        o.endTime(),
                        o.originText(),
                        o.translatedText(),
                        o.boundingBox().x(),
                        o.boundingBox().y(),
                        o.boundingBox().w(),
                        o.boundingBox().h(),
                        o.confidence()))
            .toList();

    ocrItemRepository.saveAll(ocrItems);
  }
}
