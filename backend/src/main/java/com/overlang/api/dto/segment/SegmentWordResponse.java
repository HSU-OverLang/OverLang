package com.overlang.api.dto.segment;

import com.overlang.domain.segment.entity.SegmentWord;

public record SegmentWordResponse(
    Long segmentWordId, Integer seq, String word, Double startTime, Double endTime) {

  public static SegmentWordResponse from(SegmentWord segmentWord) {
    return new SegmentWordResponse(
        segmentWord.getId(),
        segmentWord.getSeq(),
        segmentWord.getWord(),
        segmentWord.getStartTime(),
        segmentWord.getEndTime());
  }
}
