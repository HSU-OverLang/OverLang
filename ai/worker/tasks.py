from ai.worker.celery_app import celery_app
from ai.stt_service import STTService
import logging
import warnings
import json
import os
import torch
from ai.api.schemas import ErrorCode

logger = logging.getLogger(__name__)

# UserWarning 경고 무시 (WhisperX 내부 경고 등)
warnings.filterwarnings("ignore", category=UserWarning)

# 전역 변수로 STT 서비스 인스턴스를 유지
# Worker 프로세스가 시작될 때 한 번만 초기화되며, 이후 요청에서는 재사용
current_stt_service = STTService(model_name="large-v3-turbo")


@celery_app.task(bind=True)
def process_audio_task(self, file_path: str, options: dict = None):
    """
    비동기 음성 인식 작업 (Celery Task)

    Args:
        self: Task 인스턴스 (상태 업데이트용)
        file_path (str): 분석할 오디오 파일의 절대 경로 (/app/ai/...)
        options (dict): 분석 옵션 (model, batch_size, language, no_align 등)

    Returns:
        dict: 분석 결과 (Segments 리스트)
    """
    global current_stt_service

    try:
        logger.info(f"Task started: {file_path}")
        # 상태 업데이트: 0%
        self.update_state(state="PROCESSING", meta={"progress": 0})

        if options is None:
            options = {}

        # 1. 옵션 파싱 - 요청된 모델 확인 (기본값은 현재 로드된 모델 사용)
        target_model = options.get("model", current_stt_service.model_name)
        batch_size = options.get("batch_size", 16)
        no_align = options.get("no_align", False)
        language = options.get("language", "ko")

        # 2. 모델 교체 로직 (VRAM 보호 및 최적화)
        # 요청된 모델이 현재 로드된 모델과 다르면 교체 작업을 수행
        if current_stt_service.model_name != target_model:
            logger.info(
                f"Switching Model: {current_stt_service.model_name} -> {target_model}"
            )

            # 기존 모델 메모리 해제 (VRAM 확보)
            current_stt_service.unload_model()

            # 새 모델로 인스턴스화 및 로드
            current_stt_service = STTService(model_name=target_model)
            current_stt_service.load_model()

        self.update_state(state="PROCESSING", meta={"progress": 20})

        # 3. 분석 실행
        logger.info(f"Calling transcribe... Model: {target_model}, Lang: {language}")

        result = current_stt_service.transcribe(
            audio_path=file_path,
            batch_size=batch_size,
            align=not no_align,  # no_align이 True면 align은 False
            language=language,
        )

        logger.info("Transcribe completed.")
        self.update_state(state="PROCESSING", meta={"progress": 90})

        # 4. 결과 파일 저장 - 원본 파일명 뒤에 _result.json을 붙여서 저장
        output_json_path = f"{os.path.splitext(file_path)[0]}_result.json"
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        logger.info(f"Result saved to: {output_json_path}")

        # 작업 성공 완료 처리
        self.update_state(state="SUCCESS")
        return result

    except Exception as e:
        # 에러 핸들링 및 상태 보고
        error_code = ErrorCode.UNKNOWN_ERROR
        error_msg = str(e)

        # 1. GPU 메모리 부족 (OOM) 처리
        if "out of memory" in error_msg.lower() or isinstance(
            e, torch.cuda.OutOfMemoryError
        ):
            error_code = ErrorCode.GPU_OOM
            error_msg = "GPU Out of Memory. Please try a smaller model or batch size."
            # 다음 작업을 위해 모델 언로드 (Recovery)
            current_stt_service.unload_model()

        # 2. 파일 없음 / 형식 오류 처리
        elif isinstance(e, FileNotFoundError):
            error_code = ErrorCode.FILE_NOT_SUPPORTED
            error_msg = f"Audio file not found: {file_path}"

        logger.exception(f"Task failed: [{error_code}] {error_msg}")

        # API 서버가 파싱할 수 있도록 JSON 형태의 에러 메시지를 담아 예외 발생
        raise Exception(json.dumps({"code": error_code, "message": error_msg}))
