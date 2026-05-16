package com.overlang.domain.learning.service;

import com.overlang.api.dto.learning.LearningContentResponse;
import com.overlang.api.dto.learning.LearningContentsResponse;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.learning.entity.LearningContent;
import com.overlang.domain.learning.entity.LearningContentType;
import com.overlang.domain.learning.repository.LearningContentRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LearningContentService {

  private final LearningContentRepository learningContentRepository;
  private final JobRepository jobRepository;

  @Transactional(readOnly = true)
  public LearningContentsResponse getLearningContents(Long jobId, Long memberId) {
    validateJobOwner(jobId, memberId);

    List<LearningContent> learningContents =
        learningContentRepository.findByJobIdOrderByStartTimeAscIdAsc(jobId);

    Map<LearningContentType, List<LearningContentResponse>> contentsByType =
        learningContents.stream()
            .collect(
                Collectors.groupingBy(
                    LearningContent::getContentType,
                    Collectors.mapping(LearningContentResponse::from, Collectors.toList())));

    LearningContentResponse summary =
        contentsByType.getOrDefault(LearningContentType.SUMMARY, List.of()).stream()
            .findFirst()
            .orElse(null);

    List<LearningContentResponse> keywords =
        contentsByType.getOrDefault(LearningContentType.KEYWORD, List.of());

    List<LearningContentResponse> expressions =
        contentsByType.getOrDefault(LearningContentType.EXPRESSION, List.of());

    return new LearningContentsResponse(jobId, summary, keywords, expressions);
  }

  private void validateJobOwner(Long jobId, Long memberId) {
    if (!jobRepository.existsByIdAndProjectMemberId(jobId, memberId)) {
      throw new IllegalArgumentException("작업을 찾을 수 없습니다.");
    }
  }
}
