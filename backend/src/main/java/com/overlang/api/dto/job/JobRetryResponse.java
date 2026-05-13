package com.overlang.api.dto.job;

import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.project.entity.ProjectStatus;

public record JobRetryResponse(
    Long projectId, Long jobId, JobStatus jobStatus, ProjectStatus projectStatus, String message) {}
