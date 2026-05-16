package com.overlang.api.dto.learning;

import com.overlang.domain.learning.entity.LearningContent;

public record LearningContentResponse(
    Long learningContentId, String title, String content, Double startTime, Double endTime) {

  public static LearningContentResponse from(LearningContent learningContent) {
    return new LearningContentResponse(
        learningContent.getId(),
        learningContent.getTitle(),
        learningContent.getContent(),
        learningContent.getStartTime(),
        learningContent.getEndTime());
  }
}
