from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from ai.api.schemas import (
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResult,
    CurrentStage,
    JobType,
    OcrItem,
    SubtitleSegment,
    WordTiming,
    WorkerJobPayload,
)
from ai.ocr.ocr_service import EasyOcrService, language_to_easyocr_languages
from ai.ocr.postprocess import build_ocr_items
from ai.pipeline.audio_service import extract_audio_to_wav
from ai.pipeline.frame_service import extract_frames
from ai.pipeline.input_service import resolve_input_source
from ai.pipeline.result_store import (
    cleanup,
    ensure_job_dirs,
    save_intermediate,
    save_result,
)
from ai.stt_service import STTService

ProgressCallback = Callable[[CurrentStage, float, dict[str, Any] | None], None]


def run_pipeline(
    job: AnalysisRequest | WorkerJobPayload | dict[str, Any],
    progress_callback: ProgressCallback | None = None,
    job_id: str | int | None = None,
    keep_intermediate_files: bool = True,
) -> AnalysisResult:
    normalized_job = _normalize_job(job)
    resolved_job_id = _resolve_job_id(normalized_job, job_id)
    directories = ensure_job_dirs(resolved_job_id)
    runtime_options = _extract_runtime_options(normalized_job)

    try:
        _report_progress(progress_callback, CurrentStage.QUEUED, 0.0)
        save_intermediate(resolved_job_id, "request", _serialize_model(normalized_job))

        source_path = resolve_input_source(normalized_job, directories["video"])
        if not source_path.exists():
            raise FileNotFoundError(f"Input source not found: {source_path}")

        job_type = _enum_value(normalized_job.job_type)
        if job_type == JobType.TRANSLATION_ONLY.value:
            raise NotImplementedError(
                f"{_enum_value(normalized_job.job_type)} is not wired into run_pipeline yet."
            )

        subtitles: list[SubtitleSegment] = []
        ocr_items: list[OcrItem] = []
        pipeline_steps: list[str] = []
        audio_path: Path | None = None

        if job_type in {JobType.FULL_ANALYSIS.value, JobType.STT_ONLY.value}:
            _report_progress(progress_callback, CurrentStage.AUDIO_EXTRACTION, 10.0)
            audio_path = extract_audio_to_wav(source_path, directories["audio"])
            save_intermediate(
                resolved_job_id,
                "audio_extraction",
                {
                    "jobId": resolved_job_id,
                    "sourcePath": str(source_path),
                    "audioPath": str(audio_path),
                },
            )

            _report_progress(progress_callback, CurrentStage.STT_TRANSCRIPTION, 20.0)
            subtitles = _run_stt_stage(normalized_job, audio_path, progress_callback)
            save_intermediate(
                resolved_job_id,
                "stt_subtitles",
                [subtitle.model_dump(by_alias=True) for subtitle in subtitles],
            )
            pipeline_steps.append("STT")

        if job_type in {JobType.FULL_ANALYSIS.value, JobType.OCR_ONLY.value}:
            _report_progress(progress_callback, CurrentStage.OCR_FRAME_EXTRACTION, 45.0)
            frames = extract_frames(
                source_path,
                directories["frames"],
                interval_seconds=float(runtime_options["frame_interval"]),
            )
            save_intermediate(resolved_job_id, "frame_extraction", frames)

            _report_progress(progress_callback, CurrentStage.OCR_TEXT_DETECTION, 55.0)
            ocr_items = _run_ocr_stage(normalized_job, frames)
            save_intermediate(
                resolved_job_id,
                "ocr_items",
                [ocr_item.model_dump(by_alias=True) for ocr_item in ocr_items],
            )
            pipeline_steps.append("OCR_FRAME_EXTRACTION")
            pipeline_steps.append("OCR_TEXT_DETECTION")

        _report_progress(progress_callback, CurrentStage.FINALIZING, 90.0)
        result = AnalysisResult(
            subtitles=subtitles,
            ocr_items=ocr_items,
            metadata=AnalysisMetadata(
                job_id=resolved_job_id,
                source_type=normalized_job.source_type,
                source_language=_resolve_source_language(
                    normalized_job.source_language,
                    subtitles,
                ),
                target_language=normalized_job.target_language,
                pipeline=pipeline_steps,
                fallback_used=False,
            ),
        )
        save_result(resolved_job_id, result.model_dump(by_alias=True))
        save_intermediate(
            resolved_job_id,
            "pipeline_summary",
            {
                "jobId": resolved_job_id,
                "inputPath": str(source_path),
                "audioPath": str(audio_path) if audio_path else None,
                "jobType": _enum_value(normalized_job.job_type),
                "workingDirectory": str(directories["root"]),
            },
        )
        _report_progress(progress_callback, CurrentStage.FINALIZING, 100.0)
        return result
    finally:
        cleanup(resolved_job_id, keep_result_files=keep_intermediate_files)


def _normalize_job(
    job: AnalysisRequest | WorkerJobPayload | dict[str, Any],
) -> AnalysisRequest | WorkerJobPayload:
    if isinstance(job, (AnalysisRequest, WorkerJobPayload)):
        return job

    if any(key in job for key in ("jobId", "projectId", "presignedUrl")):
        return WorkerJobPayload.model_validate(job)

    return AnalysisRequest.model_validate(job)


def _resolve_job_id(
    job: AnalysisRequest | WorkerJobPayload,
    job_id: str | int | None = None,
) -> str | int:
    if job_id is not None:
        return job_id

    if isinstance(job, WorkerJobPayload):
        return job.job_id

    return "local-run"


def _run_stt_stage(
    job: AnalysisRequest | WorkerJobPayload,
    source_path: Path,
    progress_callback: ProgressCallback | None = None,
) -> list[SubtitleSegment]:
    runtime_options = _extract_runtime_options(job)
    stt_service = STTService(
        model_name=runtime_options["model"],
        compute_type=runtime_options["compute_type"],
    )
    try:
        raw_segments = stt_service.transcribe(
            audio_path=str(source_path),
            batch_size=runtime_options["batch_size"],
            language=job.source_language,
            align=runtime_options["align"],
            model_name=runtime_options["model"],
            alignment_callback=lambda: _report_progress(
                progress_callback,
                CurrentStage.WHISPER_ALIGNMENT,
                30.0,
            ),
        )
    finally:
        stt_service.unload_model()

    return _postprocess_subtitles(_build_subtitles(raw_segments, job.source_language))


def _run_ocr_stage(
    job: AnalysisRequest | WorkerJobPayload,
    frames: list[dict[str, object]],
) -> list[OcrItem]:
    runtime_options = _extract_runtime_options(job)
    frame_interval = float(runtime_options["frame_interval"])
    languages = language_to_easyocr_languages(job.source_language)
    ocr_service = EasyOcrService(languages=languages, gpu=bool(runtime_options["ocr_gpu"]))

    raw_items = []
    for frame in frames:
        raw_items.extend(
            ocr_service.extract_frame_text(
                frame_path=str(frame["path"]),
                frame_index=int(frame["frameIndex"]),
                timestamp=float(frame["timestamp"]),
            )
        )

    return build_ocr_items(raw_items, frame_interval_seconds=frame_interval)


def _build_subtitles(
    raw_segments: list[dict[str, Any]],
    source_language: str | None,
) -> list[SubtitleSegment]:
    subtitles = []
    for index, segment in enumerate(raw_segments, start=1):
        subtitles.append(
            SubtitleSegment(
                seq=index,
                start_time=_round_time(segment["startTime"]),
                end_time=_round_time(segment["endTime"]),
                text=str(segment["text"]).strip(),
                translated_text=None,
                language_code=segment.get("languageCode") or source_language,
                words=_build_word_timings(segment.get("words", [])),
            )
        )

    return subtitles


def _build_word_timings(words: list[dict[str, Any]]) -> list[WordTiming]:
    word_timings = []
    for word in words:
        text = str(word.get("word", "")).strip()
        if not text:
            continue

        word_timings.append(
            WordTiming(
                word=text,
                start_time=_optional_round_time(word.get("startTime")),
                end_time=_optional_round_time(word.get("endTime")),
                confidence=word.get("confidence"),
            )
        )

    return word_timings


def _postprocess_subtitles(
    subtitles: list[SubtitleSegment],
    min_duration_seconds: float = 0.2,
) -> list[SubtitleSegment]:
    cleaned_subtitles = [
        subtitle
        for subtitle in subtitles
        if subtitle.text and subtitle.end_time > subtitle.start_time
    ]
    merged_subtitles: list[SubtitleSegment] = []

    for subtitle in cleaned_subtitles:
        duration = subtitle.end_time - subtitle.start_time
        if (
            merged_subtitles
            and duration <= min_duration_seconds
            and subtitle.language_code == merged_subtitles[-1].language_code
        ):
            previous = merged_subtitles[-1]
            previous.end_time = _round_time(max(previous.end_time, subtitle.end_time))
            previous.text = f"{previous.text} {subtitle.text}".strip()
            previous.words.extend(subtitle.words)
            continue

        subtitle.start_time = _round_time(subtitle.start_time)
        subtitle.end_time = _round_time(subtitle.end_time)
        merged_subtitles.append(subtitle)

    for index, subtitle in enumerate(merged_subtitles, start=1):
        subtitle.seq = index

    return merged_subtitles


def _resolve_source_language(
    requested_language: str | None,
    subtitles: list[SubtitleSegment],
) -> str | None:
    if requested_language:
        return requested_language

    for subtitle in subtitles:
        if subtitle.language_code:
            return subtitle.language_code

    return None


def _serialize_model(
    model: AnalysisRequest | WorkerJobPayload,
) -> dict[str, Any]:
    return model.model_dump(by_alias=True)


def _extract_runtime_options(
    job: AnalysisRequest | WorkerJobPayload,
) -> dict[str, Any]:
    options = {}
    if isinstance(job, AnalysisRequest) and job.options:
        options = dict(job.options)

    return {
        "model": options.get("model", "large-v3-turbo"),
        "batch_size": int(options.get("batch_size", 16)),
        "compute_type": options.get("compute_type", "float16"),
        "align": not bool(options.get("no_align", False)),
        "frame_interval": float(options.get("frame_interval", 1.0)),
        "ocr_gpu": bool(options.get("ocr_gpu", True)),
    }


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _round_time(value: Any) -> float:
    return round(float(value), 3)


def _optional_round_time(value: Any) -> float | None:
    if value is None:
        return None

    return _round_time(value)


def _report_progress(
    callback: ProgressCallback | None,
    current_stage: CurrentStage,
    progress: float,
    extra: dict[str, Any] | None = None,
) -> None:
    if callback is None:
        return

    callback(current_stage, progress, extra)
