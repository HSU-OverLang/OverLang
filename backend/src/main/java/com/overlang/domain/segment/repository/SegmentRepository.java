package com.overlang.domain.segment.repository;

import com.overlang.domain.segment.entity.Segment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SegmentRepository extends JpaRepository<Segment, Long> {}
