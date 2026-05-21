package com.overlang.domain.word.service;

import com.overlang.api.dto.savedword.SavedWordExampleResponse;
import com.overlang.api.dto.word.WordsExplainRequest;
import com.overlang.api.dto.word.WordsExplainResponse;
import com.overlang.domain.savedword.entity.SavedWord;

public interface WordsExplainService {

  WordsExplainResponse explain(WordsExplainRequest request);

  SavedWordExampleResponse generateExamples(SavedWord savedWord);
}
