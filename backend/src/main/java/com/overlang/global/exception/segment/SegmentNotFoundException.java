package com.overlang.global.exception.segment;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class SegmentNotFoundException extends BusinessException {

  public SegmentNotFoundException() {
    super(ErrorCode.SEGMENT_NOT_FOUND);
  }
}
