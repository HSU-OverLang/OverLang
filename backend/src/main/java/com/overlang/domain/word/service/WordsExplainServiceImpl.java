package com.overlang.domain.word.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.overlang.api.dto.word.WordsExplainRequest;
import com.overlang.api.dto.word.WordsExplainResponse;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class WordsExplainServiceImpl implements WordsExplainService {

  private final RestClient openAiRestClient;
  private final ObjectMapper objectMapper;

  @Value("${openai.model}")
  private String model;

  @Override
  public WordsExplainResponse explain(WordsExplainRequest request) {
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

      return new WordsExplainResponse(request.word(), result.meaning(), result.relatedWords());

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

        규칙:
        - meaning은 대상 언어로 작성
        - relatedWords는 선택 단어와 의미적으로 관련 있는 단어 3개를 작성
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
            request.targetLanguage());
  }

  @SuppressWarnings("unchecked")
  private String extractOutputText(Map response) {
    List<Map<String, Object>> output = (List<Map<String, Object>>) response.get("output");
    Map<String, Object> message = output.get(0);
    List<Map<String, Object>> content = (List<Map<String, Object>>) message.get("content");
    return (String) content.get(0).get("text");
  }

  private record WordExplainAiResult(String meaning, List<String> relatedWords) {}
}
