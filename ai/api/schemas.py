from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from enum import Enum


class ErrorCode(str, Enum):
    """
    Worker에서 발생할 수 있는 에러 코드 정의.
    FE는 이 코드를 기반으로 사용자에게 적절한 안내 메시지를 표시해야 함.
    """

    GPU_OOM = "WORKER_001"  # GPU 메모리 부족
    FILE_NOT_SUPPORTED = "WORKER_002"  # 지원하지 않는 파일 또는 파일 없음
    UNKNOWN_ERROR = "WORKER_999"  # 알 수 없는 에러


class CamelModel(BaseModel):
    """
    기본 Pydantic 설정을 담은 베이스 모델.
    JSON 변환 시 snake_case를 CamelCase로 자동 변환.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=lambda s: "".join(
            word.capitalize() if i > 0 else word for i, word in enumerate(s.split("_"))
        ),
    )


class AnalysisRequest(CamelModel):
    """분석 요청 메타데이터"""

    file_path: str  # 분석할 오디오 파일의 절대 경로
    options: Optional[dict] = (
        None  # 추가 분석 옵션 (예: {"no_align": true, "language": "ko"})
    )


class AnalysisResponse(CamelModel):
    """작업 생성 응답"""

    job_id: str  # 생성된 작업 ID (GUID)
    status: str  # 초기 상태 (PENDING)
    message: str  # 응답 메시지


class TaskStatusResponse(CamelModel):
    """작업 상태 조회 응답"""

    job_id: str
    status: str  # PENDING, PROCESSING, SUCCESS, FAILURE
    progress: float  # 0.0 ~ 100.0
    result: Optional[Any] = None  # 성공 시 결과 데이터
    error_code: Optional[ErrorCode] = None  # 실패 시 에러 코드
    error_message: Optional[str] = None  # 실패 시 상세 메시지
