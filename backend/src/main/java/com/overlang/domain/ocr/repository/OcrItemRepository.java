package com.overlang.domain.ocr.repository;

import com.overlang.domain.ocr.entity.OcrItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OcrItemRepository extends JpaRepository<OcrItem, Long> {
  @Query(
      """
      SELECT DISTINCT oi
      FROM OcrItem oi
      LEFT JOIN FETCH oi.lines
      WHERE oi.job.id = :jobId
      ORDER BY oi.startTime ASC
      """)
  List<OcrItem> findByJobIdOrderByStartTimeAsc(Long jobId);

  void deleteByJobId(Long jobId);
}
