package com.overlang.domain.learning.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.job.entity.Job;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "learning_contents")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LearningContent extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "job_id", nullable = false)
  private Job job;

  @Enumerated(EnumType.STRING)
  @Column(name = "content_type", nullable = false, length = 50)
  private LearningContentType contentType;

  @Column(length = 255)
  private String title;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String content;

  @Column(name = "start_time")
  private Double startTime;

  @Column(name = "end_time")
  private Double endTime;

  public LearningContent(
      Job job,
      LearningContentType contentType,
      String title,
      String content,
      Double startTime,
      Double endTime) {
    this.job = job;
    this.contentType = contentType;
    this.title = title;
    this.content = content;
    this.startTime = startTime;
    this.endTime = endTime;
  }
}
