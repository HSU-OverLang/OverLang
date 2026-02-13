package kr.ac.hansung.cse.overlang.global.response;

import io.swagger.v3.oas.annotations.media.Schema;

public class ApiResponse<T> {

  @Schema(
      description = "응답 상태",
      allowableValues = {"SUCCESS", "ERROR"})
  private Status status; // SUCCESS / ERROR

  @Schema(description = "응답 데이터")
  private T data;

  @Schema(description = "에러 정보 (성공 시 null)")
  private ErrorResponse error;

  public enum Status {
    SUCCESS,
    ERROR
  }

  public static <T> ApiResponse<T> success(T data) {
    ApiResponse<T> response = new ApiResponse<>();
    response.status = Status.SUCCESS;
    response.data = data;
    response.error = null;
    return response;
  }

  public static <T> ApiResponse<T> error(String code, String message) {
    ApiResponse<T> response = new ApiResponse<>();
    response.status = Status.ERROR;
    response.data = null;
    response.error = new ErrorResponse(code, message);
    return response;
  }

  public Status getStatus() {
    return status;
  }

  public T getData() {
    return data;
  }

  public ErrorResponse getError() {
    return error;
  }
}
