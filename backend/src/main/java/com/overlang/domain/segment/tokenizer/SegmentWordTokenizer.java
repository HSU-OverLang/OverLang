package com.overlang.domain.segment.tokenizer;

import com.overlang.domain.common.LanguageCode;
import java.util.List;

public interface SegmentWordTokenizer {

  boolean supports(LanguageCode languageCode);

  List<String> tokenize(String text);

  default boolean isBlank(String text) {
    return text == null || text.isBlank();
  }

  default boolean isValidWord(String word) {
    return word != null && !word.isBlank();
  }
}
