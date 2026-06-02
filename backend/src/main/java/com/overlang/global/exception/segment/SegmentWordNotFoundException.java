package com.overlang.global.exception.segment;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class SegmentWordNotFoundException extends BusinessException {

  public SegmentWordNotFoundException() {
    super(ErrorCode.SEGMENT_WORD_NOT_FOUND);
  }
}
