package com.overlang.domain.ocr.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.job.entity.Job;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ocr_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OcrItem extends BaseTimeEntity {

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

  @Column(name = "origin_text", nullable = false, columnDefinition = "TEXT")
  private String originText;

  @Column(name = "translated_text", columnDefinition = "TEXT")
  private String translatedText;

  @Column(nullable = false)
  private Double x;

  @Column(nullable = false)
  private Double y;

  @Column(nullable = false)
  private Double w;

  @Column(nullable = false)
  private Double h;

  @Column private Double confidence;

  public OcrItem(
      Job job,
      Double startTime,
      Double endTime,
      String originText,
      String translatedText,
      Double x,
      Double y,
      Double w,
      Double h,
      Double confidence) {
    this.job = job;
    this.startTime = startTime;
    this.endTime = endTime;
    this.originText = originText;
    this.translatedText = translatedText;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.confidence = confidence;
  }
}
