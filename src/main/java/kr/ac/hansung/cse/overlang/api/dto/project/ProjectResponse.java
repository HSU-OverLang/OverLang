package kr.ac.hansung.cse.overlang.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "프로젝트 목록 응답 DTO")
public record ProjectResponse(
        @Schema(description = "프로젝트 ID", example = "1")
        Long id,

        @Schema(description = "프로젝트 제목", example = "OverLang 서비스")
        String title,

        @Schema(description = "프로젝트 설명", example = "외국어 학습 플랫폼입니다.")
        String description
) {}