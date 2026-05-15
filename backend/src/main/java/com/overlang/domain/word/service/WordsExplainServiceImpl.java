package com.overlang.domain.word.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.overlang.api.dto.word.WordsExplainRequest;
import com.overlang.api.dto.word.WordsExplainResponse;
import com.overlang.domain.learning.entity.LearningContent;
import com.overlang.domain.learning.entity.LearningContentType;
import com.overlang.domain.learning.repository.LearningContentRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.repository.SegmentRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class WordsExplainServiceImpl implements WordsExplainService {

  private static final String WORD_SPLIT_REGEX = "\\s+";
  private static final String NON_WORD_REGEX = "[^\\p{IsAlphabetic}\\p{IsDigit}\\s]";

  private final RestClient openAiRestClient;
  private final ObjectMapper objectMapper;
  private final SegmentRepository segmentRepository;
  private final LearningContentRepository learningContentRepository;

  @Value("${openai.model}")
  private String model;

  @Override
  public WordsExplainResponse explain(WordsExplainRequest request) {
    Optional<LearningContent> matchedExpression = findMatchedExpression(request);

    if (matchedExpression.isPresent()) {
      LearningContent expression = matchedExpression.get();

      List<String> relatedWords =
          generateRelatedWords(expression.getTitle(), getSelectedTextLanguage(request));

      return new WordsExplainResponse(
          expression.getTitle(), expression.getContent(), relatedWords, true);
    }

    String prompt = createPrompt(request);

    Map<String, Object> body =
        Map.of(
            "model", model,
            "input", prompt,
            "store", false);

    Map response = openAiRestClient.post().uri("/responses").body(body).retrieve().body(Map.class);

    String outputText = extractOutputText(response);

    try {
      WordExplainAiResult result = objectMapper.readValue(outputText, WordExplainAiResult.class);

      return new WordsExplainResponse(
          request.word(), result.meaning(), result.relatedWords(), false);

    } catch (JsonProcessingException e) {
      throw new RuntimeException("OpenAI 응답 파싱에 실패했습니다.", e);
    }
  }

  private String createPrompt(WordsExplainRequest request) {
    return """
      사용자가 영상 자막에서 선택한 단어의 뜻과 관련 단어를 생성

      선택 단어: %s
      선택 위치: %s
      원문 문장: %s
      번역 문장: %s
      원본 언어: %s
      대상 언어: %s
      선택 단어 언어: %s

      규칙:
      - meaning은 선택 단어 언어로 작성
      - relatedWords는 선택 단어 언어로 작성
      - relatedWords는 선택 단어와 유사한 의미의 단어 또는 표현 3개를 작성
      - relatedWords는 사전식 유의어 또는 비슷한 의미의 표현 위주로 작성
      - 단순 연관어(카테고리, 분야 단어)는 제외
      - 설명 문장 없이 JSON만 반환

      JSON 형식:
      {
        "meaning": "단어 뜻",
        "relatedWords": ["관련 단어1", "관련 단어2", "관련 단어3"]
      }
      """
        .formatted(
            request.word(),
            request.selectedTextType(),
            request.originalSentence(),
            request.translatedSentence(),
            request.sourceLanguage(),
            request.targetLanguage(),
            getSelectedTextLanguage(request));
  }

  @SuppressWarnings("unchecked")
  private String extractOutputText(Map response) {
    List<Map<String, Object>> output = (List<Map<String, Object>>) response.get("output");
    Map<String, Object> message = output.get(0);
    List<Map<String, Object>> content = (List<Map<String, Object>>) message.get("content");
    return (String) content.get(0).get("text");
  }

  private record WordExplainAiResult(String meaning, List<String> relatedWords) {}

  private record RelatedWordsResult(List<String> relatedWords) {}

  private Optional<LearningContent> findMatchedExpression(WordsExplainRequest request) {
    Segment segment =
        segmentRepository
            .findById(request.segmentId())
            .orElseThrow(() -> new IllegalArgumentException("세그먼트를 찾을 수 없습니다."));

    String clickedWord = normalize(request.word());

    return learningContentRepository
        .findByJobIdAndContentType(segment.getJob().getId(), LearningContentType.EXPRESSION)
        .stream()
        .filter(expression -> overlapsSegmentTime(segment, expression))
        .filter(expression -> containsClickedWord(expression.getTitle(), clickedWord))
        .max(Comparator.comparingInt(expression -> expression.getTitle().length()));
  }

  private boolean overlapsSegmentTime(Segment segment, LearningContent expression) {
    if (expression.getStartTime() == null || expression.getEndTime() == null) {
      return false;
    }

    return expression.getStartTime() <= segment.getEndTime()
        && expression.getEndTime() >= segment.getStartTime();
  }

  private boolean containsClickedWord(String expressionTitle, String clickedWord) {
    if (expressionTitle == null || clickedWord == null || clickedWord.isBlank()) {
      return false;
    }

    String normalizedTitle = normalize(expressionTitle);

    return List.of(normalizedTitle.split(WORD_SPLIT_REGEX)).contains(clickedWord);
  }

  private String normalize(String value) {
    if (value == null) {
      return "";
    }

    return value.toLowerCase().replaceAll(NON_WORD_REGEX, "").trim();
  }

  private List<String> generateRelatedWords(String expression, String targetLanguage) {

    String prompt =
        """
            다음 표현과 관련 있는 단어 3개를 생성하세요.

            표현: %s
            출력 언어: %s

            규칙:
            - 설명 없이 JSON만 반환
            - relatedWords는 문자열 배열

            JSON 형식:
            {
              "relatedWords": ["단어1", "단어2", "단어3"]
            }
            """
            .formatted(expression, targetLanguage);

    Map<String, Object> body =
        Map.of(
            "model", model,
            "input", prompt,
            "store", false);

    Map response = openAiRestClient.post().uri("/responses").body(body).retrieve().body(Map.class);

    String outputText = extractOutputText(response);

    try {
      RelatedWordsResult result = objectMapper.readValue(outputText, RelatedWordsResult.class);

      return result.relatedWords();

    } catch (JsonProcessingException e) {
      return List.of();
    }
  }

  private String getSelectedTextLanguage(WordsExplainRequest request) {
    return switch (request.selectedTextType()) {
      case ORIGINAL -> request.sourceLanguage();
      case TRANSLATION -> request.targetLanguage();
    };
  }
}
