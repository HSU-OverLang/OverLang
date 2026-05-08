package com.overlang.domain.savedword.repository;

import com.overlang.domain.savedword.entity.SavedWord;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedWordRepository extends JpaRepository<SavedWord, Long> {

  boolean existsByMemberIdAndSegmentWordId(Long memberId, Long segmentWordId);

  List<SavedWord> findByMemberIdOrderByCreatedAtDesc(Long memberId);

  Optional<SavedWord> findByIdAndMemberId(Long id, Long memberId);
}
