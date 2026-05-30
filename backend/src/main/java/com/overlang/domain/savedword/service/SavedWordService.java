package com.overlang.domain.savedword.service;

import com.overlang.api.dto.savedword.SavedWordCreateRequest;
import com.overlang.api.dto.savedword.SavedWordExampleResponse;
import com.overlang.api.dto.savedword.SavedWordResponse;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.domain.savedword.entity.SavedWord;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.repository.SegmentWordRepository;
import com.overlang.domain.word.service.WordsExplainService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SavedWordService {

  private final SavedWordRepository savedWordRepository;
  private final MemberRepository memberRepository;
  private final SegmentWordRepository segmentWordRepository;
  private final WordsExplainService wordsExplainService;

  @Transactional
  public SavedWordResponse createSavedWord(Long memberId, SavedWordCreateRequest request) {
    validateSavedWordCreateRequest(request);
    validateDuplicateSavedWord(memberId, request.segmentWordId());

    Member member = findMemberById(memberId);
    SegmentWord segmentWord = findSegmentWordById(request.segmentWordId());

    SavedWord savedWord =
        new SavedWord(
            member,
            segmentWord,
            request.word(),
            request.meaning(),
            request.contextMeaning(),
            request.memo(),
            request.matchedExpression());

    return SavedWordResponse.from(savedWordRepository.save(savedWord));
  }

  private void validateSavedWordCreateRequest(SavedWordCreateRequest request) {
    if (request.segmentWordId() == null) {
      throw new IllegalArgumentException("segmentWordId는 필수입니다.");
    }

    if (request.word() == null || request.word().isBlank()) {
      throw new IllegalArgumentException("word는 필수입니다.");
    }
  }

  private void validateDuplicateSavedWord(Long memberId, Long segmentWordId) {
    if (savedWordRepository.existsByMemberIdAndSegmentWordId(memberId, segmentWordId)) {
      throw new IllegalArgumentException("이미 저장한 단어입니다.");
    }
  }

  @Transactional(readOnly = true)
  public List<SavedWordResponse> getMySavedWords(Long memberId) {
    return savedWordRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
        .map(SavedWordResponse::from)
        .toList();
  }

  @Transactional
  public void deleteSavedWord(Long memberId, Long savedWordId) {
    SavedWord savedWord = findSavedWordByIdAndMemberId(savedWordId, memberId);
    savedWordRepository.delete(savedWord);
  }

  @Transactional(readOnly = true)
  public SavedWordExampleResponse generateExamples(Long memberId, Long savedWordId) {
    SavedWord savedWord = findSavedWordByIdAndMemberId(savedWordId, memberId);

    return wordsExplainService.generateExamples(savedWord);
  }

  private Member findMemberById(Long memberId) {
    return memberRepository
        .findById(memberId)
        .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));
  }

  private SegmentWord findSegmentWordById(Long segmentWordId) {
    return segmentWordRepository
        .findById(segmentWordId)
        .orElseThrow(() -> new IllegalArgumentException("세그먼트 단어를 찾을 수 없습니다."));
  }

  private SavedWord findSavedWordByIdAndMemberId(Long savedWordId, Long memberId) {
    return savedWordRepository
        .findByIdAndMemberId(savedWordId, memberId)
        .orElseThrow(() -> new IllegalArgumentException("저장 단어를 찾을 수 없습니다."));
  }
}
