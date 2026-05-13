package com.overlang.api.dto.project;

import com.overlang.domain.project.entity.Project;
import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;

public record ProjectUpdateResponse(
    Long projectId,
    String title,
    SourceType sourceType,
    String sourceUrl,
    String fileUrl,
    ProjectStatus status) {

  public static ProjectUpdateResponse from(Project project) {
    return new ProjectUpdateResponse(
        project.getId(),
        project.getTitle(),
        project.getSourceType(),
        project.getSourceUrl(),
        project.getFileUrl(),
        project.getStatus());
  }
}
