package com.overlang.domain.job.queue;

import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.entity.TranslationProvider;
import com.overlang.domain.project.entity.SourceType;

public record JobQueuePayload(
    Long jobId,
    Long projectId,
    SourceType sourceType,
    String sourceUrl,
    String fileKey,
    String presignedUrl,
    JobType jobType,
    LanguageCode sourceLanguage,
    LanguageCode targetLanguage,
    TranslationProvider translationProvider,
    Boolean useUserApiKey) {}
