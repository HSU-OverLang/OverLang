package com.overlang.domain.learning.repository;

import com.overlang.domain.learning.entity.LearningContent;
import com.overlang.domain.learning.entity.LearningContentType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LearningContentRepository extends JpaRepository<LearningContent, Long> {
  List<LearningContent> findByJobIdAndContentType(Long jobId, LearningContentType contentType);

  void deleteByJobId(Long jobId);
}
