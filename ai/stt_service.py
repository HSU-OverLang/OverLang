import whisperx
import torch
import logging
import gc
import faster_whisper
import functools
import pyannote.audio.core.inference
import os
import ffmpeg
from typing import List, Dict, Any, Optional

# PyTorch 2.6+ 보안 로드 이슈 해결 (UnpicklingError 방지용)
try:
    from omegaconf.listconfig import ListConfig
    from omegaconf.dictconfig import DictConfig
    from omegaconf.base import ContainerMetadata

    torch.serialization.add_safe_globals([ListConfig, DictConfig, ContainerMetadata])
except ImportError:
    pass

# Monkey Patch: ctranslate2 4.x 호환성 패치
# Whisper 모델 생성자 호출 시 'use_auth_token' 인자가 전달되면 제거하여 에러 방지
try:
    import ctranslate2

    original_whisper_init = ctranslate2.models.Whisper.__init__

    def patched_whisper_init(self, model_path, device="cpu", *args, **kwargs):
        if "use_auth_token" in kwargs:
            kwargs.pop("use_auth_token")
        original_whisper_init(self, model_path, device, *args, **kwargs)

    ctranslate2.models.Whisper.__init__ = patched_whisper_init
except ImportError:
    pass  # ctranslate2가 없는 환경에서는 무시


def apply_compatibility_patch():
    """
    다양한 라이브러리 간의 버전 충돌을 해결하기 위한 몽키 패치 모음.
    """
    # PyTorch 2.6+ 보안 로드 패치 (weights_only=False 강제 적용)
    orig_torch_load = torch.load

    @functools.wraps(orig_torch_load)
    def patched_torch_load(*args, **kwargs):
        kwargs["weights_only"] = False
        return orig_torch_load(*args, **kwargs)

    torch.load = patched_torch_load

    # faster-whisper 인자 호환성 패치
    orig_fw_init = faster_whisper.WhisperModel.__init__

    @functools.wraps(orig_fw_init)
    def patched_fw_init(self, *args, **kwargs):
        kwargs.pop("use_auth_token", None)
        kwargs.pop("files", None)
        return orig_fw_init(self, *args, **kwargs)

    faster_whisper.WhisperModel.__init__ = patched_fw_init

    # pyannote.audio 3.1.1+ 인자 호환성 패치
    orig_inference_init = pyannote.audio.core.inference.Inference.__init__

    @functools.wraps(orig_inference_init)
    def patched_inference_init(self, *args, **kwargs):
        if "token" in kwargs:
            kwargs.pop("token")
        return orig_inference_init(self, *args, **kwargs)

    pyannote.audio.core.inference.Inference.__init__ = patched_inference_init

    # OmegaConf 보안 허용 재확인
    try:
        from omegaconf.listconfig import ListConfig
        from omegaconf.dictconfig import DictConfig
        from omegaconf.base import ContainerMetadata

        torch.serialization.add_safe_globals(
            [ListConfig, DictConfig, ContainerMetadata]
        )
    except ImportError:
        pass


# 패치 적용
apply_compatibility_patch()

logger = logging.getLogger(__name__)


class STTService:
    """
    WhisperX를 활용한 음성 인식 서비스 클래스.
    모델 로딩, 오디오 전처리, STT 수행, 타임스탬프 정렬 기능을 제공.
    """

    def __init__(
        self,
        device: str = "cuda",
        model_name: str = "base",
        compute_type: str = "float16",
    ):
        self.device = device
        self.model_name = model_name
        self.compute_type = compute_type
        self.model = None
        self.align_model = None
        self.align_metadata = None

    def load_model(self, model_name: str = None):
        """
        WhisperX 모델을 로드.

        Args:
            model_name (str, optional): 로드할 모델명. 지정 시 해당 모델로 교체.
        """
        target_model = model_name or self.model_name

        # 모델 교체가 필요한 경우
        if self.model is not None and self.model_name != target_model:
            logger.info(f"Switching model: {self.model_name} -> {target_model}")
            self.unload_model()
            self.model_name = target_model

        if self.model is None:
            logger.info(f"Loading WhisperX model: {self.model_name} ({self.device})")
            try:
                self.model = whisperx.load_model(
                    self.model_name,
                    self.device,
                    compute_type="int8_float16",  # 메모리 최적화를 위해 int8_float16 사용
                )
                logger.info("Model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
                raise

    def unload_model(self):
        """
        로드된 모델을 메모리에서 해제하고 VRAM 캐시를 정리.
        모델 변경 시나 에러 발생 시 호출.
        """
        logger.info("Unloading models and clearing cache...")
        if self.model:
            del self.model
            self.model = None
        if self.align_model:
            del self.align_model
            self.align_model = None
            self.align_metadata = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Resources cleaned up.")

    def align(self, result: Dict[str, Any], audio: Any, language_code: str):
        """
        인식된 텍스트와 오디오 파형을 분석하여 정밀한 타임스탬프를 생성 (Alignment).

        Args:
            result: transcribe 결과 (segments 포함)
            audio: 로드된 오디오 데이터
            language_code: 언어 코드 (ko, en 등)
        """
        try:
            if self.align_model is None:
                logger.info(f"Loading alignment model for language: {language_code}")
                # 해당 언어에 맞는 정렬 모델 로드
                self.align_model, self.align_metadata = whisperx.load_align_model(
                    language_code=language_code, device=self.device
                )
            logger.info("Aligning transcription...")
            result = whisperx.align(
                result["segments"],
                self.align_model,
                self.align_metadata,
                audio,
                self.device,
                return_char_alignments=False,  # 문자 단위 정렬 비활성화
            )
            return result
        except Exception as e:
            logger.warning(f"Alignment failed: {e}")
            return result

    def preprocess_audio(self, input_path: str) -> str:
        """
        FFmpeg를 이용해 입력 오디오를 AI 모델에 최적화된 포맷으로 변환.
        Target: 16kHz, Mono, WAV

        Args:
            input_path: 원본 오디오 파일 경로

        Returns:
            str: 변환된 임시 파일 경로
        """
        output_path = f"{os.path.splitext(input_path)[0]}_16k.wav"
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input audio file not found: {input_path}")
        try:
            logger.info(f"Preprocessing audio: {input_path} -> {output_path}")
            (
                ffmpeg.input(input_path)
                .output(output_path, ac=1, ar=16000)
                .overwrite_output()
                .run(quiet=True)
            )
            return output_path
        except ffmpeg.Error as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            logger.error(f"FFmpeg error: {error_msg}")
            raise RuntimeError("Failed to process audio file") from e

    def transcribe(
        self,
        audio_path: str,
        batch_size: int = 16,
        language: Optional[str] = None,
        align: bool = True,
        model_name: str = "base",
    ) -> List[Dict[str, Any]]:
        """
        전체 음성 인식 파이프라인을 실행.
        (전처리 -> 모델 로드 -> 인식 -> 정렬 -> 결과 포맷팅 -> 정리)

        Args:
            audio_path: 오디오 파일 경로
            batch_size: 배치 사이즈 (GPU 메모리에 따라 조절)
            language: 언어 코드 (None이면 자동 감지)
            align: 정렬(Alignment) 수행 여부
            model_name: 사용할 모델명

        Returns:
            List[Dict]: 세그먼트 리스트 (startTime, endTime, text)
        """
        processed_path = self.preprocess_audio(audio_path)
        try:
            # 1. 모델 로드
            self.load_model(model_name)

            logger.info(f"Transcribing audio: {processed_path}")

            # 2. 오디오 로드 및 인식
            audio = whisperx.load_audio(processed_path)
            result = self.model.transcribe(
                audio, batch_size=batch_size, language=language
            )

            # 3. 정렬 수행
            if align:
                result = self.align(result, audio, result["language"])

            # 4. 결과 포맷팅
            formatted_results = []
            for segment in result["segments"]:
                item = {
                    "startTime": round(segment["start"], 3),
                    "endTime": round(segment["end"], 3),
                    "text": segment["text"].strip(),
                }
                formatted_results.append(item)
            return formatted_results
        finally:
            # 5. 임시 파일 정리
            if processed_path and processed_path != audio_path:
                if os.path.exists(processed_path):
                    try:
                        os.remove(processed_path)
                        logger.info(f"Removed temporary file: {processed_path}")
                    except Exception as e:
                        logger.warning(f"Failed to remove temporary file: {e}")
