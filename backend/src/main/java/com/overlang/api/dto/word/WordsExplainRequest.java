package com.overlang.api.dto.word;

import com.overlang.domain.word.entity.SelectedTextType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WordsExplainRequest(
    @NotBlank(message = "단어는 필수입니다.") String word,
    @NotNull(message = "선택한 텍스트 타입은 필수입니다.") SelectedTextType selectedTextType,
    @NotBlank(message = "원문 문장은 필수입니다.") String originalSentence,
    @NotBlank(message = "번역 문장은 필수입니다.") String translatedSentence,
    @NotBlank(message = "원본 언어는 필수입니다.") String sourceLanguage,
    @NotBlank(message = "대상 언어는 필수입니다.") String targetLanguage) {}
