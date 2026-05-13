package com.overlang.domain.file.service;

import com.overlang.api.dto.file.FileUploadResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Service
public class S3UploadService {

  private static final Set<String> ALLOWED_VIDEO_CONTENT_TYPES =
      Set.of("video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska");

  private static final Set<String> ALLOWED_IMAGE_CONTENT_TYPES =
      Set.of("image/jpeg", "image/png", "image/webp");

  private static final long MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

  private final S3Client s3Client;
  private final S3Presigner s3Presigner;
  private final String bucket;
  private final String region;

  public S3UploadService(
      S3Client s3Client,
      S3Presigner s3Presigner,
      @Value("${cloud.aws.s3.bucket}") String bucket,
      @Value("${cloud.aws.region.static}") String region) {
    this.s3Client = s3Client;
    this.s3Presigner = s3Presigner;
    this.bucket = bucket;
    this.region = region;
  }

  public FileUploadResponse uploadVideo(MultipartFile file) {
    validateVideoFile(file);

    String originalFilename = file.getOriginalFilename();
    String s3Key = createS3Key("uploads/videos", originalFilename);
    String fileUrl = uploadToS3(file, s3Key, "파일 업로드 중 오류가 발생했습니다.");

    return new FileUploadResponse(originalFilename, s3Key, fileUrl);
  }

  public String uploadProfileImage(MultipartFile file, Long memberId) {
    validateProfileImage(file);

    String s3Key = createS3Key("uploads/profiles/" + memberId, file.getOriginalFilename());

    return uploadToS3(file, s3Key, "프로필 이미지 업로드 중 오류가 발생했습니다.");
  }

  public String generatePresignedGetUrl(String fileKey) {
    if (fileKey == null || fileKey.isBlank()) {
      throw new IllegalArgumentException("fileKey가 필요합니다.");
    }

    GetObjectRequest getObjectRequest =
        GetObjectRequest.builder().bucket(bucket).key(fileKey).build();

    GetObjectPresignRequest presignRequest =
        GetObjectPresignRequest.builder()
            .signatureDuration(Duration.ofMinutes(30))
            .getObjectRequest(getObjectRequest)
            .build();

    return s3Presigner.presignGetObject(presignRequest).url().toString();
  }

  public void deleteFile(String fileKey) {
    if (fileKey == null || fileKey.isBlank()) {
      return;
    }

    DeleteObjectRequest deleteObjectRequest =
        DeleteObjectRequest.builder().bucket(bucket).key(fileKey).build();

    s3Client.deleteObject(deleteObjectRequest);
  }

  public void deleteFileByUrl(String fileUrl) {
    if (fileUrl == null || fileUrl.isBlank()) {
      return;
    }

    String prefix = buildS3UrlPrefix();

    if (!fileUrl.startsWith(prefix)) {
      return;
    }

    String fileKey = fileUrl.substring(prefix.length());
    deleteFile(fileKey);
  }

  private String uploadToS3(MultipartFile file, String s3Key, String errorMessage) {
    try {
      PutObjectRequest putObjectRequest =
          PutObjectRequest.builder()
              .bucket(bucket)
              .key(s3Key)
              .contentType(file.getContentType())
              .build();

      s3Client.putObject(
          putObjectRequest, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

      return buildFileUrl(s3Key);
    } catch (IOException e) {
      throw new IllegalArgumentException(errorMessage);
    }
  }

  private void validateVideoFile(MultipartFile file) {
    validateNotEmpty(file, "업로드할 파일이 없습니다.");

    if (!ALLOWED_VIDEO_CONTENT_TYPES.contains(file.getContentType())) {
      throw new IllegalArgumentException("지원하지 않는 영상 형식입니다.");
    }
  }

  private void validateProfileImage(MultipartFile file) {
    validateNotEmpty(file, "업로드할 프로필 이미지가 없습니다.");

    if (!ALLOWED_IMAGE_CONTENT_TYPES.contains(file.getContentType())) {
      throw new IllegalArgumentException("지원하지 않는 이미지 형식입니다.");
    }

    if (file.getSize() > MAX_PROFILE_IMAGE_SIZE) {
      throw new IllegalArgumentException("프로필 이미지는 5MB 이하만 업로드할 수 있습니다.");
    }
  }

  private void validateNotEmpty(MultipartFile file, String message) {
    if (file == null || file.isEmpty() || file.getContentType() == null) {
      throw new IllegalArgumentException(message);
    }
  }

  private String createS3Key(String directory, String originalFilename) {
    String extension = extractExtension(originalFilename);
    return directory + "/" + UUID.randomUUID() + extension;
  }

  private String extractExtension(String fileName) {
    if (fileName == null || !fileName.contains(".")) {
      return "";
    }

    return fileName.substring(fileName.lastIndexOf("."));
  }

  private String buildFileUrl(String s3Key) {
    return buildS3UrlPrefix() + s3Key;
  }

  private String buildS3UrlPrefix() {
    return "https://" + bucket + ".s3." + region + ".amazonaws.com/";
  }
}
