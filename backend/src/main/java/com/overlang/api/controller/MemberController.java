package com.overlang.api.controller;

import com.overlang.api.dto.member.MemberWithdrawResponse;
import com.overlang.api.dto.member.ProfileImageUploadResponse;
import com.overlang.domain.member.service.MemberService;
import com.overlang.domain.member.service.MemberWithdrawService;
import com.overlang.global.auth.AuthInterceptor;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/members")
public class MemberController {

  private final MemberService memberService;
  private final MemberWithdrawService memberWithdrawService;

  private Long getMemberId(HttpServletRequest request) {
    return (Long) request.getAttribute(AuthInterceptor.AUTH_MEMBER_ID);
  }

  @Operation(summary = "프로필 이미지 업로드", description = "현재 로그인한 사용자의 프로필 이미지를 업로드합니다.")
  @PostMapping(value = "/me/profile-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ApiResponse<ProfileImageUploadResponse> uploadProfileImage(
      @RequestPart("file") MultipartFile file, HttpServletRequest httpServletRequest) {

    Long memberId = getMemberId(httpServletRequest);

    return ApiResponse.success(memberService.uploadProfileImage(memberId, file));
  }

  @Operation(summary = "회원 탈퇴", description = "현재 로그인한 사용자의 계정과 관련 데이터를 삭제합니다.")
  @DeleteMapping("/me")
  public ApiResponse<MemberWithdrawResponse> withdraw(HttpServletRequest httpServletRequest) {

    Long memberId = getMemberId(httpServletRequest);

    memberWithdrawService.withdraw(memberId);

    return ApiResponse.success(new MemberWithdrawResponse(memberId, true));
  }
}
