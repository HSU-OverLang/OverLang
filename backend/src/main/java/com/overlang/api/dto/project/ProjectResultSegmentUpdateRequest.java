package com.overlang.api.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ProjectResultSegmentUpdateRequest(
    @NotNull(message = "segmentId는 필수입니다.") Long segmentId,
    @NotBlank(message = "translatedText는 필수입니다.") String translatedText) {}
