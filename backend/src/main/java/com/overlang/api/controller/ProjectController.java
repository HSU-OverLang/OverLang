package com.overlang.api.controller;

import com.overlang.api.dto.project.ProjectCreateRequest;
import com.overlang.api.dto.project.ProjectCreateResponse;
import com.overlang.api.dto.project.ProjectDetailResponse;
import com.overlang.api.dto.project.ProjectResponse;
import com.overlang.domain.project.service.ProjectService;
import com.overlang.global.auth.AuthInterceptor;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

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
}
