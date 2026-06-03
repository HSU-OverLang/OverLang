package com.overlang.global.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import jakarta.annotation.PostConstruct;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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

  @Value("${firebase.service-account-json:}")
  private String serviceAccountJson;

  @PostConstruct
  public void init() {
    if (!FirebaseApp.getApps().isEmpty()) {
      log.info("Firebase already initialized");
      return;
    }

    try (InputStream in = getServiceAccountStream()) {
      FirebaseOptions options =
          FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(in)).build();

      FirebaseApp.initializeApp(options);
      log.info("Firebase Admin initialized successfully");

    } catch (Exception e) {
      log.error("Firebase initialization failed", e);
    }
  }

  private InputStream getServiceAccountStream() throws Exception {
    if (serviceAccountJson != null && !serviceAccountJson.isBlank()) {
      return new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));
    }

    String trimmed = (keyPath == null) ? "" : keyPath.trim();

    if (trimmed.isBlank()) {
      throw new IllegalStateException("Firebase service account is not configured");
    }

    if (trimmed.startsWith("classpath:")) {
      String cp = trimmed.substring("classpath:".length());
      return new ClassPathResource(cp).getInputStream();
    }

    if (trimmed.startsWith("file:")) {
      return new FileInputStream(trimmed.substring("file:".length()));
    }

    if (Files.exists(Path.of(trimmed))) {
      return new FileInputStream(trimmed);
    }

    ClassPathResource cp = new ClassPathResource(trimmed);
    if (cp.exists()) {
      return cp.getInputStream();
    }

    return new FileInputStream(trimmed);
  }
}
