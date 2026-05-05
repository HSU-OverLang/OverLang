package com.overlang.api.controller;

import com.overlang.api.dto.ocr.OcrItemResponse;
import com.overlang.api.dto.segment.SegmentResponse;
import com.overlang.domain.job.service.JobResultService;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/jobs")
public class JobResultController {

  private final JobResultService jobResultService;

  @Operation(summary = "세그먼트 조회", description = "특정 Job의 STT 세그먼트를 조회합니다.")
  @GetMapping("/{jobId}/segments")
  public ApiResponse<List<SegmentResponse>> getSegments(@PathVariable Long jobId) {
    List<SegmentResponse> result = jobResultService.getSegments(jobId);
    return ApiResponse.success(result);
  }

  @Operation(summary = "OCR 결과 조회", description = "특정 Job의 OCR 결과를 조회합니다.")
  @GetMapping("/{jobId}/ocr-items")
  public ApiResponse<List<OcrItemResponse>> getOcrItems(@PathVariable Long jobId) {
    List<OcrItemResponse> result = jobResultService.getOcrItems(jobId);
    return ApiResponse.success(result);
  }
}
