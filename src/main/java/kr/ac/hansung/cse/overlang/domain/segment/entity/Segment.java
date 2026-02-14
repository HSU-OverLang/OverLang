package kr.ac.hansung.cse.overlang.domain.segment.entity;

import jakarta.persistence.*;
import kr.ac.hansung.cse.overlang.domain.common.BaseTimeEntity;
import kr.ac.hansung.cse.overlang.domain.job.entity.Job; // Job 연결
import lombok.*;

@Entity
@Table(name = "segments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Segment extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "job_id", nullable = false)
  private Job job;

  @Column(nullable = false)
  private Double startTime; // 시간 포맷(소수점 3자리)

  @Column(nullable = false)
  private Double endTime; // 시간 포맷(소수점 3자리)

  @Column(nullable = false)
  private Integer seq; // 구간 순서

  @Column(columnDefinition = "TEXT", nullable = false)
  private String text; // 자막 내용

  public void setJob(Job job) {
    this.job = job;
  }

  public Segment(Job job, Double startTime, Double endTime, Integer seq, String text) {
    this.job = job;
    this.startTime = startTime;
    this.endTime = endTime;
    this.seq = seq;
    this.text = text;
  }

}
