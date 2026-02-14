package kr.ac.hansung.cse.overlang.domain.job.entity;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import kr.ac.hansung.cse.overlang.domain.common.BaseTimeEntity;
import kr.ac.hansung.cse.overlang.domain.project.entity.Project;
import kr.ac.hansung.cse.overlang.domain.segment.entity.Segment;
import lombok.*;

@Entity
@Table(name = "jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Job extends BaseTimeEntity { // 시간 자동 기록

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @OneToMany(mappedBy = "job", cascade = CascadeType.ALL, orphanRemoval = true)
  private final List<Segment> segments = new ArrayList<>();

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "project_id", nullable = false)
  private Project project;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private JobStatus status;

  @Column(name = "job_type", nullable = false)
  private String type;

  public Job(Project project, String type) {
    this.project = project;
    this.type = type;
    this.status = JobStatus.PENDING;
  }

  public void setProject(Project project) {
    this.project = project;
  }

  public void addSegment(Segment segment) {
    this.segments.add(segment);
    segment.setJob(this);
  }

}
