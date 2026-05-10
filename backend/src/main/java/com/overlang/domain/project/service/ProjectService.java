package com.overlang.domain.project.service;

import com.overlang.api.dto.project.ProjectCreateRequest;
import com.overlang.api.dto.project.ProjectCreateResponse;
import com.overlang.api.dto.project.ProjectDetailResponse;
import com.overlang.api.dto.project.ProjectResponse;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.repository.MemberRepository;
import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.SourceType;
import com.overlang.domain.project.repository.ProjectRepository;
import com.overlang.global.util.YoutubeUrlUtils;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class ProjectService {

  private final ProjectRepository projectRepository;
  private final MemberRepository memberRepository;
  private final S3UploadService s3UploadService;

  public ProjectCreateResponse createProject(Long memberId, ProjectCreateRequest request) {
    Member member =
        memberRepository
            .findById(memberId)
            .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

    String youtubeVideoId = null;

    if (request.sourceType() == SourceType.YOUTUBE) {
      youtubeVideoId = YoutubeUrlUtils.extractVideoId(request.sourceUrl());
    }

    Project project =
        new Project(
            member,
            request.title(),
            request.sourceType(),
            request.sourceUrl(),
            youtubeVideoId,
            request.fileUrl(),
            request.fileKey());

    Project savedProject = projectRepository.save(project);

    return new ProjectCreateResponse(
        savedProject.getId(),
        member.getId(),
        savedProject.getTitle(),
        savedProject.getSourceType(),
        savedProject.getSourceUrl(),
        savedProject.getFileUrl(),
        savedProject.getFileKey(),
        savedProject.getStatus(),
        savedProject.getCreatedAt());
  }

  @Transactional(readOnly = true)
  public List<ProjectResponse> getProjects(Long memberId) {
    return projectRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
        .map(
            project ->
                new ProjectResponse(
                    project.getId(),
                    project.getTitle(),
                    project.getSourceType(),
                    project.getSourceUrl(),
                    project.getFileUrl(),
                    project.getStatus(),
                    project.getCreatedAt()))
        .toList();
  }

  @Transactional(readOnly = true)
  public ProjectDetailResponse getProject(Long memberId, Long projectId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    return new ProjectDetailResponse(
        project.getId(),
        project.getMember().getId(),
        project.getTitle(),
        project.getSourceType(),
        project.getSourceUrl(),
        project.getFileUrl(),
        project.getStatus(),
        project.getCreatedAt());
  }

  @Transactional(readOnly = true)
  public String getVideoPresignedUrl(Long memberId, Long projectId) {
    Project project =
        projectRepository
            .findByIdAndMemberId(projectId, memberId)
            .orElseThrow(() -> new IllegalArgumentException("해당 프로젝트를 찾을 수 없습니다."));

    if (project.getFileKey() == null || project.getFileKey().isBlank()) {
      throw new IllegalArgumentException("업로드된 영상이 없습니다.");
    }

    return s3UploadService.generatePresignedGetUrl(project.getFileKey());
  }
}
