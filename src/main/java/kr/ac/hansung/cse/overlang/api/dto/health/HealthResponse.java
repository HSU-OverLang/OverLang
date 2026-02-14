package kr.ac.hansung.cse.overlang.api.dto.health;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "헬스 체크 응답")
public record HealthResponse(
    @Schema(description = "서버 상태", example = "UP") String server,
    @Schema(description = "DB 연결 상태", example = "UP") String db) {}
