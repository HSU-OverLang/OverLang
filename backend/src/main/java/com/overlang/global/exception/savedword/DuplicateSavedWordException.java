package com.overlang.global.exception.savedword;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class DuplicateSavedWordException extends BusinessException {

  public DuplicateSavedWordException() {
    super(ErrorCode.DUPLICATE_SAVED_WORD);
  }
}
