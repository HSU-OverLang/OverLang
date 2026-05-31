package com.overlang.global.exception.job;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class JobNotFoundException extends BusinessException {

  public JobNotFoundException() {
    super(ErrorCode.JOB_NOT_FOUND);
  }
}
