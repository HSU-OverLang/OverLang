package com.overlang.domain.job.queue;

import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.SourceType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JobQueuePayloadFactory {

  private final S3UploadService s3UploadService;

  public JobQueuePayload create(Project project, Job job) {
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
}
