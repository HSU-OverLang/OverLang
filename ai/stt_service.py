import whisperx
import torch
import logging
import gc
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class STTService:
    def __init__(
        self,
        device: str = "cuda",
        model_name: str = "large-v2",
        compute_type: str = "float16",
    ):
        self.device = device
        self.model_name = model_name
        self.compute_type = compute_type
        self.model = None
        self.align_model = None
        self.align_metadata = None

    def load_model(self):
        """
        Load WhisperX model if not already loaded.
        """
        if self.model is None:
            logger.info(f"Loading WhisperX model: {self.model_name} ({self.device})")
            try:
                self.model = whisperx.load_model(
                    self.model_name, self.device, compute_type=self.compute_type
                )
                logger.info("Model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
                raise

    def unload_model(self):
        """
        Best-effort VRAM cleanup.
        NOTE: CUDA context may still hold memory.
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
        Perform alignment on the transcription result.
        """
        try:
            if self.align_model is None:
                logger.info(f"Loading alignment model for language: {language_code}")
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
                return_char_alignments=False,
            )
            return result
        except Exception as e:
            logger.warning(f"Alignment failed: {e}")
            return result

    def transcribe(
        self,
        audio_path: str,
        batch_size: int = 16,
        language: Optional[str] = None,
        align: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Main transcription pipeline.
        """
        self.load_model()

        logger.info(f"Transcribing audio: {audio_path}")
        audio = whisperx.load_audio(audio_path)

        result = self.model.transcribe(audio, batch_size=batch_size, language=language)

        if align:
            result = self.align(result, audio, result["language"])

        # Format results
        formatted_results = []
        for segment in result["segments"]:
            item = {
                "startTime": round(segment["start"], 3),
                "endTime": round(segment["end"], 3),
                "text": segment["text"].strip(),
            }
            formatted_results.append(item)

        return formatted_results
