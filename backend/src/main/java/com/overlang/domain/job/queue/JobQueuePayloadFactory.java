package com.overlang.domain.job.queue;

import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.segment.repository.SegmentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JobQueuePayloadFactory {

  private final S3UploadService s3UploadService;
  private final SegmentRepository segmentRepository;
  private final OcrItemRepository ocrItemRepository;
  private final JobRepository jobRepository;

  public JobQueuePayload create(Project project, Job job) {
    SourceType sourceType = project.getSourceType();

    Job baseJob = findBaseJobIfTranslationOnly(project, job);

    List<JobQueuePayload.SegmentPayload> segments = createSegmentPayloads(baseJob);
    List<JobQueuePayload.OcrItemPayload> ocrItems = createOcrItemPayloads(baseJob);

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
            segments,
            ocrItems);
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
              segments,
              ocrItems);
    };
  }

  private Job findBaseJobIfTranslationOnly(Project project, Job job) {
    if (job.getJobType() != JobType.TRANSLATION_ONLY) {
      return null;
    }

    return jobRepository
        .findTopByProjectIdAndStatusOrderByCreatedAtDesc(project.getId(), JobStatus.COMPLETED)
        .orElseThrow(() -> new IllegalStateException("TRANSLATION_ONLY 기준 COMPLETED Job이 없습니다."));
  }

  private List<JobQueuePayload.SegmentPayload> createSegmentPayloads(Job baseJob) {
    if (baseJob == null) {
      return List.of();
    }

    return segmentRepository.findByJobIdOrderBySeqAsc(baseJob.getId()).stream()
        .map(
            segment ->
                new JobQueuePayload.SegmentPayload(
                    segment.getSeq(),
                    segment.getStartTime(),
                    segment.getEndTime(),
                    segment.getText()))
        .toList();
  }

  private List<JobQueuePayload.OcrItemPayload> createOcrItemPayloads(Job baseJob) {
    if (baseJob == null) {
      return List.of();
    }

    return ocrItemRepository.findByJobIdOrderByStartTimeAsc(baseJob.getId()).stream()
        .map(
            ocrItem ->
                new JobQueuePayload.OcrItemPayload(
                    ocrItem.getStartTime(),
                    ocrItem.getEndTime(),
                    ocrItem.getOriginText(),
                    new JobQueuePayload.BoundingBoxPayload(
                        ocrItem.getX(), ocrItem.getY(), ocrItem.getW(), ocrItem.getH())))
        .toList();
  }
}
