package com.overlang.api.dto.savedword;

import com.overlang.domain.savedword.entity.SavedWord;
import java.time.Instant;

public record SavedWordResponse(
    Long savedWordId,
    Long segmentWordId,
    String word,
    String meaning,
    String contextMeaning,
    String memo,
    Double startTime,
    Double endTime,
    String originalSentence,
    String translatedSentence,
    Long projectId,
    String projectTitle,
    Instant createdAt) {

  public static SavedWordResponse from(SavedWord savedWord) {
    var segmentWord = savedWord.getSegmentWord();
    var segment = segmentWord.getSegment();
    var job = segment.getJob();
    var project = job.getProject();

    return new SavedWordResponse(
        savedWord.getId(),
        segmentWord.getId(),
        segmentWord.getWord(),
        savedWord.getMeaning(),
        savedWord.getContextMeaning(),
        savedWord.getMemo(),
        segmentWord.getStartTime(),
        segmentWord.getEndTime(),
        segment.getText(),
        segment.getTranslatedText(),
        project.getId(),
        project.getTitle(),
        savedWord.getCreatedAt());
  }
}
