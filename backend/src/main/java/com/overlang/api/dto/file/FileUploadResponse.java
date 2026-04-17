package com.overlang.api.dto.file;

public record FileUploadResponse(
    String fileName, // 원본 파일명
    String s3Key, // S3 내부 경로
    String fileUrl // 저장된 파일 URL
    ) {}
