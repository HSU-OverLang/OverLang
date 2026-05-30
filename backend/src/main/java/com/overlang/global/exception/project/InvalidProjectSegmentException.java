package com.overlang.global.exception.project;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class InvalidProjectSegmentException extends BusinessException {

  public InvalidProjectSegmentException() {
    super(ErrorCode.INVALID_PROJECT_SEGMENT);
  }
}
