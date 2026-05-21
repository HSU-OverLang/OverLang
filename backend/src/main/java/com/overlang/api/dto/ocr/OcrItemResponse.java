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
    Double confidence,
    OcrStyleResponse style) {

  public static OcrItemResponse from(OcrItem ocrItem) {
    return new OcrItemResponse(
        ocrItem.getId(),
        ocrItem.getJob().getId(),
        ocrItem.getStartTime(),
        ocrItem.getEndTime(),
        ocrItem.getOriginText(),
        ocrItem.getTranslatedText(),
        new BoundingBoxResponse(ocrItem.getX(), ocrItem.getY(), ocrItem.getW(), ocrItem.getH()),
        ocrItem.getConfidence(),
        new OcrStyleResponse(
            ocrItem.getBackgroundColor(),
            ocrItem.getDominantBackgroundColor(),
            ocrItem.getTextColor(),
            ocrItem.getFontSizeRatio(),
            ocrItem.getFontWeight(),
            ocrItem.getTextAlign(),
            new BlurRegionResponse(
                ocrItem.getBlurX(), ocrItem.getBlurY(), ocrItem.getBlurW(), ocrItem.getBlurH()),
            ocrItem.getAnimationType() != null
                ? new AnimationResponse(
                    ocrItem.getAnimationType(),
                    ocrItem.getAnimationStartTime(),
                    ocrItem.getAnimationEndTime())
                : null));
  }
}
