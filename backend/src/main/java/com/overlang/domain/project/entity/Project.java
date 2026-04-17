package com.overlang.domain.project.entity;

import com.overlang.domain.common.BaseTimeEntity;
import com.overlang.domain.member.entity.Member;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "projects")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Project extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "member_id", nullable = false)
  private Member member; // 프로젝트 생성자

  @Column(nullable = false, length = 255)
  private String title;

  @Enumerated(EnumType.STRING)
  @Column(name = "source_type", nullable = false, length = 50)
  private SourceType sourceType;

  @Column(name = "source_url", length = 1024)
  private String sourceUrl;

  @Column(name = "file_url", length = 1024)
  private String fileUrl;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 50)
  private ProjectStatus status;

  public Project(
      Member member, String title, SourceType sourceType, String sourceUrl, String fileUrl) {
    validateSource(sourceType, sourceUrl, fileUrl);
    this.member = member;
    this.title = title;
    this.sourceType = sourceType;
    this.sourceUrl = sourceUrl;
    this.fileUrl = fileUrl;
    this.status = ProjectStatus.CREATED;
  }

  private void validateSource(SourceType sourceType, String sourceUrl, String fileUrl) {
    if (sourceType == SourceType.YOUTUBE && (sourceUrl == null || sourceUrl.isBlank())) {
      throw new IllegalArgumentException("YOUTUBE source requires sourceUrl.");
    }

    if (sourceType == SourceType.UPLOAD && (fileUrl == null || fileUrl.isBlank())) {
      throw new IllegalArgumentException("UPLOAD source requires fileUrl.");
    }
  }

  public void updateStatus(ProjectStatus status) {
    this.status = status;
  }
}
