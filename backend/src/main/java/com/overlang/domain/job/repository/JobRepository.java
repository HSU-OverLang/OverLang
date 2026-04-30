package com.overlang.domain.job.repository;

import com.overlang.domain.job.entity.Job;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRepository extends JpaRepository<Job, Long> {
  List<Job> findByProjectIdOrderByCreatedAtDesc(Long projectId);

  Optional<Job> findByIdAndProjectMemberId(Long jobId, Long memberId);
}
