package kr.ac.hansung.cse.overlang.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import lombok.extern.slf4j.Slf4j; // 롬복 라이브러리 추가
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

@Slf4j
@Configuration
public class FirebaseConfig {

  @Value("${firebase.service-account-path}")
  private String keyPath;

  @PostConstruct
  public void init() {
    try {
      if (keyPath == null || keyPath.isBlank()) {
        log.warn("Firebase disabled: FIREBASE_SERVICE_ACCOUNT_PATH is empty");
        return;
      }

      if (!FirebaseApp.getApps().isEmpty()) {
        return;
      }

      InputStream in = new ClassPathResource(keyPath).getInputStream();

      FirebaseOptions options =
          FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(in)).build();

      FirebaseApp.initializeApp(options);
      log.info("Firebase Admin initialization successful (Path: {})", keyPath);

    } catch (Exception e) {
      log.error("Firebase initialization failed", e);
    }
  }
}
