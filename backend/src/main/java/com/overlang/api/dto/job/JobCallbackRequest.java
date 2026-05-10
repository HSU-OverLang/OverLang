package com.overlang.api.dto.job;

import com.overlang.domain.job.entity.CurrentStage;
import com.overlang.domain.job.entity.JobStatus;
import java.util.List;

public record JobCallbackRequest(
    Long jobId,
    JobStatus status,
    Integer progress,
    CurrentStage currentStage,
    List<CallbackSegmentRequest> segments,
    List<CallbackOcrItemRequest> ocrItems,
    Object learningData,
    String errorCode,
    String errorMessage) {}
