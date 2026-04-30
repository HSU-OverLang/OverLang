package com.overlang.api.dto.job;

import java.time.Instant;
import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.CurrentStage;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.entity.TranslationProvider;
import java.time.LocalDateTime;

public record JobCreateResponse(
        Long jobId,
        Long projectId,
        JobType jobType,
        JobStatus status,
        Integer progress,
        CurrentStage currentStage,
        LanguageCode sourceLanguage,
        LanguageCode targetLanguage,
        TranslationProvider translationProvider,
        Boolean useUserApiKey,
        String errorCode,
        String errorMessage,
        Instant createdAt
) {

    public static JobCreateResponse from(Job job) {
        return new JobCreateResponse(
                job.getId(),
                job.getProject().getId(),
                job.getJobType(),
                job.getStatus(),
                job.getProgress(),
                job.getCurrentStage(),
                job.getSourceLanguage(),
                job.getTargetLanguage(),
                job.getTranslationProvider(),
                job.getUseUserApiKey(),
                job.getErrorCode(),
                job.getErrorMessage(),
                job.getCreatedAt()
        );
    }
}