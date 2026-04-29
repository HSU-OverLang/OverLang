import json
from fastapi import APIRouter

from ai.api.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    CurrentStage,
    ErrorCode,
    JobStatus,
    TaskStatusResponse,
)
from ai.worker.celery_app import celery_app

router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_audio(request: AnalysisRequest):
    task = celery_app.send_task(
        "ai.worker.tasks.process_job_task",
        args=[request.model_dump(by_alias=True)],
    )

    return AnalysisResponse(
        job_id=task.id,
        status=JobStatus.PENDING,
        message="Task submitted successfully",
    )


@router.get("/status/{job_id}", response_model=TaskStatusResponse)
async def get_task_status(job_id: str):
    task_result = celery_app.AsyncResult(job_id)
    task_info = task_result.info if isinstance(task_result.info, dict) else {}

    response = TaskStatusResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        progress=float(task_info.get("progress", 0.0)),
        current_stage=parse_current_stage(task_info.get("current_stage")),
    )

    if task_result.state == JobStatus.PENDING.value:
        response.status = JobStatus.PENDING
        response.current_stage = CurrentStage.QUEUED
        return response

    if task_result.state == JobStatus.RUNNING.value:
        response.status = JobStatus.RUNNING
        return response

    if task_result.state in {JobStatus.COMPLETED.value, "SUCCESS"}:
        response.status = JobStatus.COMPLETED
        response.progress = 100.0
        response.current_stage = (
            parse_current_stage(task_info.get("current_stage"))
            or CurrentStage.FINALIZING
        )
        response.result = task_result.result
        return response

    if task_result.state in {JobStatus.FAILED.value, "FAILURE"}:
        response.status = JobStatus.FAILED
        response.current_stage = (
            parse_current_stage(task_info.get("current_stage"))
            or CurrentStage.QUEUED
        )
        response.progress = float(task_info.get("progress", 0.0))

        if task_info.get("error_code") or task_info.get("error_message"):
            response.error_code = task_info.get("error_code")
            response.error_message = task_info.get("error_message")
            return response

        error_str = str(task_result.info)
        try:
            error_data = json.loads(error_str)
            response.error_code = error_data.get("code")
            response.error_message = error_data.get("message")
        except (json.JSONDecodeError, TypeError):
            response.error_code = ErrorCode.UNKNOWN_ERROR
            response.error_message = error_str

        return response

    return response


def parse_current_stage(value: str | None) -> CurrentStage | None:
    if not value:
        return None

    try:
        return CurrentStage(value)
    except ValueError:
        return None
