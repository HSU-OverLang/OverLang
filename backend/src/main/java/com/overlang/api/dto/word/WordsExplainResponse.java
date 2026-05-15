package com.overlang.api.dto.word;

import java.util.List;

public record WordsExplainResponse(
    String word, String meaning, List<String> relatedWords, boolean matchedExpression) {}
