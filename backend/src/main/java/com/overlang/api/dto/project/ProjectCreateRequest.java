package com.overlang.api.dto.project;

import com.overlang.domain.project.entity.SourceType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Schema(description = "프로젝트 생성 요청 DTO")
public record ProjectCreateRequest(
    @Schema(description = "프로젝트 제목", example = "영상 번역 프로젝트") @NotBlank String title,
    @Schema(description = "원본 유형", example = "UPLOAD") @NotNull SourceType sourceType,
    @Schema(description = "원본 URL (유튜브일 때만 사용)", example = "https://youtube.com/watch?v=xxxx")
        String sourceUrl,
    @Schema(description = "업로드 파일 URL (파일 업로드일 때만 사용)", example = "https://s3-bucket/video.mp4")
        String fileUrl,
    @Schema(description = "S3 내부 파일 키 (파일 업로드일 때만 사용)", example = "uploads/videos/abc.mp4")
        String fileKey) {}
