package com.overlang.domain.ocr.repository;

import com.overlang.domain.ocr.entity.OcrItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OcrItemRepository extends JpaRepository<OcrItem, Long> {
  List<OcrItem> findByJobIdOrderByStartTimeAsc(Long jobId);

  void deleteByJobId(Long jobId);
}
