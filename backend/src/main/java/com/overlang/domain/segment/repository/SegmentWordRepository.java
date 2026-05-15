package com.overlang.domain.segment.repository;

import com.overlang.domain.segment.entity.SegmentWord;
import com.overlang.domain.segment.entity.SegmentWordType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

public interface SegmentWordRepository extends JpaRepository<SegmentWord, Long> {
  List<SegmentWord> findBySegmentIdOrderBySeqAsc(Long segmentId);

  void deleteBySegmentJobId(Long jobId);

  List<SegmentWord> findBySegmentIdIn(List<Long> segmentIds);

  List<SegmentWord> findBySegmentIdAndWordType(Long segmentId, SegmentWordType wordType);

  void deleteBySegmentIdAndWordType(Long segmentId, SegmentWordType wordType);

  @Modifying
  void deleteBySegmentIdInAndWordType(List<Long> segmentIds, SegmentWordType wordType);
}
