package com.overlang.api.dto.job;

import com.overlang.api.dto.ocr.BoundingBoxRequest;
import com.overlang.api.dto.ocr.OcrItemLineRequest;
import com.overlang.api.dto.ocr.OcrStyleRequest;
import java.util.List;

public record CallbackOcrItemRequest(
    Double startTime,
    Double endTime,
    String originText,
    String translatedText,
    BoundingBoxRequest boundingBox,
    Double confidence,
    List<OcrItemLineRequest> lines,
    OcrStyleRequest style) {}
