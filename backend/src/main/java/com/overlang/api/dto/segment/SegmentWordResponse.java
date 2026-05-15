package com.overlang.api.dto.segment;

import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.word.entity.SelectedTextType;

public record SegmentWordResponse(
    Long segmentWordId,
    Integer seq,
    String word,
    SelectedTextType selectedTextType,
    Double startTime,
    Double endTime) {

  public static SegmentWordResponse from(SegmentWord segmentWord) {
    return new SegmentWordResponse(
        segmentWord.getId(),
        segmentWord.getSeq(),
        segmentWord.getWord(),
        SelectedTextType.valueOf(segmentWord.getWordType().name()),
        segmentWord.getStartTime(),
        segmentWord.getEndTime());
  }
}
