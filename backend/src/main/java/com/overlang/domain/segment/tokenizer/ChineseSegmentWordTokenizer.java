package com.overlang.domain.segment.tokenizer;

import com.huaban.analysis.jieba.JiebaSegmenter;
import com.overlang.domain.common.LanguageCode;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ChineseSegmentWordTokenizer implements SegmentWordTokenizer {

  private final JiebaSegmenter segmenter = new JiebaSegmenter();

  @Override
  public boolean supports(LanguageCode languageCode) {
    return languageCode == LanguageCode.ZH;
  }

  @Override
  public List<String> tokenize(String text) {
    if (isBlank(text)) {
      return List.of();
    }

    return segmenter.sentenceProcess(text).stream().filter(this::isValidWord).toList();
  }
}
