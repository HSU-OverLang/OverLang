package com.overlang.domain.segment.repository;

import com.overlang.domain.segment.entity.Segment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SegmentRepository extends JpaRepository<Segment, Long> {
  List<Segment> findByJobIdOrderBySeqAsc(Long jobId);

  void deleteByJobId(Long jobId);

  List<Segment> findByIdIn(List<Long> segmentIds);
}
