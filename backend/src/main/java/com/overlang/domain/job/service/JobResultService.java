package com.overlang.domain.job.service;

import com.overlang.api.dto.job.JobCallbackRequest;
import com.overlang.api.dto.ocr.OcrItemResponse;
import com.overlang.api.dto.segment.SegmentResponse;
import com.overlang.api.dto.segment.SegmentWordResponse;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.repository.JobRepository;
import com.overlang.domain.learning.repository.LearningContentRepository;
import com.overlang.domain.ocr.repository.OcrItemRepository;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import com.overlang.domain.segment.entity.Segment;
import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.entity.SegmentWordType;
import com.overlang.domain.segment.repository.SegmentRepository;
import com.overlang.domain.segment.repository.SegmentWordRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobResultService {

  private final SegmentRepository segmentRepository;
  private final SegmentWordRepository segmentWordRepository;
  private final OcrItemRepository ocrItemRepository;
  private final JobRepository jobRepository;
  private final LearningContentRepository learningContentRepository;
  private final SavedWordRepository savedWordRepository;

  @Transactional(readOnly = true)
  public List<SegmentResponse> getSegments(Long jobId, Long memberId) {
    validateJobOwner(jobId, memberId);

    List<Segment> segments = segmentRepository.findByJobIdOrderBySeqAsc(jobId);

    if (segments.isEmpty()) {
      return List.of();
    }

    Map<Long, List<SegmentWord>> wordsBySegmentId = getWordsBySegmentId(segments);

    return segments.stream().map(segment -> toSegmentResponse(segment, wordsBySegmentId)).toList();
  }

  @Transactional(readOnly = true)
  public List<OcrItemResponse> getOcrItems(Long jobId, Long memberId) {
    validateJobOwner(jobId, memberId);

    return ocrItemRepository.findByJobIdOrderByStartTimeAsc(jobId).stream()
        .map(OcrItemResponse::from)
        .toList();
  }

  private Map<Long, List<SegmentWord>> getWordsBySegmentId(List<Segment> segments) {
    List<Long> segmentIds = segments.stream().map(Segment::getId).toList();

    return segmentWordRepository.findBySegmentIdIn(segmentIds).stream()
        .collect(Collectors.groupingBy(segmentWord -> segmentWord.getSegment().getId()));
  }

  private SegmentResponse toSegmentResponse(
      Segment segment, Map<Long, List<SegmentWord>> wordsBySegmentId) {
    List<SegmentWord> segmentWords = wordsBySegmentId.getOrDefault(segment.getId(), List.of());

    List<SegmentWordResponse> originalWords =
        toSegmentWordResponses(segmentWords, SegmentWordType.ORIGINAL);

    List<SegmentWordResponse> translatedWords =
        toSegmentWordResponses(segmentWords, SegmentWordType.TRANSLATION);

    return SegmentResponse.from(segment, originalWords, translatedWords);
  }

  private List<SegmentWordResponse> toSegmentWordResponses(
      List<SegmentWord> segmentWords, SegmentWordType wordType) {
    return segmentWords.stream()
        .filter(segmentWord -> segmentWord.getWordType() == wordType)
        .map(SegmentWordResponse::from)
        .toList();
  }

  private void validateJobOwner(Long jobId, Long memberId) {
    if (!jobRepository.existsByIdAndProjectMemberId(jobId, memberId)) {
      throw new IllegalArgumentException("작업을 찾을 수 없습니다.");
    }
  }

  public void deletePreviousResults(Long jobId) {
    savedWordRepository.deleteByJobId(jobId);
    segmentWordRepository.deleteBySegmentJobId(jobId);
    segmentRepository.deleteByJobId(jobId);
    ocrItemRepository.deleteByJobId(jobId);
    learningContentRepository.deleteByJobId(jobId);
  }

  private static final String WORD_SPLIT_REGEX = "\\s+";

  public void saveSegments(Job job, JobCallbackRequest request) {
    if (request.segments() == null) return;

    List<Segment> segments =
        request.segments().stream()
            .map(
                s ->
                    new Segment(
                        job,
                        s.startTime(),
                        s.endTime(),
                        s.seq(),
                        s.text(),
                        s.translatedText(),
                        s.languageCode()))
            .toList();

    List<Segment> savedSegments = segmentRepository.saveAll(segments);

    saveSegmentWords(savedSegments);
  }

  private void saveSegmentWords(List<Segment> segments) {
    List<SegmentWord> segmentWords =
        segments.stream().flatMap(segment -> createWordsFromSegment(segment).stream()).toList();

    segmentWordRepository.saveAll(segmentWords);
  }

  private List<SegmentWord> createWordsFromSegment(Segment segment) {
    List<SegmentWord> words = new ArrayList<>();

    words.addAll(createWordsFromText(segment, segment.getText(), SegmentWordType.ORIGINAL));

    words.addAll(
        createWordsFromText(segment, segment.getTranslatedText(), SegmentWordType.TRANSLATION));

    return words;
  }

  private List<SegmentWord> createWordsFromText(
      Segment segment, String text, SegmentWordType wordType) {

    if (text == null || text.isBlank()) {
      return List.of();
    }

    String[] words = text.split(WORD_SPLIT_REGEX);
    List<SegmentWord> segmentWords = new ArrayList<>();

    for (int i = 0; i < words.length; i++) {
      segmentWords.add(
          new SegmentWord(
              segment, i + 1, segment.getStartTime(), segment.getEndTime(), words[i], wordType));
    }

    return segmentWords;
  }
}
