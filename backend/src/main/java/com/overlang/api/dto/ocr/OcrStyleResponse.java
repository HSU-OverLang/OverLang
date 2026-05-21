package com.overlang.api.dto.ocr;

public record OcrStyleResponse(
    String backgroundColor,
    String dominantBackgroundColor,
    String textColor,
    Double fontSizeRatio,
    String fontWeight,
    String textAlign,
    BlurRegionResponse blurRegion,
    AnimationResponse animation) {}
