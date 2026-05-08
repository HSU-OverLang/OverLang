package com.overlang.api.dto.ocr;

import com.overlang.domain.ocr.entity.OcrItem;

public record OcrItemResponse(
    Long ocrItemId,
    Long jobId,
    Double startTime,
    Double endTime,
    String originText,
    String translatedText,
    BoundingBoxResponse boundingBox,
    Double confidence) {

  public static OcrItemResponse from(OcrItem ocrItem) {
    return new OcrItemResponse(
        ocrItem.getId(),
        ocrItem.getJob().getId(),
        ocrItem.getStartTime(),
        ocrItem.getEndTime(),
        ocrItem.getOriginText(),
        ocrItem.getTranslatedText(),
        new BoundingBoxResponse(ocrItem.getX(), ocrItem.getY(), ocrItem.getW(), ocrItem.getH()),
        ocrItem.getConfidence());
  }
}
