package com.overlang.domain.segment.repository;

import com.overlang.domain.segment.entity.SegmentWord;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SegmentWordRepository extends JpaRepository<SegmentWord, Long> {
  List<SegmentWord> findBySegmentIdOrderBySeqAsc(Long segmentId);

  void deleteBySegmentJobId(Long jobId);
}
