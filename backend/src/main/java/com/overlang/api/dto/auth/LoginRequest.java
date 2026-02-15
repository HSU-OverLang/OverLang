package com.overlang.api.dto.auth;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "로그인 요청 DTO")
public record LoginRequest(
    @Schema(description = "사용자 이메일", example = "test@example.com") String email,
    @Schema(description = "비밀번호", example = "password123!") String password) {}
