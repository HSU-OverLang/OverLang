package com.overlang.domain.segment.tokenizer;

import com.overlang.domain.common.LanguageCode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SegmentWordTokenizerProvider {

  private final List<SegmentWordTokenizer> tokenizers;

  public List<String> tokenize(String text, LanguageCode languageCode) {
    return getTokenizer(languageCode).tokenize(text);
  }

  private SegmentWordTokenizer getTokenizer(LanguageCode languageCode) {
    return tokenizers.stream()
        .filter(tokenizer -> tokenizer.supports(languageCode))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("지원하지 않는 언어입니다: " + languageCode));
  }
}
