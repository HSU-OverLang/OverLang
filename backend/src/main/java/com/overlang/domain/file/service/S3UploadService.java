package com.overlang.domain.file.service;

import com.overlang.api.dto.file.FileUploadResponse;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3UploadService {

  private static final Set<String> ALLOWED_CONTENT_TYPES =
      Set.of("video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska");

  private final S3Client s3Client;
  private final String bucket;
  private final String region;

  public S3UploadService(
      S3Client s3Client,
      @Value("${cloud.aws.s3.bucket}") String bucket,
      @Value("${cloud.aws.region.static}") String region) {
    this.s3Client = s3Client;
    this.bucket = bucket;
    this.region = region;
  }

  public FileUploadResponse uploadVideo(MultipartFile file) {
    validateFile(file);

    String originalFilename = file.getOriginalFilename();
    String extension = extractExtension(originalFilename);
    String uniqueFileName = UUID.randomUUID() + extension;
    String s3Key = "uploads/videos/" + uniqueFileName;

    try {
      PutObjectRequest putObjectRequest =
          PutObjectRequest.builder()
              .bucket(bucket)
              .key(s3Key)
              .contentType(file.getContentType())
              .build();

      s3Client.putObject(
          putObjectRequest, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

      String fileUrl = buildFileUrl(s3Key);

      return new FileUploadResponse(originalFilename, s3Key, fileUrl);
    } catch (IOException e) {
      throw new IllegalArgumentException("파일 업로드 중 오류가 발생했습니다.");
    }
  }

  private void validateFile(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("업로드할 파일이 없습니다.");
    }

    if (file.getContentType() == null || !ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
      throw new IllegalArgumentException("지원하지 않는 영상 형식입니다.");
    }
  }

  private String extractExtension(String fileName) {
    if (fileName == null || !fileName.contains(".")) {
      return "";
    }
    return fileName.substring(fileName.lastIndexOf("."));
  }

  private String buildFileUrl(String s3Key) {
    return "https://" + bucket + ".s3." + region + ".amazonaws.com/" + s3Key;
  }
}
