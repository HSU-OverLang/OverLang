package com.overlang.api.controller;

import com.overlang.api.dto.learning.LearningContentsResponse;
import com.overlang.api.dto.ocr.OcrItemResponse;
import com.overlang.api.dto.segment.SegmentResponse;
import com.overlang.domain.job.service.JobResultService;
import com.overlang.domain.learning.service.LearningContentService;
import com.overlang.global.auth.AuthInterceptor;
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
  private final LearningContentService learningContentService;

  @Operation(summary = "세그먼트 조회", description = "특정 Job의 STT 세그먼트를 조회합니다.")
  @GetMapping("/{jobId}/segments")
  public ApiResponse<List<SegmentResponse>> getSegments(
      @PathVariable Long jobId, @RequestAttribute(AuthInterceptor.AUTH_MEMBER_ID) Long memberId) {
    List<SegmentResponse> result = jobResultService.getSegments(jobId, memberId);
    return ApiResponse.success(result);
  }

  @Operation(summary = "OCR 결과 조회", description = "특정 Job의 OCR 결과를 조회합니다.")
  @GetMapping("/{jobId}/ocr-items")
  public ApiResponse<List<OcrItemResponse>> getOcrItems(
      @PathVariable Long jobId, @RequestAttribute(AuthInterceptor.AUTH_MEMBER_ID) Long memberId) {
    List<OcrItemResponse> result = jobResultService.getOcrItems(jobId, memberId);
    return ApiResponse.success(result);
  }

  @Operation(
      summary = "학습 콘텐츠 조회",
      description =
          "AI 분석 결과로 생성된 학습 콘텐츠를 조회합니다. " + "SUMMARY, KEYWORD, EXPRESSION 타입별로 분리하여 반환합니다.")
  @GetMapping("/{jobId}/learning-contents")
  public ApiResponse<LearningContentsResponse> getLearningContents(
      @PathVariable Long jobId, @RequestAttribute(AuthInterceptor.AUTH_MEMBER_ID) Long memberId) {

    LearningContentsResponse result = learningContentService.getLearningContents(jobId, memberId);

    return ApiResponse.success(result);
  }
}
