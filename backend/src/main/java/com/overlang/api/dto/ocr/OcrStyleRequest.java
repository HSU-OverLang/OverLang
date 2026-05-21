package com.overlang.api.dto.ocr;

public record OcrStyleRequest(
    String backgroundColor,
    String dominantBackgroundColor,
    String textColor,
    Double fontSizeRatio,
    String fontWeight,
    String textAlign,
    BlurRegionRequest blurRegion,
    AnimationRequest animation) {}
