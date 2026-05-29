package com.overlang.domain.segment.tokenizer;

import com.overlang.domain.common.LanguageCode;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class WhitespaceSegmentWordTokenizer implements SegmentWordTokenizer {

  private static final String WORD_SPLIT_REGEX = "\\s+";

  @Override
  public boolean supports(LanguageCode languageCode) {
    return EnumSet.of(LanguageCode.KO, LanguageCode.EN, LanguageCode.ES, LanguageCode.FR)
        .contains(languageCode);
  }

  @Override
  public List<String> tokenize(String text) {
    if (isBlank(text)) {
      return List.of();
    }

    return Arrays.stream(text.trim().split(WORD_SPLIT_REGEX)).filter(this::isValidWord).toList();
  }
}
