from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SourceType(str, Enum):
    UPLOAD = "UPLOAD"
    YOUTUBE = "YOUTUBE"


class JobType(str, Enum):
    FULL_ANALYSIS = "FULL_ANALYSIS"
    STT_ONLY = "STT_ONLY"
    OCR_ONLY = "OCR_ONLY"
    TRANSLATION_ONLY = "TRANSLATION_ONLY"
    RETRY = "RETRY"


class JobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class CurrentStage(str, Enum):
    QUEUED = "QUEUED"
    AUDIO_EXTRACTION = "AUDIO_EXTRACTION"
    STT_TRANSCRIPTION = "STT_TRANSCRIPTION"
    WHISPER_ALIGNMENT = "WHISPER_ALIGNMENT"
    OCR_FRAME_EXTRACTION = "OCR_FRAME_EXTRACTION"
    OCR_TEXT_DETECTION = "OCR_TEXT_DETECTION"
    TRANSLATION = "TRANSLATION"
    LLM_ANALYSIS = "LLM_ANALYSIS"
    MERGING_RESULTS = "MERGING_RESULTS"
    FINALIZING = "FINALIZING"


class TranslationProvider(str, Enum):
    DEFAULT = "DEFAULT"
    DEEPL = "DEEPL"
    OPENAI = "OPENAI"


class ErrorCode(str, Enum):
    GPU_OOM = "WORKER_001"
    FFMPEG_ERROR = "WORKER_002"
    LLM_TOKEN_EXCEEDED = "WORKER_003"
    OCR_ENGINE_FAILED = "WORKER_004"
    MODEL_LOAD_FAILED = "WORKER_005"
    VIDEO_TOO_LONG = "WORKER_006"
    INVALID_OPTIONS = "WORKER_007"
    AUTH_FAILED = "WORKER_008"
    TIMEOUT = "WORKER_009"
    DOWNLOAD_FAILED = "WORKER_010"
    UNKNOWN_ERROR = "WORKER_999"


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=lambda value: "".join(
            word.capitalize() if index > 0 else word
            for index, word in enumerate(value.split("_"))
        ),
        use_enum_values=True,
    )


class AnalysisRequest(CamelModel):
    source_type: SourceType
    file_url: str | None = None
    source_url: str | None = None
    job_type: JobType = JobType.FULL_ANALYSIS
    source_language: str | None = None
    target_language: str | None = None
    translation_provider: TranslationProvider = TranslationProvider.DEFAULT
    use_user_api_key: bool = False
    options: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_source_fields(self) -> "AnalysisRequest":
        if self.source_type == SourceType.UPLOAD and not self.file_url:
            raise ValueError("fileUrl is required when sourceType is UPLOAD")

        if self.source_type == SourceType.YOUTUBE and not self.source_url:
            raise ValueError("sourceUrl is required when sourceType is YOUTUBE")

        return self

    def resolve_local_input_path(self) -> str:
        if self.source_type != SourceType.UPLOAD or not self.file_url:
            raise ValueError(
                "The current analyze API only supports local fileUrl uploads"
            )

        if self.file_url.startswith("file://"):
            return self.file_url.removeprefix("file://")

        return self.file_url


class WorkerJobPayload(CamelModel):
    job_id: int | str
    project_id: int | str
    source_type: SourceType
    source_url: str | None = None
    file_key: str | None = None
    presigned_url: str | None = None
    job_type: JobType = JobType.FULL_ANALYSIS
    source_language: str | None = None
    target_language: str | None = None
    translation_provider: TranslationProvider = TranslationProvider.DEFAULT
    use_user_api_key: bool = False

    @model_validator(mode="after")
    def validate_worker_payload(self) -> "WorkerJobPayload":
        if self.source_type == SourceType.UPLOAD and not self.presigned_url:
            raise ValueError("presignedUrl is required when sourceType is UPLOAD")

        if self.source_type == SourceType.YOUTUBE and not self.source_url:
            raise ValueError("sourceUrl is required when sourceType is YOUTUBE")

        return self


class WordTiming(CamelModel):
    word: str
    start_time: float | None = None
    end_time: float | None = None
    confidence: float | None = None


class SubtitleSegment(CamelModel):
    seq: int
    start_time: float
    end_time: float
    text: str
    translated_text: str | None = None
    language_code: str | None = None
    words: list[WordTiming] = Field(default_factory=list)


class BoundingBox(CamelModel):
    x: float
    y: float
    w: float
    h: float


class OcrItem(CamelModel):
    start_time: float
    end_time: float
    origin_text: str
    translated_text: str | None = None
    bounding_box: BoundingBox
    confidence: float | None = None


class LearningData(CamelModel):
    keywords: list[str] = Field(default_factory=list)
    summary: str | None = None
    expression_notes: list[str] = Field(default_factory=list)


class AnalysisMetadata(CamelModel):
    job_id: int | str
    source_type: SourceType
    source_language: str | None = None
    target_language: str | None = None
    duration: float | None = None
    video_width: int | None = None
    video_height: int | None = None
    pipeline: list[str] = Field(default_factory=list)
    fallback_used: bool = False


class AnalysisResult(CamelModel):
    subtitles: list[SubtitleSegment] = Field(default_factory=list)
    ocr_items: list[OcrItem] = Field(default_factory=list)
    learning_data: LearningData | None = None
    metadata: AnalysisMetadata | None = None
    warnings: list[str] = Field(default_factory=list)


class AnalysisResponse(CamelModel):
    job_id: str
    status: JobStatus
    message: str


class TaskStatusResponse(CamelModel):
    job_id: str
    status: JobStatus
    progress: float
    current_stage: CurrentStage | None = None
    result: AnalysisResult | dict[str, Any] | list[dict[str, Any]] | None = None
    error_code: ErrorCode | str | None = None
    error_message: str | None = None


class CallbackPayload(CamelModel):
    job_id: int | str
    status: JobStatus
    progress: int
    current_stage: CurrentStage
    segments: list[SubtitleSegment] = Field(default_factory=list)
    ocr_items: list[OcrItem] = Field(default_factory=list)
    learning_data: LearningData | None = None
    error_code: ErrorCode | str | None = None
    error_message: str | None = None
