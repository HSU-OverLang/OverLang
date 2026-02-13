package kr.ac.hansung.cse.overlang.global.response;

import lombok.Getter;

@Getter
public class ApiResponse<T> {

  private final boolean success;
  private final T data;
  private final ErrorResponse error;

  private ApiResponse(boolean success, T data, ErrorResponse error) {
    this.success = success;
    this.data = data;
    this.error = error;
  }

  public static <T> ApiResponse<T> success(T data) {
    return new ApiResponse<>(true, data, null);
  }

  public static ApiResponse<Void> success() {
    return new ApiResponse<>(true, null, null);
  }

  public static ApiResponse<Void> error(String code, String message) {
    return new ApiResponse<>(false, null, new ErrorResponse(code, message));
  }

  @Getter
  public static class ErrorResponse {
    private final String code;
    private final String message;

    private ErrorResponse(String code, String message) {
      this.code = code;
      this.message = message;
    }
  }
}
