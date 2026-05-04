package com.overlang.api.dto.project;

import com.overlang.domain.project.entity.ProjectStatus;
import com.overlang.domain.project.entity.SourceType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

@Schema(description = "프로젝트 목록 응답 DTO")
public record ProjectResponse(
    @Schema(description = "프로젝트 ID", example = "1") Long id,
    @Schema(description = "프로젝트 제목", example = "OverLang 서비스") String title,
    @Schema(description = "원본 유형", example = "UPLOAD") SourceType sourceType,
    @Schema(description = "원본 URL (YOUTUBE일 때만 존재)", example = "null") String sourceUrl,
    @Schema(description = "업로드 파일 URL (UPLOAD일 때만 존재)", example = "https://s3-bucket/video.mp4")
        String fileUrl,
    @Schema(description = "프로젝트 상태", example = "CREATED") ProjectStatus status,
    @Schema(description = "생성 시각", example = "2026-04-18T10:00:00Z") Instant createdAt) {}
