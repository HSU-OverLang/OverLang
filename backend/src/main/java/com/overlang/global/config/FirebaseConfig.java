package com.overlang.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
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
          FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(in)).build();

      FirebaseApp.initializeApp(options);
      log.info("Firebase Admin initialized successfully (path: {})", keyPath);

    } catch (Exception e) {
      log.error("Firebase initialization failed", e);
    }
  }

  private InputStream getServiceAccountStream(String path) throws Exception {
    String trimmed = (path == null) ? "" : path.trim();

    // classpath:xxx.json
    if (trimmed.startsWith("classpath:")) {
      String cp = trimmed.substring("classpath:".length());
      return new ClassPathResource(cp).getInputStream();
    }

    if (trimmed.startsWith("file:")) {
      return new FileInputStream(trimmed.substring("file:".length()));
    }

    // If it's an existing filesystem path, use it.
    if (Files.exists(Path.of(trimmed))) {
      return new FileInputStream(trimmed);
    }

    // Otherwise, try classpath resource with the raw name (e.g. "overlang-firebase-admin.json")
    ClassPathResource cp = new ClassPathResource(trimmed);
    if (cp.exists()) {
      return cp.getInputStream();
    }

    // Last resort: treat it as a filesystem path (will throw FileNotFoundException)
    return new FileInputStream(trimmed);
  }
}
