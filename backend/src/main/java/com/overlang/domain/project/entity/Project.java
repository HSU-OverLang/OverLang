package com.overlang.domain.project.entity;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.job.entity.Job;
import com.overlang.domain.member.entity.Member;
import lombok.*;

@Entity
@Table(name = "projects")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Project extends BaseTimeEntity { // 생성/수정 시간 자동화

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<Job> jobs = new ArrayList<>();

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "member_id", nullable = false)
  private Member member;

  @Column(nullable = false)
  private String title;

  @Column(nullable = false)
  private String videoUrl;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ProjectStatus status;

  public Project(Member member, String title, String videoUrl) {
    this.member = member;
    this.title = title;
    this.videoUrl = videoUrl;
    this.status = ProjectStatus.CREATED;
  }

  public void addJob(Job job) {
    jobs.add(job);
    job.setProject(this);
  }
}
