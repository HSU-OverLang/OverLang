import json
import logging
import warnings

import torch

from ai.api.schemas import (
    AnalysisRequest,
    CallbackPayload,
    CurrentStage,
    ErrorCode,
    JobStatus,
    JobType,
    SourceType,
)
from ai.pipeline.callback_client import is_backend_job_valid, send_callback
from ai.pipeline.run_pipeline import resolve_completion_error, run_pipeline
from ai.pipeline.youtube_service import (
    YoutubeDownloadError,
    YoutubeVideoTooLongError,
)
from ai.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=UserWarning)


class DeletedBackendJobSkipped(Exception):
    """Backend에서 삭제된 Job을 감지했을 때 Celery 작업을 정상 skip하기 위한 예외입니다."""


def _build_task_meta(
    progress: float,
    current_stage: CurrentStage,
    error_code: ErrorCode | None = None,
    error_message: str | None = None,
) -> dict[str, object]:
    return {
        "progress": float(progress),
        "current_stage": current_stage.value,
        "error_code": error_code.value if isinstance(error_code, ErrorCode) else error_code,
        "error_message": error_message,
    }


def _to_callback_progress(progress: float) -> int:
    return max(0, min(100, int(round(float(progress)))))


def _execute_job_task(self, job_payload: dict):
    callback_job_id = _resolve_callback_job_id(job_payload, self.request.id)
    task_progress = {
        "progress": 0.0,
        "current_stage": CurrentStage.QUEUED,
    }
    input_reference = (
        job_payload.get("fileUrl")
        or job_payload.get("presignedUrl")
        or job_payload.get("sourceUrl")
        or "unknown-input"
    )

    try:
        logger.info(
            "Task started: celeryTaskId=%s callbackJobId=%s",
            self.request.id,
            callback_job_id,
        )
        if not is_backend_job_valid(callback_job_id):
            logger.info(
                "Task skipped because backend job is no longer valid: jobId=%s",
                callback_job_id,
            )
            self.update_state(
                state=JobStatus.COMPLETED.value,
                meta=_build_task_meta(100.0, CurrentStage.FINALIZING),
            )
            return {
                "jobId": callback_job_id,
                "skipped": True,
                "reason": "BACKEND_JOB_NOT_VALID",
            }

        def progress_callback(
            current_stage: CurrentStage,
            progress: float,
            extra: dict | None = None,
        ) -> None:
            if not is_backend_job_valid(callback_job_id):
                raise DeletedBackendJobSkipped(
                    f"Backend job is no longer valid: {callback_job_id}"
                )

            task_progress["progress"] = float(progress)
            task_progress["current_stage"] = current_stage
            self.update_state(
                state=JobStatus.RUNNING.value,
                meta=_build_task_meta(progress, current_stage),
            )
            send_callback(
                CallbackPayload(
                    job_id=callback_job_id,
                    status=JobStatus.RUNNING,
                    progress=_to_callback_progress(progress),
                    current_stage=current_stage,
                    segments=[],
                    ocr_items=[],
                    learning_data=None,
                    error_code=None,
                    error_message=None,
                )
            )

        result = run_pipeline(
            job_payload,
            progress_callback=progress_callback,
            job_id=callback_job_id,
            keep_intermediate_files=True,
        )
        completion_error_code, completion_error_message = resolve_completion_error(
            result.warnings
        )

        if not is_backend_job_valid(callback_job_id):
            logger.info(
                "Completed result skipped because backend job is no longer valid: jobId=%s",
                callback_job_id,
            )
            self.update_state(
                state=JobStatus.COMPLETED.value,
                meta=_build_task_meta(100.0, CurrentStage.FINALIZING),
            )
            return {
                "jobId": callback_job_id,
                "skipped": True,
                "reason": "BACKEND_JOB_NOT_VALID_AFTER_PROCESSING",
            }

        send_callback(
            CallbackPayload(
                job_id=callback_job_id,
                status=JobStatus.COMPLETED,
                progress=100,
                current_stage=CurrentStage.FINALIZING,
                segments=result.subtitles,
                ocr_items=result.ocr_items,
                learning_data=result.learning_data,
                error_code=completion_error_code,
                error_message=completion_error_message,
            )
        )
        return result.model_dump(by_alias=True)
    except DeletedBackendJobSkipped:
        logger.info(
            "Task skipped because backend job was deleted while running: jobId=%s",
            callback_job_id,
        )
        self.update_state(
            state=JobStatus.COMPLETED.value,
            meta=_build_task_meta(
                float(task_progress["progress"]),
                task_progress["current_stage"],
            ),
        )
        return {
            "jobId": callback_job_id,
            "skipped": True,
            "reason": "BACKEND_JOB_NOT_VALID_DURING_PROCESSING",
        }
    except Exception as error:
        error_code = ErrorCode.UNKNOWN_ERROR
        error_message = str(error)

        if "out of memory" in error_message.lower() or isinstance(
            error,
            torch.cuda.OutOfMemoryError,
        ):
            error_code = ErrorCode.GPU_OOM
            error_message = (
                "GPU Out of Memory. Please try a smaller model or batch size."
            )
        elif isinstance(error, FileNotFoundError):
            error_code = ErrorCode.INVALID_OPTIONS
            error_message = f"Input source not found: {input_reference}"
        elif isinstance(error, NotImplementedError):
            error_code = ErrorCode.INVALID_OPTIONS
        elif isinstance(error, ValueError):
            error_code = ErrorCode.INVALID_OPTIONS
        elif isinstance(error, YoutubeVideoTooLongError):
            error_code = ErrorCode.VIDEO_TOO_LONG
        elif isinstance(error, YoutubeDownloadError):
            error_code = ErrorCode.DOWNLOAD_FAILED
        elif "ffmpeg" in error_message.lower():
            error_code = ErrorCode.FFMPEG_ERROR

        logger.exception("Task failed: [%s] %s", error_code.value, error_message)
        self.update_state(
            state=JobStatus.FAILED.value,
            meta=_build_task_meta(
                float(task_progress["progress"]),
                task_progress["current_stage"],
                error_code=error_code,
                error_message=error_message,
            ),
        )
        send_callback(
            CallbackPayload(
                job_id=callback_job_id,
                status=JobStatus.FAILED,
                progress=_to_callback_progress(float(task_progress["progress"])),
                current_stage=task_progress["current_stage"],
                segments=[],
                ocr_items=[],
                learning_data=None,
                error_code=error_code.value,
                error_message=error_message,
            )
        )
        raise Exception(
            json.dumps({"code": error_code.value, "message": error_message})
        )


def _resolve_callback_job_id(
    job_payload: dict,
    celery_task_id: str,
) -> str | int:
    return job_payload.get("jobId") or job_payload.get("job_id") or celery_task_id


@celery_app.task(bind=True)
def process_job_task(self, job_payload: dict):
    return _execute_job_task(self, job_payload)


@celery_app.task(bind=True)
def process_audio_task(self, file_path: str, options: dict | None = None):
    job = AnalysisRequest(
        source_type=SourceType.UPLOAD,
        file_url=file_path,
        job_type=JobType.FULL_ANALYSIS,
        source_language=(options or {}).get("language"),
        options=options or {},
    )
    return _execute_job_task(self, job.model_dump(by_alias=True))
