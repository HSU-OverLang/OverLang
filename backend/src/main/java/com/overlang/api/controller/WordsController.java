package com.overlang.api.controller;

import com.overlang.api.dto.word.WordsExplainRequest;
import com.overlang.api.dto.word.WordsExplainResponse;
import com.overlang.domain.word.service.WordsExplainService;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/words")
public class WordsController {

  private final WordsExplainService wordsExplainService;

  @Operation(summary = "단어 설명 생성", description = "선택한 단어의 뜻과 관련 단어를 생성합니다. 원문/번역문 단어 모두 지원합니다.")
  @PostMapping("/explain")
  public ApiResponse<WordsExplainResponse> explain(
      @Valid @RequestBody WordsExplainRequest request) {
    WordsExplainResponse response = wordsExplainService.explain(request);
    return ApiResponse.success(response);
  }
}
