package com.overlang.api.dto.project;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ProjectResultUpdateRequest(
        @Valid @NotEmpty(message = "segments는 비어 있을 수 없습니다.")
        List<ProjectResultSegmentUpdateRequest> segments) {}