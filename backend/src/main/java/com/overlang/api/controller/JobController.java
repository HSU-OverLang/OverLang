package com.overlang.api.controller;

import com.overlang.api.dto.job.JobCreateRequest;
import com.overlang.api.dto.job.JobCreateResponse;
import com.overlang.api.dto.job.JobDetailResponse;
import com.overlang.api.dto.job.JobResponse;
import com.overlang.api.dto.job.JobRetryResponse;
import com.overlang.domain.job.service.JobService;
import com.overlang.global.auth.AuthInterceptor;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class JobController {

  private final JobService jobService;

  @Operation(summary = "AI 작업 생성", description = "프로젝트에 대한 AI 처리 작업을 생성하고 Redis Queue에 등록합니다.")
  @PostMapping("/projects/{projectId}/jobs")
  public ApiResponse<JobCreateResponse> createJob(
      @PathVariable Long projectId,
      @RequestBody JobCreateRequest request,
      HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    JobCreateResponse response = jobService.createJob(projectId, memberId, request);

    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 작업 목록 조회", description = "프로젝트에 속한 AI 작업 목록을 조회합니다.")
  @GetMapping("/projects/{projectId}/jobs")
  public ApiResponse<List<JobResponse>> getJobsByProject(
      @PathVariable Long projectId, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    List<JobResponse> response = jobService.getJobsByProject(projectId, memberId);

    return ApiResponse.success(response);
  }

  @Operation(summary = "작업 상태 조회", description = "특정 AI 작업의 상태 및 진행 단계를 조회합니다.")
  @GetMapping("/jobs/{jobId}")
  public ApiResponse<JobDetailResponse> getJobDetail(
      @PathVariable Long jobId, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    JobDetailResponse response = jobService.getJobDetail(jobId, memberId);

    return ApiResponse.success(response);
  }

  @Operation(summary = "분석 작업 재처리", description = "FAILED 상태의 최신 AI 작업을 동일 프로젝트 기준으로 재처리합니다.")
  @PostMapping("/projects/{projectId}/jobs/retry")
  public ApiResponse<JobRetryResponse> retryJob(
      @PathVariable Long projectId, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    JobRetryResponse response = jobService.retryJob(projectId, memberId);

    return ApiResponse.success(response);
  }
}
