package com.overlang.api.controller;

import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.service.MemberService;
import com.overlang.domain.member.service.MemberService.MemberWithStatus;
import com.overlang.global.auth.BearerTokenResolver;
import com.overlang.global.auth.FirebaseTokenVerifier;
import com.overlang.global.auth.FirebaseUserInfo;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

  private final BearerTokenResolver bearerTokenResolver;
  private final FirebaseTokenVerifier firebaseTokenVerifier;
  private final MemberService memberService;

  @Operation(summary = "회원가입/로그인", description = "Firebase 토큰을 검증하고, DB에 없으면 가입, 있으면 로그인을 처리합니다.")
  @PostMapping("/firebase")
  public ApiResponse<AuthFirebaseResponse> firebase(HttpServletRequest request) {
    String idToken = bearerTokenResolver.resolve(request);
    FirebaseUserInfo userInfo = firebaseTokenVerifier.verify(idToken);

    MemberWithStatus result =
        memberService.findOrCreate(userInfo.firebaseUid(), userInfo.email(), userInfo.name());
    Member member = result.member();

    return ApiResponse.success(
        new AuthFirebaseResponse(
            member.getId(), member.getFirebaseUid(), member.getEmail(), result.isNewMember()));
  }

  @Operation(summary = "사용자 정보 조회", description = "토큰을 통해 현재 로그인한 사용자의 정보를 가져옵니다.")
  @GetMapping("/me")
  public ApiResponse<AuthFirebaseResponse> getMyInfo(HttpServletRequest request) {
    String idToken = bearerTokenResolver.resolve(request);
    FirebaseUserInfo userInfo = firebaseTokenVerifier.verify(idToken);

    // 조회 시, 현재 정보&신규 여부
    MemberWithStatus result =
        memberService.findOrCreate(userInfo.firebaseUid(), userInfo.email(), userInfo.name());
    Member member = result.member();

    return ApiResponse.success(
        new AuthFirebaseResponse(
            member.getId(), member.getFirebaseUid(), member.getEmail(), result.isNewMember()));
  }

  // DTO 레코드
  public record AuthFirebaseResponse(
      Long memberId, String firebaseUid, String email, boolean isNewMember) {}
}
