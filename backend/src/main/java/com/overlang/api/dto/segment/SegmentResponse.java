package com.overlang.api.dto.segment;

import com.overlang.domain.segment.entity.Segment;

public record SegmentResponse(
    Long segmentId,
    Long jobId,
    Integer seq,
    Double startTime,
    Double endTime,
    String text,
    String translatedText,
    String languageCode) {

  public static SegmentResponse from(Segment segment) {
    return new SegmentResponse(
        segment.getId(),
        segment.getJob().getId(),
        segment.getSeq(),
        segment.getStartTime(),
        segment.getEndTime(),
        segment.getText(),
        segment.getTranslatedText(),
        segment.getLanguageCode());
  }
}
