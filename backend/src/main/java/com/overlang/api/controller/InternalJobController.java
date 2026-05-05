package com.overlang.api.controller;

import com.overlang.api.dto.job.JobCallbackRequest;
import com.overlang.api.dto.job.JobCallbackResponse;
import com.overlang.domain.job.service.JobService;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/internal/jobs")
public class InternalJobController {

  private final JobService jobService;

  @Operation(
      summary = "AI 작업 콜백 처리",
      description = "AI Worker가 작업 상태(RUNNING, COMPLETED, FAILED) 및 결과 데이터를 BE로 전달하는 내부 API입니다.")
  @PostMapping("/{jobId}/callback")
  public ApiResponse<JobCallbackResponse> handleCallback(
      @PathVariable Long jobId,
      @RequestHeader("X-Worker-Secret") String requestWorkerSecret,
      @RequestBody JobCallbackRequest request) {

    JobCallbackResponse response = jobService.handleCallback(jobId, requestWorkerSecret, request);

    return ApiResponse.success(response);
  }
}
