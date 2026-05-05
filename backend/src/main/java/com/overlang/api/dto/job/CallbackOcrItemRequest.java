package com.overlang.api.dto.job;

public record CallbackOcrItemRequest(
    Double startTime,
    Double endTime,
    String originText,
    String translatedText,
    BoundingBoxRequest boundingBox,
    Double confidence) {}
