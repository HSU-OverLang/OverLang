package com.overlang.domain.segment.tokenizer;

import com.atilika.kuromoji.ipadic.Token;
import com.atilika.kuromoji.ipadic.Tokenizer;
import com.overlang.domain.common.LanguageCode;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class JapaneseSegmentWordTokenizer implements SegmentWordTokenizer {

  private final Tokenizer tokenizer = new Tokenizer();

  @Override
  public boolean supports(LanguageCode languageCode) {
    return languageCode == LanguageCode.JA;
  }

  @Override
  public List<String> tokenize(String text) {
    if (isBlank(text)) {
      return List.of();
    }

    return tokenizer.tokenize(text).stream()
        .map(Token::getSurface)
        .filter(this::isValidWord)
        .toList();
  }
}
