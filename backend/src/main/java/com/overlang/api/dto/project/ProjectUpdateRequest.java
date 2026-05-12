package com.overlang.api.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectUpdateRequest(
    @NotBlank(message = "프로젝트 제목은 비어 있을 수 없습니다.")
        @Size(max = 100, message = "프로젝트 제목은 100자 이하로 입력해주세요.")
        String title) {}
