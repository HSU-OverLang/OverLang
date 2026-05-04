package com.overlang.domain.common;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum LanguageCode {
  KO("ko", "한국어"),
  EN("en", "영어"),
  ZH("zh", "중국어"),
  JA("ja", "일본어"),
  ES("es", "스페인어"),
  FR("fr", "프랑스어");

  private final String code;
  private final String description;

  public static LanguageCode fromCode(String code) {
    for (LanguageCode lang : values()) {
      if (lang.code.equalsIgnoreCase(code)) {
        return lang;
      }
    }
    throw new IllegalArgumentException("지원하지 않는 언어 코드입니다: " + code);
  }
}
