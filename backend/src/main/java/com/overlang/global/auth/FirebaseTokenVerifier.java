package com.overlang.global.auth;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class FirebaseTokenVerifier {

  public FirebaseUserInfo verify(String idToken) {
    try {
      FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(idToken);

      String uid = decoded.getUid();
      String email = decoded.getEmail(); // null 가능

      log.info("Firebase verify success: uid={}, email={}", uid, email);
      return new FirebaseUserInfo(uid, email);

    } catch (FirebaseAuthException e) {
      log.warn("Firebase verify failed: {}", e.getMessage());
      // ✅ 1,2번(UnauthorizedException + 401 핸들러) 했으면 이거 던지면 401로 떨어짐
      throw new UnauthorizedException("Invalid or expired Firebase ID token");
    }
  }
}
