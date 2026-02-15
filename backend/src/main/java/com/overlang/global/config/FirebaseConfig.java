package com.overlang.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.FileInputStream;
import java.io.InputStream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

@Slf4j
@Configuration
public class FirebaseConfig {

  @Value("${firebase.service-account-path:}")
  private String keyPath;

  @PostConstruct
  public void init() {
    if (keyPath == null || keyPath.isBlank()) {
      log.warn("Firebase disabled: FIREBASE_SERVICE_ACCOUNT_PATH is empty");
      return;
    }

    if (!FirebaseApp.getApps().isEmpty()) {
      log.info("Firebase already initialized");
      return;
    }

    try (InputStream in = getServiceAccountStream(keyPath)) {

      FirebaseOptions options =
              FirebaseOptions.builder()
                      .setCredentials(GoogleCredentials.fromStream(in))
                      .build();

      FirebaseApp.initializeApp(options);
      log.info("Firebase Admin initialized successfully (path: {})", keyPath);

    } catch (Exception e) {
      log.error("Firebase initialization failed", e);
    }
  }

  private InputStream getServiceAccountStream(String path) throws Exception {

    // classpath:xxx.json
    if (path.startsWith("classpath:")) {
      String cp = path.substring("classpath:".length());
      return new ClassPathResource(cp).getInputStream();
    }

    if (path.startsWith("file:")) {
      return new FileInputStream(path.substring("file:".length()));
    }

    return new FileInputStream(path);
  }
}
