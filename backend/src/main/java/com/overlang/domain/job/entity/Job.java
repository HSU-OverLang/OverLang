package com.overlang.domain.job.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.common.LanguageCode;
import com.overlang.domain.project.entity.Project;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Job extends BaseTimeEntity { // 시간 자동 기록

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "project_id", nullable = false)
  private Project project;

  @Enumerated(EnumType.STRING)
  @Column(name = "job_type", nullable = false)
  private JobType jobType;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private JobStatus status;

  @Column(nullable = false)
  private Integer progress;

  @Enumerated(EnumType.STRING)
  @Column(name = "current_stage", nullable = false)
  private CurrentStage currentStage;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_language", nullable = false, length = 20)
  private LanguageCode sourceLanguage;

  @Enumerated(EnumType.STRING)
  @Column(name = "target_language", nullable = false, length = 20)
  private LanguageCode targetLanguage;

  @Enumerated(EnumType.STRING)
  @Column(name = "translation_provider", length = 50)
  private TranslationProvider translationProvider;

  @Column(name = "error_code", length = 100)
  private String errorCode;

  @Column(name = "error_message", columnDefinition = "TEXT")
  private String errorMessage;

  public Job(
      Project project,
      JobType jobType,
      LanguageCode sourceLanguage,
      LanguageCode targetLanguage,
      TranslationProvider translationProvider) {
    this.project = project;
    this.jobType = jobType;
    this.status = JobStatus.PENDING;
    this.progress = 0;
    this.currentStage = CurrentStage.QUEUED;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.translationProvider =
        translationProvider == null ? TranslationProvider.DEFAULT : translationProvider;
  }

  public void updateRunning(Integer progress, CurrentStage currentStage) {
    this.status = JobStatus.RUNNING;
    this.progress = progress;
    this.currentStage = currentStage;
    this.errorCode = null;
    this.errorMessage = null;
  }

  public void complete(
      Integer progress, CurrentStage currentStage, String errorCode, String errorMessage) {
    this.status = JobStatus.COMPLETED;
    this.progress = progress;
    this.currentStage = currentStage;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
  }

  public void fail(
      Integer progress, CurrentStage currentStage, String errorCode, String errorMessage) {
    this.status = JobStatus.FAILED;
    this.progress = progress;
    this.currentStage = currentStage;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
  }
}
