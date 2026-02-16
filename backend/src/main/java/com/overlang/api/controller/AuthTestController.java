package com.overlang.api.controller;

import com.overlang.global.auth.BearerTokenResolver;
import com.overlang.global.auth.FirebaseTokenVerifier;
import com.overlang.global.auth.FirebaseUserInfo;
import com.overlang.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthTestController {

  private final BearerTokenResolver bearerTokenResolver;
  private final FirebaseTokenVerifier firebaseTokenVerifier;

  @GetMapping("/me")
  public ApiResponse<FirebaseUserInfo> me(HttpServletRequest request) {
    String token = bearerTokenResolver.resolve(request);
    FirebaseUserInfo info = firebaseTokenVerifier.verify(token);
    return ApiResponse.success(info);
  }
}
