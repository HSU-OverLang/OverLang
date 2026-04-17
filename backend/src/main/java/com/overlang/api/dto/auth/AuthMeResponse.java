package com.overlang.api.dto.auth;

public record AuthMeResponse(Long memberId, String firebaseUid, String email, String name) {}
