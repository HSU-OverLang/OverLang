package com.overlang.domain.job.entity;

import com.overlang.domain.common.BaseTimeEntity;
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

  @Column(name = "source_language", length = 20)
  private String sourceLanguage;

  @Column(name = "target_language", nullable = false, length = 20)
  private String targetLanguage;

  @Enumerated(EnumType.STRING)
  @Column(name = "translation_provider", length = 50)
  private TranslationProvider translationProvider;

  @Column(name = "use_user_api_key", nullable = false)
  private Boolean useUserApiKey;

  @Column(name = "error_code", length = 100)
  private String errorCode;

  @Column(name = "error_message", columnDefinition = "TEXT")
  private String errorMessage;

  public Job(
          Project project,
          JobType jobType,
          String sourceLanguage,
          String targetLanguage,
          TranslationProvider translationProvider,
          Boolean useUserApiKey
  ) {
    this.project = project;
    this.jobType = jobType;
    this.status = JobStatus.PENDING;
    this.progress = 0;
    this.currentStage = CurrentStage.QUEUED;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
    this.translationProvider =
            translationProvider == null ? TranslationProvider.DEFAULT : translationProvider;
    this.useUserApiKey = useUserApiKey != null && useUserApiKey;
  }

  public void markRunning(CurrentStage stage, int progress) {
    this.status = JobStatus.RUNNING;
    this.currentStage = stage;
    this.progress = progress;
    this.errorCode = null;
    this.errorMessage = null;
  }

  public void markCompleted() {
    this.status = JobStatus.COMPLETED;
    this.currentStage = CurrentStage.FINALIZING;
    this.progress = 100;
    this.errorCode = null;
    this.errorMessage = null;
  }

  public void markFailed(String errorCode, String errorMessage) {
    this.status = JobStatus.FAILED;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
  }
}
