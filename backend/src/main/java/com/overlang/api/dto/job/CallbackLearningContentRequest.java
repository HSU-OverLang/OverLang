package com.overlang.api.dto.job;

import com.overlang.domain.learning.entity.LearningContentType;
import com.overlang.domain.word.entity.SelectedTextType;

public record CallbackLearningContentRequest(
    LearningContentType contentType,
    SelectedTextType textType,
    String title,
    String content,
    Double startTime,
    Double endTime) {}
