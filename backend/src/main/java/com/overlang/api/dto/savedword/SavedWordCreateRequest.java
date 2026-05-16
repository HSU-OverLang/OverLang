package com.overlang.api.dto.savedword;

public record SavedWordCreateRequest(
    Long segmentWordId,
    String word,
    String meaning,
    String contextMeaning,
    String memo,
    boolean matchedExpression) {}
