package com.overlang.global.exception.external;

import com.overlang.global.exception.BusinessException;
import com.overlang.global.exception.ErrorCode;

public class OpenAiResponseParseException extends BusinessException {

  public OpenAiResponseParseException() {
    super(ErrorCode.OPENAI_RESPONSE_PARSE_FAILED);
  }
}
