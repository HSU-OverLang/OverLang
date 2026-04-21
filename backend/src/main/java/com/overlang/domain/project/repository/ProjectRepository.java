package com.overlang.domain.project.repository;

import com.overlang.domain.project.entity.Project;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {
  List<Project> findByMemberIdOrderByCreatedAtDesc(Long memberId);

  Optional<Project> findByIdAndMemberId(Long id, Long memberId);
}
