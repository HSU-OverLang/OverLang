package kr.ac.hansung.cse.overlang.api.dto.auth;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "로그인 인증 응답 DTO")
public record AuthResponse(
    @Schema(description = "액세스 토큰") String accessToken,
    @Schema(description = "리프레시 토큰") String refreshToken) {}
