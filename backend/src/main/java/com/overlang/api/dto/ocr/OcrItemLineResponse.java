package com.overlang.api.dto.ocr;

import com.overlang.domain.ocr.entity.OcrItemLine;

public record OcrItemLineResponse(String originText, BoundingBoxResponse boundingBox) {

  public static OcrItemLineResponse from(OcrItemLine line) {
    return new OcrItemLineResponse(
        line.getOriginText(),
        new BoundingBoxResponse(line.getX(), line.getY(), line.getW(), line.getH()));
  }
}
