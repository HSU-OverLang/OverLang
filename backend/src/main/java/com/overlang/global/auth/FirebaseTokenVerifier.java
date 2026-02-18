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
      String email = decoded.getEmail();
      String name = decoded.getName();

      log.info("Firebase verify success: uid={}, email={}, name={}", uid, email, name);
      return new FirebaseUserInfo(uid, email, name);

    } catch (FirebaseAuthException e) {
      log.warn("Firebase verify failed: {}", e.getMessage());
      throw new UnauthorizedException("Invalid or expired Firebase ID token");
    }
  }
}
