package com.overlang.api.controller;

import com.overlang.api.dto.file.FileUploadResponse;
import com.overlang.domain.file.service.S3UploadService;
import com.overlang.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/files")
public class FileController {

  private final S3UploadService s3UploadService;

  @Operation(summary = "파일 업로드")
  @PostMapping(value = "/upload", consumes = "multipart/form-data")
  public ApiResponse<FileUploadResponse> upload(@RequestPart("file") MultipartFile file) {
    FileUploadResponse response = s3UploadService.uploadVideo(file);
    return ApiResponse.success(response);
  }
}
