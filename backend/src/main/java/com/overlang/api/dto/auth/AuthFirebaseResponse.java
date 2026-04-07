package com.overlang.api.dto.auth;

public record AuthFirebaseResponse(
        Long memberId, String firebaseUid, String email, boolean isNewMember) {
}
