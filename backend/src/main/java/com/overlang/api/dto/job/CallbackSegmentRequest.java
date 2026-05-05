package com.overlang.api.dto.job;

public record CallbackSegmentRequest(
    Integer seq,
    Double startTime,
    Double endTime,
    String text,
    String translatedText,
    String languageCode) {}
