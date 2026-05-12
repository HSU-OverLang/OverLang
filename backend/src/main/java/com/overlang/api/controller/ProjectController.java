package com.overlang.api.controller;

import com.overlang.api.dto.file.PresignedUrlResponse;
import com.overlang.api.dto.project.ProjectCreateRequest;
import com.overlang.api.dto.project.ProjectCreateResponse;
import com.overlang.api.dto.project.ProjectDeleteResponse;
import com.overlang.api.dto.project.ProjectDetailResponse;
import com.overlang.api.dto.project.ProjectResponse;
import com.overlang.api.dto.project.ProjectUpdateRequest;
import com.overlang.api.dto.project.ProjectUpdateResponse;
import com.overlang.domain.project.service.ProjectService;
import com.overlang.global.auth.AuthInterceptor;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/projects")
public class ProjectController {

  private final ProjectService projectService;

  @Operation(summary = "프로젝트 생성")
  @PostMapping
  public ApiResponse<ProjectCreateResponse> createProject(
      @Valid @RequestBody ProjectCreateRequest request, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    ProjectCreateResponse response = projectService.createProject(memberId, request);
    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 조회")
  @GetMapping
  public ApiResponse<List<ProjectResponse>> getProjects(HttpServletRequest httpServletRequest) {
    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    List<ProjectResponse> response = projectService.getProjects(memberId);
    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 상세 조회")
  @GetMapping("/{projectId}")
  public ApiResponse<ProjectDetailResponse> getProject(
      @PathVariable Long projectId, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    ProjectDetailResponse response = projectService.getProject(memberId, projectId);
    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 수정")
  @PatchMapping("/{projectId}")
  public ApiResponse<ProjectUpdateResponse> updateProject(
      @PathVariable Long projectId,
      @Valid @RequestBody ProjectUpdateRequest request,
      HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    ProjectUpdateResponse response = projectService.updateProject(memberId, projectId, request);

    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 삭제")
  @DeleteMapping("/{projectId}")
  public ApiResponse<ProjectDeleteResponse> deleteProject(
      @PathVariable Long projectId, HttpServletRequest httpServletRequest) {

    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    ProjectDeleteResponse response = projectService.deleteProject(memberId, projectId);

    return ApiResponse.success(response);
  }

  @Operation(summary = "프로젝트 영상 재생용 Presigned URL 발급")
  @GetMapping("/{projectId}/video-url")
  public ApiResponse<PresignedUrlResponse> getVideoUrl(
      @PathVariable Long projectId, HttpServletRequest httpServletRequest) {
    Long memberId = (Long) httpServletRequest.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);

    String presignedUrl = projectService.getVideoPresignedUrl(memberId, projectId);

    return ApiResponse.success(new PresignedUrlResponse(presignedUrl));
  }
}
