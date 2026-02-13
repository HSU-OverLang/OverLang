package kr.ac.hansung.cse.overlang.global.advice;

import kr.ac.hansung.cse.overlang.global.response.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(Exception.class)
  public ApiResponse<Void> handleException(Exception e) {
    return ApiResponse.error(HttpStatus.INTERNAL_SERVER_ERROR.name(), e.getMessage());
  }
}
