package com.overlang.api.controller;

import com.overlang.api.dto.savedword.SavedWordCreateRequest;
import com.overlang.api.dto.savedword.SavedWordExampleResponse;
import com.overlang.api.dto.savedword.SavedWordResponse;
import com.overlang.domain.savedword.service.SavedWordService;
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
public class SavedWordController {

  private final SavedWordService savedWordService;

  private Long getMemberId(HttpServletRequest request) {
    return (Long) request.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);
  }

  @Operation(summary = "저장 단어 생성", description = "사용자가 선택한 단어를 저장합니다.")
  @PostMapping("/saved-words")
  public ApiResponse<SavedWordResponse> createSavedWord(
      HttpServletRequest httpRequest, @RequestBody SavedWordCreateRequest request) {
    Long memberId = getMemberId(httpRequest);
    return ApiResponse.success(savedWordService.createSavedWord(memberId, request));
  }

  @Operation(summary = "내 저장 단어 목록 조회", description = "사용자가 저장한 단어 목록을 최신순으로 조회합니다.")
  @GetMapping("/me/saved-words")
  public ApiResponse<List<SavedWordResponse>> getMySavedWords(HttpServletRequest httpRequest) {
    Long memberId = getMemberId(httpRequest);
    return ApiResponse.success(savedWordService.getMySavedWords(memberId));
  }

  @Operation(summary = "저장 단어 삭제", description = "사용자가 저장한 단어를 삭제합니다.")
  @DeleteMapping("/saved-words/{savedWordId}")
  public ApiResponse<Void> deleteSavedWord(
      HttpServletRequest httpRequest, @PathVariable Long savedWordId) {
    Long memberId = getMemberId(httpRequest);
    savedWordService.deleteSavedWord(memberId, savedWordId);
    return ApiResponse.success(null);
  }

  @Operation(summary = "저장 단어 AI 예문 생성", description = "학습노트에 저장된 단어를 기반으로 AI 예문을 생성합니다.")
  @PostMapping("/me/saved-words/{savedWordId}/examples")
  public ApiResponse<SavedWordExampleResponse> generateExamples(
      HttpServletRequest httpRequest, @PathVariable Long savedWordId) {
    Long memberId = getMemberId(httpRequest);
    return ApiResponse.success(savedWordService.generateExamples(memberId, savedWordId));
  }
}
