package com.overlang.api.dto.savedword;

public record SavedWordCreateRequest(
    Long segmentWordId, String meaning, String contextMeaning, String memo) {}
