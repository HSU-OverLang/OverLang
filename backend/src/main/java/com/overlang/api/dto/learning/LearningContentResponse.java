package com.overlang.api.dto.learning;

import com.overlang.domain.learning.entity.LearningContent;
import com.overlang.domain.word.entity.SelectedTextType;

public record LearningContentResponse(
    Long learningContentId,
    SelectedTextType textType,
    String title,
    String content,
    Double startTime,
    Double endTime) {

  public static LearningContentResponse from(LearningContent learningContent) {
    return new LearningContentResponse(
        learningContent.getId(),
        learningContent.getTextType(),
        learningContent.getTitle(),
        learningContent.getContent(),
        learningContent.getStartTime(),
        learningContent.getEndTime());
  }
}
