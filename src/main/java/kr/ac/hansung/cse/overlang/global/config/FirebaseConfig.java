package kr.ac.hansung.cse.overlang.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

@Configuration
public class FirebaseConfig {

  private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

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