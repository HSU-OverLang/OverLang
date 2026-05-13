package com.overlang.domain.job.repository;

import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.job.entity.JobStatus;
import com.overlang.domain.job.entity.TranslationProvider;
import com.overlang.domain.project.entity.SourceType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobRepository extends JpaRepository<Job, Long> {
  List<Job> findByProjectIdOrderByCreatedAtDesc(Long projectId);

  Optional<Job> findTopByProjectIdOrderByCreatedAtDesc(Long projectId);

  Optional<Job> findByIdAndProjectMemberId(Long jobId, Long memberId);

  boolean existsByIdAndProjectMemberId(Long jobId, Long memberId);

  List<Job> findByProjectId(Long projectId);

  void deleteByProjectId(Long projectId);

  @Query(
      """
      SELECT j
      FROM Job j
      JOIN j.project p
      WHERE p.sourceType = :sourceType
        AND p.youtubeVideoId = :youtubeVideoId
        AND j.status = :status
        AND j.sourceLanguage = :sourceLanguage
        AND j.targetLanguage = :targetLanguage
        AND j.translationProvider = :translationProvider
      ORDER BY j.createdAt DESC
      """)
  List<Job> findReusableYoutubeJobs(
      @Param("sourceType") SourceType sourceType,
      @Param("youtubeVideoId") String youtubeVideoId,
      @Param("status") JobStatus status,
      @Param("sourceLanguage") LanguageCode sourceLanguage,
      @Param("targetLanguage") LanguageCode targetLanguage,
      @Param("translationProvider") TranslationProvider translationProvider,
      Pageable pageable);
}
