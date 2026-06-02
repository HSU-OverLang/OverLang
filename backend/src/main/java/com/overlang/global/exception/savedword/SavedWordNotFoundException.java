package com.overlang.global.exception.savedword;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class SavedWordNotFoundException extends BusinessException {

  public SavedWordNotFoundException() {
    super(ErrorCode.SAVED_WORD_NOT_FOUND);
  }
}
