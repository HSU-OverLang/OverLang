package kr.ac.hansung.cse.overlang.api.controller;

import kr.ac.hansung.cse.overlang.global.response.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

  @GetMapping("/api/v1/health")
  public ApiResponse<String> health() {
    return ApiResponse.success("rnrzl");
  }
}
