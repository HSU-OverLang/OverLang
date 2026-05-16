package com.overlang.api.dto.learning;

import java.util.List;

public record LearningContentsResponse(
    Long jobId,
    LearningContentResponse summary,
    List<LearningContentResponse> keywords,
    List<LearningContentResponse> expressions) {}
