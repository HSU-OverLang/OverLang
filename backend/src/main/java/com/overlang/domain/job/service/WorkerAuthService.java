package com.overlang.domain.job.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkerAuthService {

  @Value("${worker.secret}")
  private String workerSecret;

  public void validateWorkerSecret(String requestWorkerSecret) {
    if (requestWorkerSecret == null || !workerSecret.equals(requestWorkerSecret)) {
      throw new IllegalArgumentException("Worker Secret이 일치하지 않습니다.");
    }
  }
}
