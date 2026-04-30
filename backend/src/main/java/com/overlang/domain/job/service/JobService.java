package com.overlang.domain.job.service;

import com.overlang.api.dto.job.JobCreateRequest;
import com.overlang.api.dto.job.JobCreateResponse;
import com.overlang.api.dto.job.JobDetailResponse;
import com.overlang.api.dto.job.JobResponse;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.queue.JobQueuePayload;
import com.overlang.domain.job.queue.JobQueueProducer;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobService {

  private final ProjectRepository projectRepository;
  private final JobRepository jobRepository;
  private final S3UploadService s3UploadService;
  private final JobQueueProducer jobQueueProducer;

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
    if (request.jobType() == null) {
      throw new IllegalArgumentException("jobType은 필수입니다.");
    }

    if (request.sourceLanguage() == null) {
      throw new IllegalArgumentException("sourceLanguage는 필수입니다.");
    }

    if (request.targetLanguage() == null) {
      throw new IllegalArgumentException("targetLanguage는 필수입니다.");
    }

    if (request.sourceLanguage() == request.targetLanguage()) {
      throw new IllegalArgumentException("sourceLanguage와 targetLanguage는 같을 수 없습니다.");
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
}
