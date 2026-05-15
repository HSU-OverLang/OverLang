package com.overlang.api.dto.project;

import java.util.List;

public record ProjectResultUpdateResponse(
    Long projectId, List<ProjectResultSegmentResponse> segments) {}
