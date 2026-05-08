package com.overlang.api.dto.job;

import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.CurrentStage;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.entity.TranslationProvider;
import java.time.Instant;

public record JobDetailResponse(
    Long jobId,
    Long projectId,
    JobType jobType,
    JobStatus status,
    Integer progress,
    CurrentStage currentStage,
    LanguageCode sourceLanguage,
    LanguageCode targetLanguage,
    TranslationProvider translationProvider,
    String errorCode,
    String errorMessage,
    Instant createdAt,
    Instant updatedAt) {

  public static JobDetailResponse from(Job job) {
    return new JobDetailResponse(
        job.getId(),
        job.getProject().getId(),
        job.getJobType(),
        job.getStatus(),
        job.getProgress(),
        job.getCurrentStage(),
        job.getSourceLanguage(),
        job.getTargetLanguage(),
        job.getTranslationProvider(),
        job.getErrorCode(),
        job.getErrorMessage(),
        job.getCreatedAt(),
        job.getUpdatedAt());
  }
}
