package com.overlang.domain.segment.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.job.entity.Job; // Job 연결
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "segments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Segment extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "job_id", nullable = false)
  private Job job;

  @Column(name = "start_time", nullable = false)
  private Double startTime;

  @Column(name = "end_time", nullable = false)
  private Double endTime;

  @Column(nullable = false)
  private Integer seq;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String text;

  @Column(name = "translated_text", columnDefinition = "TEXT")
  private String translatedText;

  @Column(name = "language_code", length = 20)
  private String languageCode;

  public Segment(
      Job job,
      Double startTime,
      Double endTime,
      Integer seq,
      String text,
      String translatedText,
      String languageCode) {
    this.job = job;
    this.startTime = startTime;
    this.endTime = endTime;
    this.seq = seq;
    this.text = text;
    this.translatedText = translatedText;
    this.languageCode = languageCode;
  }
}
