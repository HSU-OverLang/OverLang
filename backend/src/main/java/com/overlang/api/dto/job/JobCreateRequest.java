package com.overlang.api.dto.job;

import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.entity.TranslationProvider;

public record JobCreateRequest(
    JobType jobType,
    LanguageCode sourceLanguage,
    LanguageCode targetLanguage,
    TranslationProvider translationProvider,
    Boolean useUserApiKey) {}
