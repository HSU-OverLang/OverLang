package com.overlang.api.controller;

import com.overlang.api.dto.job.JobCallbackRequest;
import com.overlang.api.dto.job.JobCallbackResponse;
import com.overlang.domain.job.service.JobService;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
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
      @io.swagger.v3.oas.annotations.parameters.RequestBody(
              content =
                  @Content(
                      mediaType = "application/json",
                      examples =
                          @ExampleObject(
                              name = "콜백 예시",
                              value =
                                  """
                        {
                          "jobId": 2,
                          "status": "COMPLETED",
                          "progress": 100,
                          "currentStage": "FINALIZING",
                          "segments": [
                            {
                              "seq": 1,
                              "startTime": 0.0,
                              "endTime": 2.0,
                              "text": "Hello",
                              "translatedText": "안녕",
                              "languageCode": "en"
                            }
                          ],
                          "ocrItems": [
                            {
                              "startTime": 1.0,
                              "endTime": 2.0,
                              "originText": "EXIT",
                              "translatedText": "출구",
                              "boundingBox": {
                                "x": 0.1,
                                "y": 0.2,
                                "w": 0.3,
                                "h": 0.4
                              },
                              "confidence": 0.95
                            }
                          ],
                          "learningData": {
                            "contents": [
                              {
                                "contentType": "SUMMARY",
                                "title": "Summary",
                                "content": "이 영상은 영어 표현을 설명합니다.",
                                "startTime": null,
                                "endTime": null
                              },
                              {
                                "contentType": "EXPRESSION",
                                "title": "step by step",
                                "content": "직역: 단계별로. 실제 의미: 차근차근.",
                                "startTime": 0,
                                "endTime": 2
                              }
                            ]
                          },
                          "errorCode": null,
                          "errorMessage": null
                        }
                        """)))
          @org.springframework.web.bind.annotation.RequestBody
          JobCallbackRequest request) {

    JobCallbackResponse response = jobService.handleCallback(jobId, requestWorkerSecret, request);

    return ApiResponse.success(response);
  }
}
