package com.overlang.api.dto.job;

import com.overlang.api.dto.ocr.BoundingBoxRequest;
import com.overlang.api.dto.ocr.OcrStyleRequest;

public record CallbackOcrItemRequest(
    Double startTime,
    Double endTime,
    String originText,
    String translatedText,
    BoundingBoxRequest boundingBox,
    Double confidence,
    OcrStyleRequest style) {}
