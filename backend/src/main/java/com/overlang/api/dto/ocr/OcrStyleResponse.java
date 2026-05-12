package com.overlang.api.dto.ocr;

public record OcrStyleResponse(
    String backgroundColor,
    String dominantBackgroundColor,
    String textColor,
    BlurRegionResponse blurRegion) {}
