package com.overlang.domain.savedword.repository;

import com.overlang.domain.savedword.entity.SavedWord;
import com.overlang.domain.segment.entity.SegmentWordType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SavedWordRepository extends JpaRepository<SavedWord, Long> {

  boolean existsByMemberIdAndSegmentWordId(Long memberId, Long segmentWordId);

  List<SavedWord> findByMemberIdOrderByCreatedAtDesc(Long memberId);

  Optional<SavedWord> findByIdAndMemberId(Long id, Long memberId);

  @Modifying
  @Query(
      """
    DELETE FROM SavedWord sw
    WHERE sw.segmentWord.segment.job.project.id = :projectId
    """)
  void deleteByProjectId(@Param("projectId") Long projectId);

  @Modifying
  @Query(
      """
          DELETE FROM SavedWord sw
          WHERE sw.segmentWord.id IN (
            SELECT segmentWord.id
            FROM SegmentWord segmentWord
            WHERE segmentWord.segment.id IN :segmentIds
              AND segmentWord.wordType = :wordType
          )
          """)
  void deleteBySegmentIdsAndWordType(
      @Param("segmentIds") List<Long> segmentIds, @Param("wordType") SegmentWordType wordType);
}
