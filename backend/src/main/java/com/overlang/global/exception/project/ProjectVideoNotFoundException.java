package com.overlang.global.exception.project;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class ProjectVideoNotFoundException extends BusinessException {

  public ProjectVideoNotFoundException() {
    super(ErrorCode.PROJECT_VIDEO_NOT_FOUND);
  }
}
