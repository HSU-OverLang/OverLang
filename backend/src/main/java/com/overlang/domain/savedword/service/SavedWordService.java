package com.overlang.domain.savedword.service;

import com.overlang.api.dto.savedword.SavedWordCreateRequest;
import com.overlang.api.dto.savedword.SavedWordResponse;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.domain.savedword.entity.SavedWord;
import com.overlang.domain.savedword.repository.SavedWordRepository;
import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.repository.SegmentWordRepository;
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

  @Transactional
  public SavedWordResponse createSavedWord(Long memberId, SavedWordCreateRequest request) {
    if (request.segmentWordId() == null) {
      throw new IllegalArgumentException("segmentWordId는 필수입니다.");
    }

    Member member =
        memberRepository
            .findById(memberId)
            .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));

    SegmentWord segmentWord =
        segmentWordRepository
            .findById(request.segmentWordId())
            .orElseThrow(() -> new IllegalArgumentException("세그먼트 단어를 찾을 수 없습니다."));

    if (savedWordRepository.existsByMemberIdAndSegmentWordId(memberId, request.segmentWordId())) {
      throw new IllegalArgumentException("이미 저장한 단어입니다.");
    }

    SavedWord savedWord =
        new SavedWord(
            member, segmentWord, request.meaning(), request.contextMeaning(), request.memo());

    return SavedWordResponse.from(savedWordRepository.save(savedWord));
  }

  @Transactional(readOnly = true)
  public List<SavedWordResponse> getMySavedWords(Long memberId) {
    return savedWordRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
        .map(SavedWordResponse::from)
        .toList();
  }

  @Transactional
  public void deleteSavedWord(Long memberId, Long savedWordId) {
    SavedWord savedWord =
        savedWordRepository
            .findByIdAndMemberId(savedWordId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("저장 단어를 찾을 수 없습니다."));

    savedWordRepository.delete(savedWord);
  }
}
