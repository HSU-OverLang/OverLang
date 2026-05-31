package com.overlang.global.exception.member;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class MemberNotFoundException extends BusinessException {

  public MemberNotFoundException() {
    super(ErrorCode.MEMBER_NOT_FOUND);
  }
}
