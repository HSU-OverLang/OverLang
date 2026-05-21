package com.overlang.api.dto.savedword;

import java.util.List;

public record SavedWordExampleResponse(Long savedWordId, String word, List<ExampleItem> examples) {
  public record ExampleItem(String sentence, String translatedSentence) {}
}
