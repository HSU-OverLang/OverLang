package com.overlang.api.controller;

import com.overlang.api.dto.job.JobCreateRequest;
import com.overlang.api.dto.job.JobCreateResponse;
import com.overlang.domain.job.service.JobService;
import com.overlang.global.auth.AuthInterceptor;
import com.overlang.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class JobController {

  private final JobService jobService;

  @PostMapping("/projects/{projectId}/jobs")
  public ApiResponse<JobCreateResponse> createJob(
      @PathVariable Long projectId,
      @RequestBody JobCreateRequest request,
      HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    JobCreateResponse response = jobService.createJob(projectId, memberId, request);

    return ApiResponse.success(response);
  }
}
