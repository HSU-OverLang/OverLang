package com.overlang.domain.ocr.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.job.entity.Job;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
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

  @Column(name = "background_color", length = 20)
  private String backgroundColor;

  @Column(name = "dominant_background_color", length = 20)
  private String dominantBackgroundColor;

  @Column(name = "text_color", length = 20)
  private String textColor;

  @Column(name = "blur_x")
  private Double blurX;

  @Column(name = "blur_y")
  private Double blurY;

  @Column(name = "blur_w")
  private Double blurW;

  @Column(name = "blur_h")
  private Double blurH;

  @Column(name = "font_size_ratio")
  private Double fontSizeRatio;

  @Column(name = "font_weight", length = 20)
  private String fontWeight;

  @Column(name = "text_align", length = 20)
  private String textAlign;

  @Column(name = "animation_type", length = 30)
  private String animationType;

  @Column(name = "animation_start_time")
  private Double animationStartTime;

  @Column(name = "animation_end_time")
  private Double animationEndTime;

  @OneToMany(mappedBy = "ocrItem", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<OcrItemLine> lines = new ArrayList<>();

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
      Double confidence,
      String backgroundColor,
      String dominantBackgroundColor,
      String textColor,
      Double blurX,
      Double blurY,
      Double blurW,
      Double blurH,
      Double fontSizeRatio,
      String fontWeight,
      String textAlign,
      String animationType,
      Double animationStartTime,
      Double animationEndTime) {
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
    this.backgroundColor = backgroundColor;
    this.dominantBackgroundColor = dominantBackgroundColor;
    this.textColor = textColor;
    this.blurX = blurX;
    this.blurY = blurY;
    this.blurW = blurW;
    this.blurH = blurH;
    this.fontSizeRatio = fontSizeRatio;
    this.fontWeight = fontWeight;
    this.textAlign = textAlign;
    this.animationType = animationType;
    this.animationStartTime = animationStartTime;
    this.animationEndTime = animationEndTime;
  }

  public void addLine(OcrItemLine line) {
    this.lines.add(line);
  }
}
