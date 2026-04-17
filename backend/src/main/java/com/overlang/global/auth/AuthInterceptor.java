package com.overlang.global.auth;

import com.overlang.domain.member.entity.Member;
import com.overlang.domain.member.service.MemberService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

  public static final String AUTH_MEMBER_ID = "AUTH_MEMBER_ID";

  private final BearerTokenResolver bearerTokenResolver;
  private final FirebaseTokenVerifier firebaseTokenVerifier;
  private final MemberService memberService;

  @Override
  public boolean preHandle(
      HttpServletRequest request, HttpServletResponse response, Object handler) {

    String token = bearerTokenResolver.resolve(request);
    FirebaseUserInfo userInfo = firebaseTokenVerifier.verify(token);

    Member member = memberService.getByFirebaseUid(userInfo.firebaseUid());

    request.setAttribute(AUTH_MEMBER_ID, member.getId());
    return true;
  }
}
