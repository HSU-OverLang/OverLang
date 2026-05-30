package com.overlang.domain.ocr.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "ocr_item_lines")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OcrItemLine {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "ocr_item_id", nullable = false)
  private OcrItem ocrItem;

  @Column(name = "line_order", nullable = false)
  private Integer lineOrder;

  @Column(name = "origin_text", nullable = false, columnDefinition = "TEXT")
  private String originText;

  @Column(nullable = false)
  private Double x;

  @Column(nullable = false)
  private Double y;

  @Column(nullable = false)
  private Double w;

  @Column(nullable = false)
  private Double h;

  private OcrItemLine(
      OcrItem ocrItem,
      Integer lineOrder,
      String originText,
      Double x,
      Double y,
      Double w,
      Double h) {
    this.ocrItem = ocrItem;
    this.lineOrder = lineOrder;
    this.originText = originText;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  public static OcrItemLine create(
      OcrItem ocrItem,
      Integer lineOrder,
      String originText,
      Double x,
      Double y,
      Double w,
      Double h) {
    return new OcrItemLine(ocrItem, lineOrder, originText, x, y, w, h);
  }
}
