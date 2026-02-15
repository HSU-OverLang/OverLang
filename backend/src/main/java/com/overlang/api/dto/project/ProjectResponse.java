package com.overlang.api.dto.project;

import io.swagger.v3.oas.annotations.media.Schema;
import com.overlang.domain.project.entity.ProjectStatus;

@Schema(description = "프로젝트 목록 응답 DTO")
public record ProjectResponse(
    @Schema(description = "프로젝트 ID", example = "1") Long id,
    @Schema(description = "프로젝트 제목", example = "OverLang 서비스") String title,
    @Schema(description = "원본 영상 URL", example = "https://s3.amazonaws.com/video.mp4")
        String videoUrl,
    @Schema(description = "프로젝트 상태 (CREATED, PROCESSING, COMPLETED 등)", example = "CREATED")
        ProjectStatus status) {}
