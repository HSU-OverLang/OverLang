package com.overlang.domain.word.service;

import com.overlang.api.dto.word.WordsExplainRequest;
import com.overlang.api.dto.word.WordsExplainResponse;

public interface WordsExplainService {

  WordsExplainResponse explain(WordsExplainRequest request);
}
