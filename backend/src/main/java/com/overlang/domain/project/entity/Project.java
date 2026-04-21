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

  @Column(name = "source_url", length = 1024) // 유튜브 URL
  private String sourceUrl;

  @Column(name = "file_url", length = 1024) // S3 URL
  private String fileUrl;

  @Column(name = "file_key", length = 1024) // S3 내부 경로
  private String fileKey;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 50)
  private ProjectStatus status;

  public Project(
      Member member,
      String title,
      SourceType sourceType,
      String sourceUrl,
      String fileUrl,
      String fileKey) {
    validateSource(sourceType, sourceUrl, fileUrl, fileKey);
    this.member = member;
    this.title = title;
    this.sourceType = sourceType;
    this.sourceUrl = sourceUrl;
    this.fileUrl = fileUrl;
    this.fileKey = fileKey;
    this.status = ProjectStatus.CREATED;
  }

  private void validateSource(
      SourceType sourceType, String sourceUrl, String fileUrl, String fileKey) {

    switch (sourceType) { // sourceType별 검증
      case YOUTUBE -> validateYoutubeSource(sourceUrl, fileUrl, fileKey);
      case UPLOAD -> validateUploadSource(sourceUrl, fileUrl, fileKey);
      default -> throw new IllegalArgumentException("Unsupported sourceType: " + sourceType);
    }
  }

  private void validateYoutubeSource(String sourceUrl, String fileUrl, String fileKey) {
    validateRequired(sourceUrl, "YOUTUBE source requires sourceUrl."); // sourceUrl은 필수
    validateBlank(fileUrl, "YOUTUBE source must not have fileUrl."); // fileUrl 있으면 안됨
    validateBlank(fileKey, "YOUTUBE source must not have fileKey."); // fileKey 있으면 안됨
  }

  private void validateUploadSource(String sourceUrl, String fileUrl, String fileKey) {
    validateRequired(fileUrl, "UPLOAD source requires fileUrl."); // fileUrl 필수
    validateRequired(fileKey, "UPLOAD source requires fileKey."); // fileKey 필수
    validateBlank(sourceUrl, "UPLOAD source must not have sourceUrl."); // sourceUrl 있으면 안됨
  }

  private void validateRequired(String value, String message) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(message); // 값이 없으면 예외
    }
  }

  private void validateBlank(String value, String message) {
    if (value != null && !value.isBlank()) {
      throw new IllegalArgumentException(message); // 값이 있으면 안 되는 경우
    }
  }

  public void updateStatus(ProjectStatus status) {
    this.status = status;
  } // 프로젝트 상태 변경

  public void updateTitle(String title) {
    this.title = title;
  } // 프로젝트 제목 수정
}
