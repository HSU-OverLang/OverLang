package kr.ac.hansung.cse.overlang.api.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import kr.ac.hansung.cse.overlang.api.dto.auth.AuthResponse;
import kr.ac.hansung.cse.overlang.api.dto.auth.LoginRequest;
import kr.ac.hansung.cse.overlang.api.dto.project.ProjectResponse;
import kr.ac.hansung.cse.overlang.domain.project.entity.ProjectStatus;
import kr.ac.hansung.cse.overlang.global.response.ApiResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Dummy API", description = "FE 협업용 더미 데이터")
@RestController
@RequestMapping("/api/v1")
public class DummyController {

    @Operation(summary = "프로젝트 목록 조회")
    @GetMapping("/projects")
    public ApiResponse<List<ProjectResponse>> getProjects() {
        List<ProjectResponse> data = List.of(
                new ProjectResponse(1L, "첫 번째 자막 생성", "https://example.com/video1.mp4", ProjectStatus.CREATED),
                new ProjectResponse(2L, "AI 분석 완료 영상", "https://example.com/video2.mp4", ProjectStatus.COMPLETED),
                new ProjectResponse(3L, "분석 중인 프로젝트", "https://example.com/video3.mp4", ProjectStatus.PROCESSING)
        );
        return ApiResponse.success(data);
    }

    @Operation(summary = "더미 로그인")
    @PostMapping("/auth/login")
    public ApiResponse<AuthResponse> login(@RequestBody LoginRequest request) {
        AuthResponse data = new AuthResponse("fake-jwt-access-token", "fake-jwt-refresh-token");
        return ApiResponse.success(data);
    }
}