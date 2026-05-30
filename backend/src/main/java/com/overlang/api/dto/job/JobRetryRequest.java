package com.overlang.api.dto.job;

import com.overlang.domain.job.entity.JobType;

public record JobRetryRequest(JobType jobType) {}
