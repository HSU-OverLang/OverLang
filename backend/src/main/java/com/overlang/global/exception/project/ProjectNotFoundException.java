package com.overlang.global.exception.project;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class ProjectNotFoundException extends BusinessException {

  public ProjectNotFoundException() {
    super(ErrorCode.PROJECT_NOT_FOUND);
  }
}
