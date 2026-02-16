package com.overlang.global.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class BearerTokenResolver {

  private static final String AUTH_HEADER = "Authorization";
  private static final String BEARER_PREFIX = "Bearer ";

  public String resolve(HttpServletRequest request) {
    String header = request.getHeader(AUTH_HEADER);

    if (header == null || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException("Invalid or missing Authorization header");
    }

    String token = header.substring(BEARER_PREFIX.length()).trim();

    if (token.isEmpty()) {
      throw new UnauthorizedException("Bearer token is empty");
    }

    return token;
  }
}
