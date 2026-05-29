package com.overlang.domain.ocr.service;

import com.overlang.api.dto.job.CallbackOcrItemRequest;
import com.overlang.api.dto.ocr.BlurRegionRequest;
import com.overlang.api.dto.ocr.OcrStyleRequest;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.ocr.entity.OcrItem;
import com.overlang.domain.ocr.entity.OcrItemLine;
import org.springframework.stereotype.Component;

@Component
public class OcrItemFactory {

  public OcrItem create(Job job, CallbackOcrItemRequest request) {
    OcrStyleRequest style = request.style();
    BlurRegionRequest blurRegion = style != null ? style.blurRegion() : null;

    OcrItem ocrItem =
        new OcrItem(
            job,
            request.startTime(),
            request.endTime(),
            request.originText(),
            request.translatedText(),
            request.boundingBox().x(),
            request.boundingBox().y(),
            request.boundingBox().w(),
            request.boundingBox().h(),
            request.confidence(),
            style != null ? style.backgroundColor() : null,
            style != null ? style.dominantBackgroundColor() : null,
            style != null ? style.textColor() : null,
            blurRegion != null ? blurRegion.x() : null,
            blurRegion != null ? blurRegion.y() : null,
            blurRegion != null ? blurRegion.w() : null,
            blurRegion != null ? blurRegion.h() : null,
            style != null ? style.fontSizeRatio() : null,
            style != null ? style.fontWeight() : null,
            style != null ? style.textAlign() : null,
            getAnimationType(style),
            getAnimationStartTime(style),
            getAnimationEndTime(style));

    addLines(ocrItem, request);

    return ocrItem;
  }

  private void addLines(OcrItem ocrItem, CallbackOcrItemRequest request) {
    if (request.lines() == null) {
      return;
    }

    for (int i = 0; i < request.lines().size(); i++) {
      var lineRequest = request.lines().get(i);

      if (lineRequest.boundingBox() == null) {
        continue;
      }

      OcrItemLine line =
          OcrItemLine.create(
              ocrItem,
              i + 1,
              lineRequest.originText(),
              lineRequest.boundingBox().x(),
              lineRequest.boundingBox().y(),
              lineRequest.boundingBox().w(),
              lineRequest.boundingBox().h());

      ocrItem.addLine(line);
    }
  }

  private boolean hasAnimation(OcrStyleRequest style) {
    return style != null && style.animation() != null;
  }

  private String getAnimationType(OcrStyleRequest style) {
    return hasAnimation(style) ? style.animation().type() : null;
  }

  private Double getAnimationStartTime(OcrStyleRequest style) {
    return hasAnimation(style) ? style.animation().startTime() : null;
  }

  private Double getAnimationEndTime(OcrStyleRequest style) {
    return hasAnimation(style) ? style.animation().endTime() : null;
  }
}
