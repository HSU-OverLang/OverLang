import json
import logging
import os
import warnings

import torch

from ai.api.schemas import CurrentStage, ErrorCode, JobStatus
from ai.stt_service import STTService
from ai.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=UserWarning)

current_stt_service = STTService(model_name="large-v3-turbo")


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


@celery_app.task(bind=True)
def process_audio_task(self, file_path: str, options: dict | None = None):
    global current_stt_service

    try:
        logger.info("Task started: %s", file_path)
        self.update_state(
            state=JobStatus.RUNNING.value,
            meta=_build_task_meta(0, CurrentStage.QUEUED),
        )

        options = options or {}
        target_model = options.get("model", current_stt_service.model_name)
        batch_size = options.get("batch_size", 16)
        no_align = options.get("no_align", False)
        language = options.get("language", "ko")

        if current_stt_service.model_name != target_model:
            logger.info(
                "Switching model: %s -> %s",
                current_stt_service.model_name,
                target_model,
            )
            current_stt_service.unload_model()
            current_stt_service = STTService(model_name=target_model)
            current_stt_service.load_model()

        self.update_state(
            state=JobStatus.RUNNING.value,
            meta=_build_task_meta(20, CurrentStage.STT_TRANSCRIPTION),
        )

        result = current_stt_service.transcribe(
            audio_path=file_path,
            batch_size=batch_size,
            align=not no_align,
            language=language,
        )

        self.update_state(
            state=JobStatus.RUNNING.value,
            meta=_build_task_meta(90, CurrentStage.FINALIZING),
        )

        output_json_path = f"{os.path.splitext(file_path)[0]}_result.json"
        with open(output_json_path, "w", encoding="utf-8") as file:
            json.dump(result, file, ensure_ascii=False, indent=2)

        logger.info("Result saved to: %s", output_json_path)

        self.update_state(
            state=JobStatus.COMPLETED.value,
            meta=_build_task_meta(100, CurrentStage.FINALIZING),
        )
        return result
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
            current_stt_service.unload_model()
        elif isinstance(error, FileNotFoundError):
            error_code = ErrorCode.INVALID_OPTIONS
            error_message = f"Audio file not found: {file_path}"

        logger.exception("Task failed: [%s] %s", error_code.value, error_message)
        self.update_state(
            state=JobStatus.FAILED.value,
            meta=_build_task_meta(
                0,
                CurrentStage.FINALIZING,
                error_code=error_code,
                error_message=error_message,
            ),
        )
        raise Exception(
            json.dumps({"code": error_code.value, "message": error_message})
        )
