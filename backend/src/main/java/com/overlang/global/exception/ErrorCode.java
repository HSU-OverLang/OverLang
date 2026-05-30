package com.overlang.global.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

  // Common
  INVALID_REQUEST(HttpStatus.BAD_REQUEST, "COMMON_400", "잘못된 요청입니다."),
  NOT_FOUND(HttpStatus.NOT_FOUND, "COMMON_404", "요청한 대상을 찾을 수 없습니다."),
  INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_500", "서버 내부 오류가 발생했습니다."),

  // Auth
  UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "AUTH_001", "인증이 필요합니다."),

  // Member
  MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "MEMBER_404", "존재하지 않는 회원입니다."),

  // Project
  PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "PROJECT_404", "존재하지 않는 프로젝트입니다."),
  PROJECT_VIDEO_NOT_FOUND(HttpStatus.BAD_REQUEST, "PROJECT_400", "업로드된 영상이 없습니다."),
  INVALID_PROJECT_SEGMENT(HttpStatus.BAD_REQUEST, "PROJECT_400", "해당 프로젝트의 세그먼트만 수정할 수 있습니다."),

  // Job
  JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "JOB_404", "작업을 찾을 수 없습니다."),
  INVALID_JOB_REQUEST(HttpStatus.BAD_REQUEST, "JOB_400", "잘못된 작업 요청입니다."),

  // SavedWord
  SAVED_WORD_NOT_FOUND(HttpStatus.NOT_FOUND, "SAVED_WORD_404", "저장 단어를 찾을 수 없습니다."),
  DUPLICATE_SAVED_WORD(HttpStatus.CONFLICT, "SAVED_WORD_409", "이미 저장된 단어입니다."),

  // Segment
  SEGMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SEGMENT_404", "세그먼트를 찾을 수 없습니다."),
  SEGMENT_WORD_NOT_FOUND(HttpStatus.NOT_FOUND, "SEGMENT_WORD_404", "세그먼트 단어를 찾을 수 없습니다."),

  // File
  FILE_UPLOAD_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_500", "파일 업로드에 실패했습니다."),
  INVALID_FILE_REQUEST(HttpStatus.BAD_REQUEST, "FILE_400", "잘못된 파일 요청입니다."),

  // External
  OPENAI_RESPONSE_PARSE_FAILED(
      HttpStatus.INTERNAL_SERVER_ERROR, "OPENAI_500", "OpenAI 응답 처리 중 오류가 발생했습니다.");

  private final HttpStatus httpStatus;
  private final String code;
  private final String message;

  ErrorCode(HttpStatus httpStatus, String code, String message) {
    this.httpStatus = httpStatus;
    this.code = code;
    this.message = message;
  }

  public HttpStatus getHttpStatus() {
    return httpStatus;
  }

  public String getCode() {
    return code;
  }

  public String getMessage() {
    return message;
  }
}
