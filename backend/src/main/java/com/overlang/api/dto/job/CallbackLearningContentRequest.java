package com.overlang.api.dto.job;

import com.overlang.domain.learning.entity.LearningContentType;

public record CallbackLearningContentRequest(
    LearningContentType contentType,
    String title,
    String content,
    Double startTime,
    Double endTime) {}
