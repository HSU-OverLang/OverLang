package com.overlang.domain.job.queue;

import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.JobType;
import com.overlang.domain.job.entity.TranslationProvider;
import com.overlang.domain.project.entity.SourceType;
import java.util.List;

public record JobQueuePayload(
    Long jobId,
    Long projectId,
    Long memberId,
    SourceType sourceType,
    String sourceUrl,
    String fileKey,
    String presignedUrl,
    JobType jobType,
    LanguageCode sourceLanguage,
    LanguageCode targetLanguage,
    TranslationProvider translationProvider,
    List<SegmentPayload> segments,
    List<OcrItemPayload> ocrItems) {
  public record SegmentPayload(Integer seq, Double startTime, Double endTime, String text) {}

  public record OcrItemPayload(
      Double startTime, Double endTime, String originText, BoundingBoxPayload boundingBox) {}

  public record BoundingBoxPayload(Double x, Double y, Double width, Double height) {}
}
