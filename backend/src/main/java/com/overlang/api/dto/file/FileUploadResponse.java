package com.overlang.api.dto.file;

public record FileUploadResponse(String fileName, String s3Key, String fileUrl) {}
