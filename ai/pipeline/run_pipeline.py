from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from ai.api.schemas import (
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResult,
    CurrentStage,
    JobType,
    SubtitleSegment,
    WorkerJobPayload,
)
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

    try:
        _report_progress(progress_callback, CurrentStage.QUEUED, 0.0)
        save_intermediate(resolved_job_id, "request", _serialize_model(normalized_job))

        source_path = resolve_input_source(normalized_job, directories["video"])
        if not source_path.exists():
            raise FileNotFoundError(f"Input source not found: {source_path}")

        if normalized_job.job_type in {JobType.OCR_ONLY, JobType.TRANSLATION_ONLY}:
            raise NotImplementedError(
                f"{_enum_value(normalized_job.job_type)} is not wired into run_pipeline yet."
            )

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
        subtitles = _run_stt_stage(normalized_job, audio_path)
        save_intermediate(
            resolved_job_id,
            "stt_subtitles",
            [subtitle.model_dump(by_alias=True) for subtitle in subtitles],
        )

        pipeline_steps = ["STT"]
        if normalized_job.job_type == JobType.FULL_ANALYSIS:
            _report_progress(progress_callback, CurrentStage.OCR_FRAME_EXTRACTION, 40.0)
            save_intermediate(
                resolved_job_id,
                "frame_extraction",
                extract_frames(source_path, directories["frames"]),
            )
            pipeline_steps.append("OCR_FRAME_EXTRACTION")

        _report_progress(progress_callback, CurrentStage.FINALIZING, 90.0)
        result = AnalysisResult(
            subtitles=subtitles,
            metadata=AnalysisMetadata(
                job_id=resolved_job_id,
                source_type=normalized_job.source_type,
                source_language=normalized_job.source_language,
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
                "audioPath": str(audio_path),
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
        )
    finally:
        stt_service.unload_model()

    subtitles = []
    for index, segment in enumerate(raw_segments, start=1):
        subtitles.append(
            SubtitleSegment(
                seq=index,
                start_time=float(segment["startTime"]),
                end_time=float(segment["endTime"]),
                text=segment["text"],
                translated_text=None,
                language_code=job.source_language,
                words=[],
            )
        )

    return subtitles


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
    }


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _report_progress(
    callback: ProgressCallback | None,
    current_stage: CurrentStage,
    progress: float,
    extra: dict[str, Any] | None = None,
) -> None:
    if callback is None:
        return

    callback(current_stage, progress, extra)
