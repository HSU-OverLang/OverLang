from fastapi import APIRouter
from ai.api.schemas import AnalysisRequest, AnalysisResponse, TaskStatusResponse
from ai.worker.celery_app import celery_app
from celery.result import AsyncResult

router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_audio(request: AnalysisRequest):
    """
    오디오 분석 작업을 요청.
    Celery Worker에게 작업을 비동기로 전달하고, 작업 ID(Job ID)를 즉시 반환.

    Args:
        request.file_path: 분석할 오디오 파일 경로 (Docker 내부 경로)
        request.options: 분석 옵션 (모델명, 언어, 배치 사이즈 등)

    Returns:
        jobId: 작업 추적 ID
        status: PENDING (작업 대기 중)
    """
    # Celery 작업 큐에 작업 추가 (비동기)
    # send_task를 사용하여 Worker 코드와의 의존성을 분리.
    task = celery_app.send_task(
        "ai.worker.tasks.process_audio_task", args=[request.file_path, request.options]
    )

    return AnalysisResponse(
        job_id=task.id, status="PENDING", message="Task submitted successfully"
    )


@router.get("/status/{job_id}", response_model=TaskStatusResponse)
async def get_task_status(job_id: str):
    """
    특정 작업(Job ID)의 현재 상태와 결과를 조회.

    Returns:
        status: PENDING, PROCESSING, SUCCESS, FAILURE 중 하나
        progress: 진행률 (0.0 ~ 100.0)
        result: 완료된 경우 분석 결과 데이터
        errorCode: 실패 시 에러 코드
        errorMessage: 실패 시 에러 메시지
    """
    task_result = AsyncResult(job_id)

    response = TaskStatusResponse(
        job_id=job_id, status=task_result.status, progress=0.0
    )

    if task_result.state == "PENDING":
        response.status = "PENDING"
    elif task_result.state == "PROCESSING":
        response.status = "PROCESSING"
        if isinstance(task_result.info, dict):
            response.progress = float(task_result.info.get("progress", 0))
    elif task_result.state == "SUCCESS":
        response.status = "SUCCESS"
        response.progress = 100.0
        response.result = task_result.result
    elif task_result.state == "FAILURE":
        response.status = "FAILURE"
        # Worker에서 발생한 에러 정보를 파싱.
        error_str = str(task_result.info)
        try:
            # Worker가 JSON 형태로 에러를 던졌다면 파싱해서 구조화된 정보를 반환.
            import json

            error_data = json.loads(error_str)
            response.error_code = error_data.get("code")
            response.error_message = error_data.get("message")
        except (json.JSONDecodeError, TypeError):
            # 일반 파이썬 예외인 경우 그대로 반환
            response.error_code = "WORKER_999"  # UNKNOWN
            response.error_message = error_str

    return response
