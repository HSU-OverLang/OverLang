package com.overlang.domain.segment.tokenizer;

import com.overlang.domain.job.entity.LanguageCode;
import java.util.List;

public interface SegmentWordTokenizer {

    boolean supports(LanguageCode languageCode);

    List<String> tokenize(String text);
}