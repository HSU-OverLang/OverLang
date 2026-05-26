package com.overlang.api.dto.ocr;

public record OcrItemLineRequest(String originText, BoundingBoxRequest boundingBox) {}
