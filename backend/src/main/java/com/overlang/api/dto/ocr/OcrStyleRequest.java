package com.overlang.api.dto.ocr;

public record OcrStyleRequest(
    String backgroundColor,
    String dominantBackgroundColor,
    String textColor,
    BlurRegionRequest blurRegion) {}
