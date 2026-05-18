package com.overlang.domain.job.service;

import com.overlang.api.dto.job.*;
import com.overlang.api.dto.ocr.BlurRegionRequest;
import com.overlang.api.dto.ocr.OcrStyleRequest;
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
import com.overlang.domain.ocr.entity.OcrItem;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.entity.SegmentWordType;
import com.overlang.domain.segment.repository.SegmentRepository;
import com.overlang.domain.segment.repository.SegmentWordRepository;
import java.util.ArrayList;
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
  private final SegmentRepository segmentRepository;
  private final SegmentWordRepository segmentWordRepository;
  private final OcrItemRepository ocrItemRepository;
  private final ResultCacheService resultCacheService;
  private final ResultCopyService resultCopyService;
  private final LearningContentRepository learningContentRepository;
  private final SavedWordRepository savedWordRepository;

  @Value("${worker.secret}")
  private String workerSecret;

  @Transactional
  public JobCreateResponse createJob(Long projectId, Long memberId, JobCreateRequest request) {
    Project project = findProjectByIdAndMemberId(projectId, memberId);

    validateJobCreateRequest(request);

    Job job =
        new Job(
            project,
            request.jobType(),
            request.sourceLanguage(),
            request.targetLanguage(),
            request.translationProvider());

    Job savedJob = jobRepository.save(job);

    var reusableJob = resultCacheService.findReusableJob(project, request);

    if (reusableJob.isPresent()) {
      resultCopyService.copyResults(reusableJob.get(), savedJob);
      savedJob.complete(100, CurrentStage.FINALIZING, null, null);
      project.markCompleted();

      return JobCreateResponse.from(savedJob, true);
    }

    project.updateStatus(ProjectStatus.PROCESSING);

    JobQueuePayload payload = createQueuePayload(project, savedJob);
    jobQueueProducer.enqueue(payload);

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

    Job retryJob =
        new Job(
            project,
            latestJob.getJobType(),
            latestJob.getSourceLanguage(),
            latestJob.getTargetLanguage(),
            latestJob.getTranslationProvider());

    Job savedJob = jobRepository.save(retryJob);

    project.updateStatus(ProjectStatus.PROCESSING);

    JobQueuePayload payload = createQueuePayload(project, savedJob);
    jobQueueProducer.enqueue(payload);

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

    deletePreviousResults(job.getId());
    saveSegments(job, request);
    saveOcrItems(job, request);
    saveLearningContents(job, request.learningData());

    job.getProject().markCompleted();
  }

  private void deletePreviousResults(Long jobId) {
    savedWordRepository.deleteByJobId(jobId);
    segmentWordRepository.deleteBySegmentJobId(jobId);
    segmentRepository.deleteByJobId(jobId);
    ocrItemRepository.deleteByJobId(jobId);
    learningContentRepository.deleteByJobId(jobId);
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

    List<Segment> savedSegments = segmentRepository.saveAll(segments);

    createSegmentWords(savedSegments);
  }

  private void saveOcrItems(Job job, JobCallbackRequest request) {
    if (request.ocrItems() == null) return;

    List<OcrItem> ocrItems = request.ocrItems().stream().map(o -> toOcrItem(job, o)).toList();

    ocrItemRepository.saveAll(ocrItems);
  }

  private OcrItem toOcrItem(Job job, CallbackOcrItemRequest o) {
    OcrStyleRequest style = o.style();
    BlurRegionRequest blurRegion = style != null ? style.blurRegion() : null;

    return new OcrItem(
        job,
        o.startTime(),
        o.endTime(),
        o.originText(),
        o.translatedText(),
        o.boundingBox().x(),
        o.boundingBox().y(),
        o.boundingBox().w(),
        o.boundingBox().h(),
        o.confidence(),
        style != null ? style.backgroundColor() : null,
        style != null ? style.dominantBackgroundColor() : null,
        style != null ? style.textColor() : null,
        blurRegion != null ? blurRegion.x() : null,
        blurRegion != null ? blurRegion.y() : null,
        blurRegion != null ? blurRegion.w() : null,
        blurRegion != null ? blurRegion.h() : null);
  }

  private void createSegmentWords(List<Segment> segments) {
    List<SegmentWord> segmentWords =
        segments.stream().flatMap(segment -> createSegmentWords(segment).stream()).toList();

    segmentWordRepository.saveAll(segmentWords);
  }

  private List<SegmentWord> createSegmentWords(Segment segment) {
    List<SegmentWord> words = new ArrayList<>();

    words.addAll(createSegmentWords(segment, segment.getText(), SegmentWordType.ORIGINAL));

    words.addAll(
        createSegmentWords(segment, segment.getTranslatedText(), SegmentWordType.TRANSLATION));

    return words;
  }

  private List<SegmentWord> createSegmentWords(
      Segment segment, String text, SegmentWordType wordType) {
    if (text == null || text.isBlank()) {
      return List.of();
    }

    String[] words = text.split(WORD_SPLIT_REGEX);
    List<SegmentWord> segmentWords = new ArrayList<>();

    for (int i = 0; i < words.length; i++) {
      segmentWords.add(
          new SegmentWord(
              segment, i + 1, segment.getStartTime(), segment.getEndTime(), words[i], wordType));
    }

    return segmentWords;
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
}
