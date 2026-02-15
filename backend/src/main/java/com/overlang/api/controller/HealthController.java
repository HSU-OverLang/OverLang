package com.overlang.api.controller;

import java.sql.Connection;
import javax.sql.DataSource;
import com.overlang.api.dto.health.HealthResponse;
import com.overlang.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class HealthController {

  private final DataSource dataSource;

  @GetMapping("/api/v1/health")
  public ApiResponse<HealthResponse> health() {
    return ApiResponse.success(new HealthResponse("UP", checkDb() ? "UP" : "DOWN"));
  }

  private boolean checkDb() {
    try (Connection conn = dataSource.getConnection()) {
      return conn.isValid(1);
    } catch (Exception e) {
      return false;
    }
  }
}
