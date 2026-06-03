from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Callable

from ai.api.schemas import (
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResult,
    BoundingBox,
    CurrentStage,
    JobType,
    LearningData,
    OcrItem,
    OcrLine,
    SubtitleSegment,
    TranslationProvider,
    WordTiming,
    WorkerJobPayload,
)
from ai.learning import generate_learning_data
from ai.ocr.frame_change import (
    annotate_frame_changes,
    calculate_bounding_box_change_score,
)
from ai.ocr.llm_refinement import refine_ocr_items_with_llm
from ai.ocr.ocr_service import EasyOcrService, language_to_easyocr_languages
from ai.ocr.postprocess import (
    build_ocr_items,
    should_keep_ocr_text_for_translation,
    should_preserve_ocr_translation,
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
from ai.translation import create_translation_service

ProgressCallback = Callable[[CurrentStage, float, dict[str, Any] | None], None]

RECOVERABLE_ISSUE_MESSAGES = {
    "OCR_FAILED": "OCR processing failed; available non-OCR results were saved.",
    "TRANSLATION_FAILED": (
        "Translation processing failed; original recognition results were saved."
    ),
    "LEARNING_FAILED": (
        "Learning analysis failed; available recognition and translation results were saved."
    ),
}
RECOVERABLE_ISSUE_PRIORITY = (
    "OCR_FAILED",
    "TRANSLATION_FAILED",
    "LEARNING_FAILED",
)

SOFT_SPLIT_WORDS = {
    # English
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "it",
    "this",
    "that",
    "these",
    "those",
    "there",
    "but",
    "and",
    "so",
    "because",
    "when",
    "while",
    "if",
    "though",
    "although",
    "who",
    "which",
    "where",
    "what",
    "how",
    "why",
    "darling",
    "baby",
    # Korean
    "나",
    "내",
    "저",
    "제",
    "너",
    "당신",
    "우리",
    "그",
    "그녀",
    "그들",
    "하지만",
    "그리고",
    "그래서",
    "그러나",
    "왜냐하면",
    "만약",
    "때문에",
    "그러면",
    # Chinese
    "我",
    "你",
    "他",
    "她",
    "我们",
    "你们",
    "他们",
    "但是",
    "可是",
    "然后",
    "所以",
    "因为",
    "如果",
    "当",
    # Japanese
    "私",
    "僕",
    "俺",
    "あなた",
    "君",
    "彼",
    "彼女",
    "私たち",
    "でも",
    "しかし",
    "そして",
    "だから",
    "それで",
    "なぜなら",
    "もし",
    # Spanish
    "yo",
    "tú",
    "tu",
    "usted",
    "él",
    "el",
    "ella",
    "nosotros",
    "nosotras",
    "vosotros",
    "vosotras",
    "ellos",
    "ellas",
    "pero",
    "y",
    "entonces",
    "porque",
    "cuando",
    "si",
    "aunque",
    "que",
    # French
    "je",
    "j",
    "tu",
    "vous",
    "il",
    "elle",
    "nous",
    "ils",
    "elles",
    "mais",
    "et",
    "donc",
    "parce",
    "quand",
    "si",
    "lorsque",
    "que",
}

COMPACT_TEXT_LANGUAGES = {"ja", "ja-jp", "zh", "zh-cn", "zh-tw", "zh-hans", "zh-hant"}
SENTENCE_BOUNDARY_SUFFIXES = (".", "?", "!", "。", "？", "！")
NORMALIZED_SENTENCE_BOUNDARY_SUFFIXES = (".", "?", "!", "。", "？", "！", "…")
RENDER_MAX_SUBTITLE_LINES = 2
RENDER_MIN_SUBTITLE_CHARS = 12
RENDER_TARGET_SECONDS_PER_SUBTITLE = 6.0
RENDER_COMFORTABLE_SUBTITLE_CHARS_RATIO = 0.75
RENDER_MAX_LINE_LENGTHS = {
    "ko": 28,
    "en": 45,
    "zh": 22,
    "zh-cn": 22,
    "zh-tw": 22,
    "zh-hans": 22,
    "zh-hant": 22,
    "ja": 22,
    "ja-jp": 22,
    "es": 42,
    "fr": 42,
}
LANGUAGE_SPLIT_BEFORE_WORDS = {
    "en": {
        "i",
        "you",
        "he",
        "she",
        "we",
        "they",
        "it",
        "this",
        "that",
        "but",
        "and",
        "so",
        "because",
        "when",
        "while",
        "if",
        "though",
        "although",
        "who",
        "which",
        "where",
        "what",
        "how",
        "why",
    },
    "es": {
        "yo",
        "tu",
        "tú",
        "usted",
        "él",
        "ella",
        "nosotros",
        "nosotras",
        "ellos",
        "ellas",
        "pero",
        "y",
        "entonces",
        "porque",
        "cuando",
        "si",
        "sí",
        "aunque",
        "que",
    },
    "fr": {
        "je",
        "j",
        "tu",
        "vous",
        "il",
        "elle",
        "nous",
        "ils",
        "elles",
        "mais",
        "et",
        "donc",
        "parce",
        "quand",
        "si",
        "lorsque",
        "que",
    },
    "ko": {
        "그리고",
        "하지만",
        "그래서",
        "그러니까",
        "그러면",
        "그런데",
        "만약",
        "왜냐하면",
        "때문에",
    },
    "ja": {
        "そして",
        "でも",
        "しかし",
        "だから",
        "それで",
        "それに",
        "もし",
        "また",
    },
    "zh": {
        "但是",
        "然后",
        "因为",
        "所以",
        "如果",
        "而且",
        "还有",
        "不过",
        "或者",
    },
}
LANGUAGE_SPLIT_AFTER_SUFFIXES = {
    "ko": (
        "은",
        "는",
        "이",
        "가",
        "을",
        "를",
        "에",
        "에서",
        "으로",
        "로",
        "와",
        "과",
        "도",
        "만",
        "까지",
        "부터",
        "에게",
        "한테",
        "처럼",
    ),
    "ja": (
        "は",
        "が",
        "を",
        "に",
        "で",
        "と",
        "も",
        "へ",
        "から",
        "まで",
        "より",
        "ので",
        "けど",
        "けれど",
        "なら",
        "たら",
        "たり",
    ),
}
UNSAFE_COMPACT_SPLIT_PREFIXES = {
    "ー",
    "ゃ",
    "ゅ",
    "ょ",
    "ぁ",
    "ぃ",
    "ぅ",
    "ぇ",
    "ぉ",
    "っ",
    "ャ",
    "ュ",
    "ョ",
    "ァ",
    "ィ",
    "ゥ",
    "ェ",
    "ォ",
    "ッ",
}


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

        job_type = _enum_value(normalized_job.job_type)
        subtitles: list[SubtitleSegment] = []
        ocr_items: list[OcrItem] = []
        learning_data: LearningData | None = None
        pipeline_steps: list[str] = []
        warnings: list[str] = []
        audio_path: Path | None = None

        if job_type == JobType.TRANSLATION_ONLY.value:
            subtitles = _build_subtitles_from_worker_payload(normalized_job)
            ocr_items = _build_ocr_items_from_worker_payload(normalized_job)
            if not subtitles and not ocr_items:
                raise ValueError(
                    "TRANSLATION_ONLY requires at least one segment or OCR item."
                )
            save_intermediate(
                resolved_job_id,
                "translation_input",
                {
                    "subtitles": [
                        subtitle.model_dump(by_alias=True) for subtitle in subtitles
                    ],
                    "ocrItems": [
                        ocr_item.model_dump(by_alias=True) for ocr_item in ocr_items
                    ],
                },
            )
        else:
            source_path = resolve_input_source(normalized_job, directories["video"])
            if not source_path.exists():
                raise FileNotFoundError(f"Input source not found: {source_path}")

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
            try:
                _report_progress(progress_callback, CurrentStage.OCR_FRAME_EXTRACTION, 45.0)
                frames = extract_frames(
                    source_path,
                    directories["frames"],
                    interval_seconds=float(runtime_options["frame_interval"]),
                )
                frames = annotate_frame_changes(
                    frames,
                    change_threshold=float(runtime_options["ocr_change_threshold"]),
                )
                save_intermediate(resolved_job_id, "frame_extraction", frames)

                _report_progress(progress_callback, CurrentStage.OCR_TEXT_DETECTION, 55.0)
                ocr_items = _run_ocr_stage(normalized_job, frames)
                try:
                    refined_ocr_items = refine_ocr_items_with_llm(
                        ocr_items,
                        source_language=normalized_job.source_language,
                    )
                    if refined_ocr_items is not ocr_items:
                        ocr_items = refined_ocr_items
                        save_intermediate(
                            resolved_job_id,
                            "ocr_llm_refinement",
                            [
                                ocr_item.model_dump(by_alias=True)
                                for ocr_item in ocr_items
                            ],
                        )
                except Exception as error:
                    _append_recoverable_warning(
                        warnings,
                        "OCR_REFINEMENT_FAILED",
                        error,
                    )

                save_intermediate(
                    resolved_job_id,
                    "ocr_items",
                    [ocr_item.model_dump(by_alias=True) for ocr_item in ocr_items],
                )
                pipeline_steps.append("OCR_FRAME_EXTRACTION")
                pipeline_steps.append("OCR_TEXT_DETECTION")
            except Exception as error:
                if (
                    job_type != JobType.FULL_ANALYSIS.value
                    or _is_fatal_processing_error(error)
                ):
                    raise

                _append_recoverable_warning(warnings, "OCR_FAILED", error)

        resolved_source_language = _resolve_source_language(
            normalized_job.source_language,
            subtitles,
        )
        if _should_run_translation(normalized_job, resolved_source_language):
            _report_progress(progress_callback, CurrentStage.TRANSLATION, 80.0)
            try:
                warnings.extend(
                    _run_translation_stage(
                        normalized_job,
                        subtitles,
                        ocr_items,
                        resolved_source_language,
                        translation_block_max_seconds=float(
                            runtime_options["translation_block_max_seconds"]
                        ),
                        translation_block_max_chars=int(
                            runtime_options["translation_block_max_chars"]
                        ),
                    )
                )
                save_intermediate(
                    resolved_job_id,
                    "translation",
                    {
                        "subtitles": [
                            subtitle.model_dump(by_alias=True) for subtitle in subtitles
                        ],
                        "ocrItems": [
                            ocr_item.model_dump(by_alias=True) for ocr_item in ocr_items
                        ],
                    },
                )
                pipeline_steps.append("TRANSLATION")
            except Exception as error:
                if _is_fatal_processing_error(error):
                    raise

                _append_recoverable_warning(warnings, "TRANSLATION_FAILED", error)

        if _should_run_learning_analysis(normalized_job, subtitles):
            _report_progress(progress_callback, CurrentStage.LLM_ANALYSIS, 85.0)
            try:
                learning_data = generate_learning_data(
                    subtitles,
                    source_language=resolved_source_language,
                    target_language=normalized_job.target_language,
                )
                if learning_data is not None:
                    save_intermediate(
                        resolved_job_id,
                        "learning_data",
                        learning_data.model_dump(by_alias=True),
                    )
                    pipeline_steps.append("LLM_ANALYSIS")
            except Exception as error:
                _append_recoverable_warning(warnings, "LEARNING_FAILED", error)

        _report_progress(progress_callback, CurrentStage.FINALIZING, 90.0)
        result = AnalysisResult(
            subtitles=subtitles,
            ocr_items=ocr_items,
            learning_data=learning_data,
            metadata=AnalysisMetadata(
                job_id=resolved_job_id,
                source_type=normalized_job.source_type,
                source_language=resolved_source_language,
                target_language=normalized_job.target_language,
                pipeline=pipeline_steps,
                fallback_used=_has_recoverable_warning(warnings),
            ),
            warnings=warnings,
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


def resolve_completion_error(warnings: list[str]) -> tuple[str | None, str | None]:
    issue_codes = [
        code
        for code in RECOVERABLE_ISSUE_PRIORITY
        if any(warning.startswith(f"{code}:") for warning in warnings)
    ]
    if not issue_codes:
        return None, None

    message = " ".join(RECOVERABLE_ISSUE_MESSAGES[code] for code in issue_codes)
    return issue_codes[0], message


def _append_recoverable_warning(
    warnings: list[str],
    issue_code: str,
    error: Exception,
) -> None:
    detail = str(error).strip() or error.__class__.__name__
    warning = f"{issue_code}: {RECOVERABLE_ISSUE_MESSAGES[issue_code]} Detail: {detail}"
    if warning not in warnings:
        warnings.append(warning)


def _has_recoverable_warning(warnings: list[str]) -> bool:
    error_code, _ = resolve_completion_error(warnings)
    return error_code is not None


def _is_fatal_processing_error(error: Exception) -> bool:
    error_message = str(error).lower()
    return "out of memory" in error_message or "cuda failed" in error_message


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


def _build_subtitles_from_worker_payload(
    job: AnalysisRequest | WorkerJobPayload,
) -> list[SubtitleSegment]:
    if not isinstance(job, WorkerJobPayload):
        raise ValueError("TRANSLATION_ONLY requires a backend worker payload.")

    return [
        SubtitleSegment(
            seq=segment.seq,
            start_time=segment.start_time,
            end_time=segment.end_time,
            text=segment.text,
            translated_text=None,
            language_code=job.source_language,
        )
        for segment in job.segments
    ]


def _build_ocr_items_from_worker_payload(
    job: AnalysisRequest | WorkerJobPayload,
) -> list[OcrItem]:
    if not isinstance(job, WorkerJobPayload):
        raise ValueError("TRANSLATION_ONLY requires a backend worker payload.")

    return [
        _build_ocr_item_from_worker_payload(item)
        for item in job.ocr_items
    ]


def _build_ocr_item_from_worker_payload(item: Any) -> OcrItem:
    bounding_box = BoundingBox(
        x=item.bounding_box.x,
        y=item.bounding_box.y,
        w=item.bounding_box.width,
        h=item.bounding_box.height,
    )
    return OcrItem(
        start_time=item.start_time,
        end_time=item.end_time,
        origin_text=item.origin_text,
        translated_text=None,
        bounding_box=bounding_box,
        confidence=None,
        lines=[OcrLine(origin_text=item.origin_text, bounding_box=bounding_box)],
        style=None,
    )


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

    subtitles = _postprocess_subtitles(
        _build_subtitles(raw_segments, job.source_language),
        min_duration_seconds=float(runtime_options["stt_min_segment_seconds"]),
        max_duration_seconds=float(runtime_options["stt_max_segment_seconds"]),
        max_text_length=int(runtime_options["stt_max_segment_chars"]),
        min_split_duration_seconds=float(runtime_options["stt_min_split_seconds"]),
    )
    return _apply_subtitle_time_offset(
        subtitles,
        offset_seconds=float(runtime_options["stt_time_offset_seconds"]),
    )


def _run_ocr_stage(
    job: AnalysisRequest | WorkerJobPayload,
    frames: list[dict[str, object]],
) -> list[OcrItem]:
    runtime_options = _extract_runtime_options(job)
    frame_interval = float(runtime_options["frame_interval"])
    languages = language_to_easyocr_languages(job.source_language)
    ocr_service = EasyOcrService(languages=languages, gpu=bool(runtime_options["ocr_gpu"]))

    raw_items = []
    latest_detected_items: list[dict[str, Any]] = []
    previous_ocr_frame_path: Path | None = None
    last_global_scan_timestamp: float | None = None
    consecutive_skipped_frames = 0
    for frame in frames:
        frame_timestamp = float(frame["timestamp"])
        bbox_change_score = _calculate_latest_ocr_bbox_change_score(
            previous_ocr_frame_path,
            Path(str(frame["path"])),
            latest_detected_items,
            padding_ratio=float(runtime_options["ocr_bbox_change_padding"]),
        )
        should_run_ocr = _should_run_ocr_for_frame(
            frame,
            latest_detected_items,
            consecutive_skipped_frames,
            bbox_change_score,
            skip_unchanged_frames=bool(runtime_options["ocr_skip_unchanged_frames"]),
            max_skip_frames=int(runtime_options["ocr_max_skip_frames"]),
            bbox_change_threshold=float(runtime_options["ocr_bbox_change_threshold"]),
        )

        if not should_run_ocr:
            raw_items.extend(
                _carry_forward_ocr_items(
                    latest_detected_items,
                    frame,
                )
            )
            consecutive_skipped_frames += 1
            continue

        should_run_global_scan = _should_run_global_ocr_scan(
            latest_detected_items,
            frame_timestamp,
            last_global_scan_timestamp,
            tracking_enabled=bool(runtime_options["ocr_tracking_enabled"]),
            global_scan_interval_seconds=float(
                runtime_options["ocr_global_scan_interval_seconds"]
            ),
        )
        tracking_regions = None
        preprocess_variants = None
        if not should_run_global_scan:
            tracking_regions = _build_ocr_tracking_regions(
                latest_detected_items,
                padding_ratio=float(runtime_options["ocr_tracking_padding"]),
            )
            preprocess_variants = _split_csv_option(
                runtime_options["ocr_tracking_preprocess_variants"]
            )

        detected_items = ocr_service.extract_frame_text(
            frame_path=str(frame["path"]),
            frame_index=int(frame["frameIndex"]),
            timestamp=frame_timestamp,
            regions=tracking_regions,
            preprocess_variants=preprocess_variants,
        )
        raw_items.extend(detected_items)
        if detected_items or should_run_global_scan:
            latest_detected_items = detected_items
        if should_run_global_scan:
            last_global_scan_timestamp = frame_timestamp
        previous_ocr_frame_path = Path(str(frame["path"]))
        consecutive_skipped_frames = 0

    return build_ocr_items(
        raw_items,
        frame_interval_seconds=frame_interval,
        frame_timestamps=[float(frame["timestamp"]) for frame in frames],
        min_confidence=float(runtime_options["ocr_min_confidence"]),
        min_text_length=int(runtime_options["ocr_min_text_length"]),
        max_special_char_ratio=float(runtime_options["ocr_max_special_char_ratio"]),
        edge_margin=float(runtime_options["ocr_edge_margin"]),
    )


def _carry_forward_ocr_items(
    latest_items: list[dict[str, Any]],
    frame: dict[str, object],
) -> list[dict[str, Any]]:
    carried_items = []
    for item in latest_items:
        carried_item = dict(item)
        carried_item["frameIndex"] = int(frame["frameIndex"])
        carried_item["framePath"] = str(frame["path"])
        carried_item["timestamp"] = round(float(frame["timestamp"]), 3)
        carried_item["carriedForward"] = True
        carried_items.append(carried_item)

    return carried_items


def _should_run_global_ocr_scan(
    latest_items: list[dict[str, Any]],
    frame_timestamp: float,
    last_global_scan_timestamp: float | None,
    *,
    tracking_enabled: bool,
    global_scan_interval_seconds: float,
) -> bool:
    if not tracking_enabled:
        return True

    if not latest_items or last_global_scan_timestamp is None:
        return True

    return (
        frame_timestamp - last_global_scan_timestamp
    ) >= global_scan_interval_seconds


def _build_ocr_tracking_regions(
    latest_items: list[dict[str, Any]],
    padding_ratio: float,
) -> list[tuple[str, tuple[float, float, float, float]]]:
    regions = []
    for index, item in enumerate(latest_items):
        bounding_box = _raw_item_bounding_box(item)
        if bounding_box is None:
            continue

        regions.append(
            (
                f"tracking:{index}",
                _bounding_box_to_region(bounding_box, padding_ratio),
            )
        )

    return _deduplicate_ocr_tracking_regions(regions)


def _raw_item_bounding_box(item: dict[str, Any]) -> BoundingBox | None:
    bounding_box = item.get("boundingBox")
    if isinstance(bounding_box, BoundingBox):
        return bounding_box

    if isinstance(bounding_box, dict):
        return BoundingBox(
            x=float(bounding_box["x"]),
            y=float(bounding_box["y"]),
            w=float(bounding_box["w"]),
            h=float(bounding_box["h"]),
        )

    return None


def _bounding_box_to_region(
    bounding_box: BoundingBox,
    padding_ratio: float,
) -> tuple[float, float, float, float]:
    left = max(0.0, bounding_box.x - padding_ratio)
    top = max(0.0, bounding_box.y - padding_ratio)
    right = min(1.0, bounding_box.x + bounding_box.w + padding_ratio)
    bottom = min(1.0, bounding_box.y + bounding_box.h + padding_ratio)
    return (
        round(left, 6),
        round(top, 6),
        round(max(left, right), 6),
        round(max(top, bottom), 6),
    )


def _deduplicate_ocr_tracking_regions(
    regions: list[tuple[str, tuple[float, float, float, float]]],
) -> list[tuple[str, tuple[float, float, float, float]]]:
    deduplicated_regions: list[tuple[str, tuple[float, float, float, float]]] = []
    for region in regions:
        if any(
            _tracking_region_iou(region[1], kept_region[1]) >= 0.85
            for kept_region in deduplicated_regions
        ):
            continue

        deduplicated_regions.append(region)

    return deduplicated_regions


def _tracking_region_iou(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> float:
    left_x1, left_y1, left_x2, left_y2 = left
    right_x1, right_y1, right_x2, right_y2 = right
    intersection_w = max(0.0, min(left_x2, right_x2) - max(left_x1, right_x1))
    intersection_h = max(0.0, min(left_y2, right_y2) - max(left_y1, right_y1))
    intersection_area = intersection_w * intersection_h
    if intersection_area <= 0:
        return 0.0

    left_area = max(0.0, left_x2 - left_x1) * max(0.0, left_y2 - left_y1)
    right_area = max(0.0, right_x2 - right_x1) * max(0.0, right_y2 - right_y1)
    union_area = left_area + right_area - intersection_area
    if union_area <= 0:
        return 0.0

    return intersection_area / union_area


def _calculate_latest_ocr_bbox_change_score(
    previous_frame_path: Path | None,
    current_frame_path: Path,
    latest_items: list[dict[str, Any]],
    padding_ratio: float,
) -> float:
    if previous_frame_path is None or not latest_items:
        return 0.0

    bounding_boxes = [
        item["boundingBox"]
        for item in latest_items
        if item.get("boundingBox") is not None
    ]
    if not bounding_boxes:
        return 0.0

    return calculate_bounding_box_change_score(
        previous_frame_path,
        current_frame_path,
        bounding_boxes,
        padding_ratio=padding_ratio,
    )


def _should_run_ocr_for_frame(
    frame: dict[str, object],
    latest_items: list[dict[str, Any]],
    consecutive_skipped_frames: int,
    bbox_change_score: float,
    skip_unchanged_frames: bool,
    max_skip_frames: int,
    bbox_change_threshold: float,
) -> bool:
    if not skip_unchanged_frames:
        return True

    if not latest_items:
        return True

    if bool(frame.get("hasVisualChange", True)):
        return True

    if bbox_change_score >= bbox_change_threshold:
        return True

    return consecutive_skipped_frames >= max_skip_frames


def _should_run_translation(
    job: AnalysisRequest | WorkerJobPayload,
    source_language: str | None,
) -> bool:
    if not job.target_language:
        return False

    if source_language and source_language == job.target_language:
        return False

    return True


def _should_run_learning_analysis(
    job: AnalysisRequest | WorkerJobPayload,
    subtitles: list[SubtitleSegment],
) -> bool:
    if _enum_value(job.job_type) != JobType.FULL_ANALYSIS.value:
        return False

    return bool(subtitles)


def _merge_subtitles_for_translation_blocks(
    subtitles: list[SubtitleSegment],
    max_duration_seconds: float,
    max_text_length: int,
) -> list[SubtitleSegment]:
    merged_blocks: list[SubtitleSegment] = []
    current_block: list[SubtitleSegment] = []

    def flush_current_block() -> None:
        if not current_block:
            return

        merged_blocks.append(_build_translation_block(current_block))
        current_block.clear()

    for subtitle in subtitles:
        if not subtitle.text.strip():
            continue

        if current_block and subtitle.language_code != current_block[-1].language_code:
            flush_current_block()

        if current_block and _would_exceed_translation_block_limit(
            current_block,
            subtitle,
            max_duration_seconds=max_duration_seconds,
            max_text_length=max_text_length,
        ):
            flush_current_block()

        current_block.append(subtitle)
        if _should_close_translation_block(
            current_block,
            max_duration_seconds=max_duration_seconds,
            max_text_length=max_text_length,
        ):
            flush_current_block()

    flush_current_block()

    for index, subtitle in enumerate(merged_blocks, start=1):
        subtitle.seq = index

    return merged_blocks


def _would_exceed_translation_block_limit(
    current_block: list[SubtitleSegment],
    next_subtitle: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
) -> bool:
    candidate_block = [*current_block, next_subtitle]
    candidate_duration = candidate_block[-1].end_time - candidate_block[0].start_time
    if candidate_duration > max_duration_seconds and _has_soft_block_boundary(
        current_block
    ):
        return True

    candidate_text = _build_translation_block_text(candidate_block)
    return len(candidate_text) > max_text_length and _has_soft_block_boundary(
        current_block
    )


def _should_close_translation_block(
    current_block: list[SubtitleSegment],
    max_duration_seconds: float,
    max_text_length: int,
) -> bool:
    if not current_block:
        return False

    if _has_sentence_boundary(current_block[-1].text):
        return True

    duration = current_block[-1].end_time - current_block[0].start_time
    if duration >= max_duration_seconds:
        return True

    return len(_build_translation_block_text(current_block)) >= max_text_length


def _has_soft_block_boundary(subtitles: list[SubtitleSegment]) -> bool:
    if not subtitles:
        return False

    last_subtitle = subtitles[-1]
    if _has_sentence_boundary(last_subtitle.text):
        return True

    if not last_subtitle.words:
        return True

    last_word = last_subtitle.words[-1].word
    return _score_split_boundary(
        last_word,
        "",
        last_subtitle.language_code,
    ) >= 60


def _build_translation_block(subtitles: list[SubtitleSegment]) -> SubtitleSegment:
    words = [
        word
        for subtitle in subtitles
        for word in subtitle.words
    ]
    start_time = _resolve_translation_block_start_time(subtitles, words)
    end_time = _resolve_translation_block_end_time(subtitles, words)
    return SubtitleSegment(
        seq=subtitles[0].seq,
        start_time=start_time,
        end_time=_round_time(max(end_time, start_time + 0.001)),
        text=_build_translation_block_text(subtitles),
        translated_text=None,
        language_code=subtitles[0].language_code,
        words=words,
    )


def _resolve_translation_block_start_time(
    subtitles: list[SubtitleSegment],
    words: list[WordTiming],
) -> float:
    for word in words:
        if word.start_time is not None:
            return _round_time(word.start_time)

    return _round_time(subtitles[0].start_time)


def _resolve_translation_block_end_time(
    subtitles: list[SubtitleSegment],
    words: list[WordTiming],
) -> float:
    for word in reversed(words):
        if word.end_time is not None:
            return _round_time(word.end_time)

    return _round_time(subtitles[-1].end_time)


def _build_translation_block_text(subtitles: list[SubtitleSegment]) -> str:
    language_code = subtitles[0].language_code if subtitles else None
    texts = [subtitle.text.strip() for subtitle in subtitles if subtitle.text.strip()]
    if _is_compact_language(language_code):
        return "\n".join(texts)

    return " ".join(texts)


def _run_translation_stage(
    job: AnalysisRequest | WorkerJobPayload,
    subtitles: list[SubtitleSegment],
    ocr_items: list[OcrItem],
    source_language: str | None,
    translation_block_max_seconds: float,
    translation_block_max_chars: int,
) -> list[str]:
    target_language = job.target_language
    if target_language is None:
        return []

    translation_service = create_translation_service(job.translation_provider)
    subtitles[:] = _merge_subtitles_for_translation_blocks(
        subtitles,
        max_duration_seconds=translation_block_max_seconds,
        max_text_length=translation_block_max_chars,
    )
    subtitle_texts = [subtitle.text for subtitle in subtitles]
    translatable_ocr_items = [
        ocr_item
        for ocr_item in ocr_items
        if should_keep_ocr_text_for_translation(
            ocr_item.origin_text,
            ocr_item.confidence,
        )
    ]
    ocr_items[:] = translatable_ocr_items

    preserved_ocr_items = [
        ocr_item
        for ocr_item in ocr_items
        if should_preserve_ocr_translation(ocr_item.origin_text)
    ]
    ocr_items_to_translate = [
        ocr_item
        for ocr_item in ocr_items
        if ocr_item not in preserved_ocr_items
    ]
    ocr_translation_jobs, ocr_texts = _build_ocr_translation_jobs(
        ocr_items_to_translate,
    )

    subtitle_translations = translation_service.translate_batch(
        subtitle_texts,
        source_language,
        target_language,
    )
    ocr_translations = translation_service.translate_batch(
        ocr_texts,
        source_language,
        target_language,
    )

    for subtitle, translated_text in zip(subtitles, subtitle_translations):
        subtitle.translated_text = translated_text

    for ocr_item in preserved_ocr_items:
        ocr_item.translated_text = ocr_item.origin_text

    for ocr_item, translated_text in _zip_ocr_translation_results(
        ocr_translation_jobs,
        ocr_translations,
    ):
        ocr_item.translated_text = _resolve_ocr_translation_text(
            ocr_item,
            translated_text,
        )

    if _enum_value(job.translation_provider) == TranslationProvider.DEFAULT.value:
        return [
            "DEFAULT translation provider uses development placeholder output. "
            "Configure a production provider before serving user-facing translations."
        ]

    return []


def _normalize_ocr_translation_text(translated_text: str) -> str:
    normalized_lines = [
        " ".join(line.split())
        for line in str(translated_text).splitlines()
        if line.strip()
    ]
    return "\n".join(normalized_lines)


def _build_ocr_translation_jobs(
    ocr_items: list[OcrItem],
) -> tuple[list[tuple[OcrItem, int]], list[str]]:
    jobs: list[tuple[OcrItem, int]] = []
    texts: list[str] = []
    for ocr_item in ocr_items:
        lines = _split_ocr_translation_lines(ocr_item.origin_text)
        jobs.append((ocr_item, len(lines)))
        texts.extend(lines)

    return jobs, texts


def _split_ocr_translation_lines(text: str) -> list[str]:
    lines = [
        _normalize_ocr_translation_text(line)
        for line in str(text).splitlines()
        if line.strip()
    ]
    if lines:
        return lines

    normalized_text = _normalize_ocr_translation_text(text)
    return [normalized_text] if normalized_text else []


def _zip_ocr_translation_results(
    jobs: list[tuple[OcrItem, int]],
    translations: list[str],
) -> list[tuple[OcrItem, str]]:
    results: list[tuple[OcrItem, str]] = []
    cursor = 0
    for ocr_item, line_count in jobs:
        line_translations = translations[cursor : cursor + line_count]
        cursor += line_count
        results.append(
            (
                ocr_item,
                "\n".join(
                    _normalize_ocr_translation_text(line)
                    for line in line_translations
                    if _normalize_ocr_translation_text(line)
                ),
            )
        )

    return results


def _resolve_ocr_translation_text(
    ocr_item: OcrItem,
    translated_text: str,
) -> str | None:
    normalized_text = _normalize_ocr_translation_text(translated_text)
    if not normalized_text:
        return None

    if not should_keep_ocr_text_for_translation(normalized_text, ocr_item.confidence):
        return None

    if _is_same_ocr_translation_text(ocr_item.origin_text, normalized_text):
        return None

    origin_length = len((ocr_item.origin_text or "").replace(" ", ""))
    translated_length = len(normalized_text.replace(" ", ""))
    if origin_length > 0 and translated_length > max(80, origin_length * 8):
        return None

    return normalized_text


def _is_same_ocr_translation_text(origin_text: str, translated_text: str) -> bool:
    return _normalize_ocr_compare_text(origin_text) == _normalize_ocr_compare_text(
        translated_text,
    )


def _normalize_ocr_compare_text(text: str) -> str:
    return "".join(str(text).lower().split())


def _split_translated_subtitles_for_rendering(
    subtitles: list[SubtitleSegment],
    target_language: str | None,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    if not target_language:
        return subtitles

    resolved_max_text_length = _resolve_render_max_text_length(
        target_language,
        max_text_length,
    )
    split_subtitles: list[SubtitleSegment] = []
    for subtitle in subtitles:
        split_subtitles.extend(
            _split_translated_subtitle_for_rendering(
                subtitle,
                target_language=target_language,
                max_duration_seconds=max_duration_seconds,
                max_text_length=resolved_max_text_length,
                min_split_duration_seconds=min_split_duration_seconds,
            )
        )

    split_subtitles = _merge_short_translated_subtitles(
        split_subtitles,
        max_duration_seconds=max_duration_seconds,
        max_text_length=resolved_max_text_length,
    )
    split_subtitles = _merge_compact_translated_subtitles(
        split_subtitles,
        max_duration_seconds=max_duration_seconds,
        max_text_length=resolved_max_text_length,
    )

    for index, subtitle in enumerate(split_subtitles, start=1):
        subtitle.seq = index

    return split_subtitles


def _split_translated_subtitle_for_rendering(
    subtitle: SubtitleSegment,
    target_language: str,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    translated_text = (subtitle.translated_text or "").strip()
    duration = subtitle.end_time - subtitle.start_time
    if (
        not translated_text
        or (
            duration <= max_duration_seconds
            and len(translated_text) <= max_text_length
        )
    ):
        return [subtitle]

    chunks = _split_text_for_rendering(
        translated_text,
        language_code=target_language,
        total_duration=duration,
        max_duration_seconds=max_duration_seconds,
        max_text_length=max_text_length,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    if len(chunks) <= 1:
        return [subtitle]

    return _build_translated_render_chunks(
        subtitle,
        translated_chunks=chunks,
        min_split_duration_seconds=min_split_duration_seconds,
    )


def _split_text_for_rendering(
    text: str,
    language_code: str | None,
    total_duration: float,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[str]:
    tokens = text.split()
    if _is_compact_language(language_code):
        tokens = _split_compact_text(
            text,
            language_code,
            max_token_length=_compact_split_token_length(language_code),
        )

    if not tokens:
        return [text]

    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    for token in tokens:
        current_chunk.append(token)
        chunk_text = _join_text_tokens(current_chunk, language_code)
        if _has_sentence_boundary(token) or len(chunk_text) >= max_text_length:
            chunks.append(current_chunk)
            current_chunk = []

    if current_chunk:
        chunks.append(current_chunk)

    chunks = _ensure_text_chunk_limits(
        chunks,
        total_duration=total_duration,
        max_duration_seconds=max_duration_seconds,
        max_text_length=max_text_length,
        language_code=language_code,
    )
    chunks = _merge_text_chunks_for_min_duration(
        chunks,
        total_duration=total_duration,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    chunks = _rebalance_short_text_chunks(
        chunks,
        language_code=language_code,
        max_text_length=max_text_length,
    )

    return [
        _join_text_tokens(chunk, language_code)
        for chunk in chunks
        if _join_text_tokens(chunk, language_code)
    ]


def _build_translated_render_chunks(
    subtitle: SubtitleSegment,
    translated_chunks: list[str],
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    word_chunks = _split_words_for_render_chunk_count(
        subtitle.words,
        chunk_count=len(translated_chunks),
    )
    if word_chunks:
        return _build_translated_render_chunks_from_words(
            subtitle,
            translated_chunks,
            word_chunks,
        )

    split_subtitles = []
    previous_end_time = subtitle.start_time

    for index, translated_chunk in enumerate(translated_chunks):
        start_time = previous_end_time
        if index == len(translated_chunks) - 1:
            end_time = subtitle.end_time
        else:
            remaining_chunks = len(translated_chunks) - index - 1
            latest_end_time = subtitle.end_time - (
                min_split_duration_seconds * remaining_chunks
            )
            end_time = min(
                start_time
                + ((subtitle.end_time - start_time) / (remaining_chunks + 1)),
                latest_end_time,
            )

        start_time = _round_time(start_time)
        end_time = _round_time(end_time)
        if end_time <= start_time:
            continue

        words = _select_words_for_time_range(subtitle.words, start_time, end_time)
        source_text = _resolve_source_text_for_render_chunk(
            subtitle,
            words,
            index=index,
            total_chunks=len(translated_chunks),
        )
        split_subtitles.append(
            SubtitleSegment(
                seq=subtitle.seq,
                start_time=start_time,
                end_time=end_time,
                text=source_text,
                translated_text=translated_chunk,
                language_code=subtitle.language_code,
                words=words,
            )
        )
        previous_end_time = end_time

    return split_subtitles or [subtitle]


def _split_words_for_render_chunk_count(
    words: list[WordTiming],
    chunk_count: int,
) -> list[list[WordTiming]]:
    timed_words = [
        word
        for word in words
        if word.start_time is not None and word.end_time is not None
    ]
    if chunk_count <= 1 or len(timed_words) < chunk_count:
        return []

    word_chunks = []
    for index in range(chunk_count):
        start_index = round((len(timed_words) * index) / chunk_count)
        end_index = round((len(timed_words) * (index + 1)) / chunk_count)
        chunk = timed_words[start_index:end_index]
        if not chunk:
            return []

        word_chunks.append(chunk)

    return word_chunks


def _build_translated_render_chunks_from_words(
    subtitle: SubtitleSegment,
    translated_chunks: list[str],
    word_chunks: list[list[WordTiming]],
) -> list[SubtitleSegment]:
    split_subtitles = []
    previous_end_time = subtitle.start_time
    for translated_chunk, words in zip(translated_chunks, word_chunks):
        start_time = _round_time(
            max(words[0].start_time or subtitle.start_time, previous_end_time)
        )
        end_time = _round_time(words[-1].end_time or subtitle.end_time)
        if end_time <= start_time:
            continue

        split_subtitles.append(
            SubtitleSegment(
                seq=subtitle.seq,
                start_time=start_time,
                end_time=end_time,
                text=_join_word_texts(words, subtitle.language_code),
                translated_text=translated_chunk,
                language_code=subtitle.language_code,
                words=words,
            )
        )
        previous_end_time = end_time

    return split_subtitles or [subtitle]


def _merge_short_translated_subtitles(
    subtitles: list[SubtitleSegment],
    max_duration_seconds: float,
    max_text_length: int,
) -> list[SubtitleSegment]:
    merged_subtitles: list[SubtitleSegment] = []
    pending_subtitles = list(subtitles)

    while pending_subtitles:
        subtitle = pending_subtitles.pop(0)
        if not _is_short_translated_subtitle(subtitle):
            merged_subtitles.append(subtitle)
            continue

        if merged_subtitles and _can_merge_translated_subtitles(
            merged_subtitles[-1],
            subtitle,
            max_duration_seconds=max_duration_seconds,
            max_text_length=max_text_length,
        ):
            _merge_translated_subtitle_pair(merged_subtitles[-1], subtitle)
            continue

        if pending_subtitles and _can_merge_translated_subtitles(
            subtitle,
            pending_subtitles[0],
            max_duration_seconds=max_duration_seconds,
            max_text_length=max_text_length,
        ):
            next_subtitle = pending_subtitles.pop(0)
            _merge_translated_subtitle_pair(subtitle, next_subtitle)
            merged_subtitles.append(subtitle)
            continue

        merged_subtitles.append(subtitle)

    return merged_subtitles


def _merge_compact_translated_subtitles(
    subtitles: list[SubtitleSegment],
    max_duration_seconds: float,
    max_text_length: int,
) -> list[SubtitleSegment]:
    if not subtitles:
        return subtitles

    compact_max_text_length = max(
        RENDER_MIN_SUBTITLE_CHARS,
        int(max_text_length * RENDER_COMFORTABLE_SUBTITLE_CHARS_RATIO),
    )
    merged_subtitles: list[SubtitleSegment] = []
    for subtitle in subtitles:
        if merged_subtitles and _can_merge_translated_subtitles(
            merged_subtitles[-1],
            subtitle,
            max_duration_seconds=max_duration_seconds,
            max_text_length=compact_max_text_length,
        ):
            _merge_translated_subtitle_pair(merged_subtitles[-1], subtitle)
            continue

        merged_subtitles.append(subtitle)

    return merged_subtitles


def _is_short_translated_subtitle(subtitle: SubtitleSegment) -> bool:
    translated_text = (subtitle.translated_text or "").replace(" ", "")
    return 0 < len(translated_text) < RENDER_MIN_SUBTITLE_CHARS


def _can_merge_translated_subtitles(
    first: SubtitleSegment,
    second: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
) -> bool:
    if _has_sentence_boundary(first.translated_text or first.text):
        return False

    merged_duration = second.end_time - first.start_time
    if merged_duration > max_duration_seconds:
        return False

    merged_text = _merge_display_texts(first.translated_text, second.translated_text)
    return len(merged_text) <= max_text_length


def _merge_translated_subtitle_pair(
    first: SubtitleSegment,
    second: SubtitleSegment,
) -> None:
    first.end_time = _round_time(max(first.end_time, second.end_time))
    first.text = _merge_display_texts(first.text, second.text)
    first.translated_text = _merge_display_texts(
        first.translated_text,
        second.translated_text,
    )
    first.words.extend(second.words)


def _merge_display_texts(
    first: str | None,
    second: str | None,
) -> str:
    return " ".join(text.strip() for text in (first, second) if text and text.strip())


def _select_words_for_time_range(
    words: list[WordTiming],
    start_time: float,
    end_time: float,
) -> list[WordTiming]:
    selected_words = []
    for word in words:
        if word.start_time is None or word.end_time is None:
            continue

        if word.end_time <= start_time or word.start_time >= end_time:
            continue

        selected_words.append(word)

    return selected_words


def _resolve_source_text_for_render_chunk(
    subtitle: SubtitleSegment,
    words: list[WordTiming],
    index: int,
    total_chunks: int,
) -> str:
    if words:
        return _join_word_texts(words, subtitle.language_code)

    tokens = subtitle.text.split()
    if _is_compact_language(subtitle.language_code):
        tokens = _split_compact_text(
            subtitle.text,
            subtitle.language_code,
            max_token_length=_compact_split_token_length(subtitle.language_code),
        )

    if not tokens or total_chunks <= 1:
        return subtitle.text

    start_index = int(len(tokens) * index / total_chunks)
    end_index = int(len(tokens) * (index + 1) / total_chunks)
    source_text = _join_text_tokens(tokens[start_index:end_index], subtitle.language_code)
    return source_text or subtitle.text


def _resolve_render_max_text_length(
    language_code: str | None,
    configured_max_text_length: int,
) -> int:
    if configured_max_text_length > 0:
        return configured_max_text_length

    normalized_language = (language_code or "").lower()
    max_line_length = RENDER_MAX_LINE_LENGTHS.get(normalized_language, 45)
    return max_line_length * RENDER_MAX_SUBTITLE_LINES


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
    max_duration_seconds: float = 7.0,
    max_text_length: int = 90,
    min_split_duration_seconds: float = 1.0,
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

    split_subtitles: list[SubtitleSegment] = []
    for subtitle in merged_subtitles:
        split_subtitles.extend(
            _split_long_subtitle(
                subtitle,
                max_duration_seconds=max_duration_seconds,
                max_text_length=max_text_length,
                min_split_duration_seconds=min_split_duration_seconds,
            )
        )

    for index, subtitle in enumerate(split_subtitles, start=1):
        subtitle.seq = index

    return split_subtitles


def _apply_subtitle_time_offset(
    subtitles: list[SubtitleSegment],
    offset_seconds: float,
) -> list[SubtitleSegment]:
    if offset_seconds == 0:
        return subtitles

    adjusted_subtitles: list[SubtitleSegment] = []
    previous_end_time = 0.0
    for subtitle in subtitles:
        start_time = max(0.0, subtitle.start_time + offset_seconds)
        end_time = max(start_time + 0.001, subtitle.end_time + offset_seconds)
        start_time = max(start_time, previous_end_time)

        subtitle.start_time = _round_time(start_time)
        subtitle.end_time = _round_time(max(end_time, subtitle.start_time + 0.001))
        _apply_word_time_offset(subtitle.words, offset_seconds)
        adjusted_subtitles.append(subtitle)
        previous_end_time = subtitle.end_time

    return adjusted_subtitles


def _apply_word_time_offset(
    words: list[WordTiming],
    offset_seconds: float,
) -> None:
    for word in words:
        if word.start_time is not None:
            word.start_time = _round_time(max(0.0, word.start_time + offset_seconds))
        if word.end_time is not None:
            word.end_time = _round_time(max(0.0, word.end_time + offset_seconds))


def _split_long_subtitle(
    subtitle: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    sentence_chunks = _split_subtitle_by_sentence_boundaries(
        subtitle,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    if len(sentence_chunks) > 1:
        split_chunks: list[SubtitleSegment] = []
        for sentence_chunk in sentence_chunks:
            split_chunks.extend(
                _split_subtitle_by_limits(
                    sentence_chunk,
                    max_duration_seconds=max_duration_seconds,
                    max_text_length=max_text_length,
                    min_split_duration_seconds=min_split_duration_seconds,
                )
            )
        return split_chunks

    return _split_subtitle_by_limits(
        subtitle,
        max_duration_seconds=max_duration_seconds,
        max_text_length=max_text_length,
        min_split_duration_seconds=min_split_duration_seconds,
    )


def _split_subtitle_by_sentence_boundaries(
    subtitle: SubtitleSegment,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    timed_words = [
        word
        for word in subtitle.words
        if word.start_time is not None and word.end_time is not None
    ]
    if subtitle.words and len(timed_words) == len(subtitle.words):
        return _split_subtitle_sentences_by_words(
            subtitle,
            timed_words,
            min_split_duration_seconds=min_split_duration_seconds,
        )

    return _split_subtitle_sentences_by_text(
        subtitle,
        min_split_duration_seconds=min_split_duration_seconds,
    )


def _split_subtitle_sentences_by_words(
    subtitle: SubtitleSegment,
    words: list[WordTiming],
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    chunks: list[list[WordTiming]] = []
    current_chunk: list[WordTiming] = []

    for word in words:
        current_chunk.append(word)
        if not _has_sentence_boundary(word.word):
            continue

        chunk_start = current_chunk[0].start_time or subtitle.start_time
        chunk_end = current_chunk[-1].end_time or subtitle.end_time
        if chunk_end <= chunk_start:
            continue

        chunks.append(current_chunk)
        current_chunk = []

    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) <= 1:
        return [subtitle]

    return _build_subtitle_chunks_from_words(subtitle, chunks)


def _split_subtitle_sentences_by_text(
    subtitle: SubtitleSegment,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    tokens = subtitle.text.split()
    if _is_compact_language(subtitle.language_code):
        tokens = _split_compact_text(
            subtitle.text,
            subtitle.language_code,
            max_token_length=_compact_split_token_length(subtitle.language_code),
        )

    if not tokens:
        return [subtitle]

    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    for token in tokens:
        current_chunk.append(token)
        if _has_sentence_boundary(token):
            chunks.append(current_chunk)
            current_chunk = []

    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) <= 1:
        return [subtitle]

    return _build_subtitle_chunks_from_text(
        subtitle,
        chunks,
        min_split_duration_seconds=min_split_duration_seconds,
    )


def _split_subtitle_by_limits(
    subtitle: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    duration = subtitle.end_time - subtitle.start_time
    if duration <= max_duration_seconds and len(subtitle.text) <= max_text_length:
        return [subtitle]

    timed_words = [
        word
        for word in subtitle.words
        if word.start_time is not None and word.end_time is not None
    ]
    if subtitle.words and len(timed_words) == len(subtitle.words):
        return _split_subtitle_by_words(
            subtitle,
            timed_words,
            max_duration_seconds=max_duration_seconds,
            max_text_length=max_text_length,
            min_split_duration_seconds=min_split_duration_seconds,
        )

    return _split_subtitle_by_text(
        subtitle,
        max_duration_seconds=max_duration_seconds,
        max_text_length=max_text_length,
        min_split_duration_seconds=min_split_duration_seconds,
    )


def _split_subtitle_by_words(
    subtitle: SubtitleSegment,
    words: list[WordTiming],
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    chunks: list[list[WordTiming]] = []
    current_chunk: list[WordTiming] = []

    for word in words:
        current_chunk.append(word)
        chunk_text = _join_word_texts(current_chunk, subtitle.language_code)
        chunk_start = current_chunk[0].start_time or subtitle.start_time
        chunk_end = current_chunk[-1].end_time or subtitle.end_time
        chunk_duration = chunk_end - chunk_start

        can_split = chunk_duration >= min_split_duration_seconds
        reached_limit = (
            chunk_duration >= max_duration_seconds or len(chunk_text) >= max_text_length
        )
        reached_sentence_boundary = _has_sentence_boundary(word.word) and can_split

        if reached_sentence_boundary:
            chunks.append(current_chunk)
            current_chunk = []
            continue

        if reached_limit:
            split_chunk, remaining_chunk = _split_word_chunk_at_best_boundary(
                current_chunk,
                language_code=subtitle.language_code,
                min_split_duration_seconds=min_split_duration_seconds,
            )
            chunks.append(split_chunk)
            current_chunk = remaining_chunk

    if current_chunk:
        chunks.append(current_chunk)

    chunks = _merge_short_word_chunks(
        chunks,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    return _build_subtitle_chunks_from_words(subtitle, chunks)


def _split_word_chunk_at_best_boundary(
    chunk: list[WordTiming],
    language_code: str | None,
    min_split_duration_seconds: float,
) -> tuple[list[WordTiming], list[WordTiming]]:
    split_index = _find_best_word_split_index(
        chunk,
        language_code=language_code,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    if split_index is None:
        return chunk, []

    return chunk[:split_index], chunk[split_index:]


def _find_best_word_split_index(
    chunk: list[WordTiming],
    language_code: str | None,
    min_split_duration_seconds: float,
) -> int | None:
    if len(chunk) <= 2:
        return None

    candidates = []
    for index in range(1, len(chunk)):
        previous = chunk[index - 1]
        current = chunk[index]
        start_time = chunk[0].start_time or 0
        previous_end_time = previous.end_time or start_time
        duration = previous_end_time - start_time
        if duration < min_split_duration_seconds:
            continue

        score = _score_split_boundary(previous.word, current.word, language_code)
        candidates.append((score, index))

    if not candidates:
        return None

    target_index = max(1, int(len(chunk) * 0.6))
    best_score = max(score for score, _ in candidates)
    best_candidates = [index for score, index in candidates if score == best_score]
    return min(best_candidates, key=lambda index: abs(index - target_index))


def _build_subtitle_chunks_from_words(
    subtitle: SubtitleSegment,
    chunks: list[list[WordTiming]],
) -> list[SubtitleSegment]:
    split_subtitles = []
    previous_end_time = subtitle.start_time
    for chunk in chunks:
        if not chunk:
            continue

        start_time = _round_time(
            max(chunk[0].start_time or subtitle.start_time, previous_end_time)
        )
        end_time = _round_time(chunk[-1].end_time or subtitle.end_time)
        if end_time <= start_time:
            continue

        split_subtitles.append(
            SubtitleSegment(
                seq=subtitle.seq,
                start_time=start_time,
                end_time=end_time,
                text=_join_word_texts(chunk, subtitle.language_code),
                translated_text=subtitle.translated_text,
                language_code=subtitle.language_code,
                words=chunk,
            )
        )
        previous_end_time = end_time

    return split_subtitles or [subtitle]


def _merge_short_word_chunks(
    chunks: list[list[WordTiming]],
    min_split_duration_seconds: float,
) -> list[list[WordTiming]]:
    merged_chunks: list[list[WordTiming]] = []
    for chunk in chunks:
        if not chunk:
            continue

        chunk_duration = (chunk[-1].end_time or 0) - (chunk[0].start_time or 0)
        if merged_chunks and chunk_duration < min_split_duration_seconds:
            merged_chunks[-1].extend(chunk)
            continue

        merged_chunks.append(chunk)

    return merged_chunks


def _build_subtitle_chunks_from_text(
    subtitle: SubtitleSegment,
    chunks: list[list[str]],
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    text_chunks = [chunk for chunk in chunks if chunk]
    if not text_chunks:
        return [subtitle]

    total_duration = subtitle.end_time - subtitle.start_time
    split_subtitles = []
    previous_end_time = subtitle.start_time
    for index, chunk in enumerate(text_chunks):
        start_time = previous_end_time
        remaining_chunks = len(text_chunks) - index
        remaining_duration = subtitle.end_time - start_time
        chunk_duration = max(
            min_split_duration_seconds,
            remaining_duration / remaining_chunks,
        )
        end_time = (
            subtitle.end_time
            if index == len(text_chunks) - 1
            else min(subtitle.end_time, start_time + chunk_duration)
        )
        start_time = _round_time(start_time)
        end_time = _round_time(end_time)
        if end_time <= start_time:
            continue

        split_subtitles.append(
            SubtitleSegment(
                seq=subtitle.seq,
                start_time=start_time,
                end_time=end_time,
                text=_join_text_tokens(chunk, subtitle.language_code),
                translated_text=subtitle.translated_text,
                language_code=subtitle.language_code,
                words=[],
            )
        )
        previous_end_time = end_time

    return split_subtitles or [subtitle]


def _split_subtitle_by_text(
    subtitle: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    words = subtitle.text.split()
    if _is_compact_language(subtitle.language_code):
        words = _split_compact_text(
            subtitle.text,
            subtitle.language_code,
            max_token_length=_compact_split_token_length(subtitle.language_code),
        )

    if not words:
        return [subtitle]

    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    for word in words:
        current_chunk.append(word)
        chunk_text = _join_text_tokens(current_chunk, subtitle.language_code)
        if _has_sentence_boundary(word) or len(chunk_text) >= max_text_length:
            chunks.append(current_chunk)
            current_chunk = []

    if current_chunk:
        chunks.append(current_chunk)

    total_duration = subtitle.end_time - subtitle.start_time
    chunks = _ensure_text_chunk_limits(
        chunks,
        total_duration=total_duration,
        max_duration_seconds=max_duration_seconds,
        max_text_length=max_text_length,
        language_code=subtitle.language_code,
    )
    chunks = _merge_text_chunks_for_min_duration(
        chunks,
        total_duration=total_duration,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    chunks = _rebalance_short_text_chunks(
        chunks,
        language_code=subtitle.language_code,
        max_text_length=max_text_length,
    )
    if len(chunks) <= 1:
        return [subtitle]

    split_subtitles = []
    previous_end_time = subtitle.start_time
    for index, chunk in enumerate(chunks):
        start_time = previous_end_time
        remaining_chunks = len(chunks) - index
        remaining_duration = subtitle.end_time - start_time
        chunk_duration = max(
            min_split_duration_seconds,
            remaining_duration / remaining_chunks,
        )
        end_time = (
            subtitle.end_time
            if index == len(chunks) - 1
            else start_time + chunk_duration
        )
        start_time = _round_time(start_time)
        end_time = _round_time(end_time)
        if end_time <= start_time:
            continue

        split_subtitles.append(
            SubtitleSegment(
                seq=subtitle.seq,
                start_time=start_time,
                end_time=end_time,
                text=_join_text_tokens(chunk, subtitle.language_code),
                translated_text=subtitle.translated_text,
                language_code=subtitle.language_code,
                words=[],
            )
        )
        previous_end_time = end_time

    return split_subtitles or [subtitle]


def _ensure_text_chunk_limits(
    chunks: list[list[str]],
    total_duration: float,
    max_duration_seconds: float,
    max_text_length: int,
    language_code: str | None = None,
) -> list[list[str]]:
    text_length = sum(len(_join_text_tokens(chunk, language_code)) for chunk in chunks)
    required_by_duration = max(
        1,
        math.ceil(total_duration / max_duration_seconds),
    )
    required_by_text = max(1, math.ceil(text_length / max_text_length))
    target_by_duration = max(
        1,
        round(total_duration / RENDER_TARGET_SECONDS_PER_SUBTITLE),
    )
    required_chunks = max(required_by_duration, required_by_text)
    required_chunks = min(
        required_chunks,
        max(required_by_text, target_by_duration),
    )
    limited_chunks = [list(chunk) for chunk in chunks if chunk]

    while len(limited_chunks) < required_chunks:
        split_index = _find_longest_text_chunk_index(limited_chunks, language_code)
        chunk = limited_chunks[split_index]
        if len(chunk) <= 1:
            break

        middle = _find_best_text_split_index(chunk, language_code) or max(
            1,
            len(chunk) // 2,
        )
        limited_chunks[split_index : split_index + 1] = [
            chunk[:middle],
            chunk[middle:],
        ]

    return limited_chunks


def _find_longest_text_chunk_index(
    chunks: list[list[str]],
    language_code: str | None = None,
) -> int:
    return max(
        range(len(chunks)),
        key=lambda index: len(_join_text_tokens(chunks[index], language_code)),
    )


def _find_best_text_split_index(
    chunk: list[str],
    language_code: str | None = None,
) -> int | None:
    if len(chunk) <= 2:
        return None

    candidates = []
    for index in range(1, len(chunk)):
        previous = chunk[index - 1]
        current = chunk[index]
        score = _score_split_boundary(previous, current, language_code)
        candidates.append((score, index))

    if not candidates:
        return None

    target_index = max(1, int(len(chunk) * 0.6))
    best_score = max(score for score, _ in candidates)
    best_candidates = [index for score, index in candidates if score == best_score]
    return min(best_candidates, key=lambda index: abs(index - target_index))


def _merge_text_chunks_for_min_duration(
    chunks: list[list[str]],
    total_duration: float,
    min_split_duration_seconds: float,
) -> list[list[str]]:
    max_chunks = max(1, int(total_duration // min_split_duration_seconds))
    merged_chunks = [list(chunk) for chunk in chunks if chunk]
    while len(merged_chunks) > max_chunks:
        merged_chunks[-2].extend(merged_chunks[-1])
        merged_chunks.pop()

    return merged_chunks


def _rebalance_short_text_chunks(
    chunks: list[list[str]],
    language_code: str | None,
    max_text_length: int,
) -> list[list[str]]:
    rebalanced_chunks = [list(chunk) for chunk in chunks if chunk]

    for _ in range(max(1, len(rebalanced_chunks) * 2)):
        changed = False
        for index, chunk in enumerate(rebalanced_chunks):
            while (
                0
                < _render_text_length(chunk, language_code)
                < RENDER_MIN_SUBTITLE_CHARS
            ):
                if _borrow_token_from_previous_chunk(
                    rebalanced_chunks,
                    index,
                    language_code,
                    max_text_length,
                ):
                    changed = True
                    continue

                if _borrow_token_from_next_chunk(
                    rebalanced_chunks,
                    index,
                    language_code,
                    max_text_length,
                ):
                    changed = True
                    continue

                break

        if not changed:
            break

    return rebalanced_chunks


def _borrow_token_from_previous_chunk(
    chunks: list[list[str]],
    index: int,
    language_code: str | None,
    max_text_length: int,
) -> bool:
    if index <= 0:
        return False

    previous_chunk = chunks[index - 1]
    current_chunk = chunks[index]
    if len(previous_chunk) <= 1:
        return False

    if _has_sentence_boundary(previous_chunk[-1]):
        return False

    candidate_chunk = [previous_chunk[-1], *current_chunk]
    if _render_text_length(candidate_chunk, language_code) > max_text_length:
        return False

    previous_chunk.pop()
    current_chunk.insert(0, candidate_chunk[0])
    return True


def _borrow_token_from_next_chunk(
    chunks: list[list[str]],
    index: int,
    language_code: str | None,
    max_text_length: int,
) -> bool:
    if index >= len(chunks) - 1:
        return False

    current_chunk = chunks[index]
    next_chunk = chunks[index + 1]
    if len(next_chunk) <= 1:
        return False

    if _has_sentence_boundary(current_chunk[-1]):
        return False

    candidate_chunk = [*current_chunk, next_chunk[0]]
    if _render_text_length(candidate_chunk, language_code) > max_text_length:
        return False

    current_chunk.append(next_chunk.pop(0))
    return True


def _render_text_length(
    tokens: list[str],
    language_code: str | None,
) -> int:
    return len(_join_text_tokens(tokens, language_code).replace(" ", ""))


def _join_word_texts(
    words: list[WordTiming],
    language_code: str | None = None,
) -> str:
    return _join_text_tokens(
        [word.word for word in words],
        language_code,
    )


def _join_text_tokens(tokens: list[str], language_code: str | None = None) -> str:
    separator = "" if _is_compact_language(language_code) else " "
    return separator.join(token.strip() for token in tokens if token.strip()).strip()


def _has_sentence_boundary(text: str) -> bool:
    return text.rstrip().endswith(NORMALIZED_SENTENCE_BOUNDARY_SUFFIXES)


def _score_split_boundary(
    previous_text: str,
    current_text: str,
    language_code: str | None,
) -> int:
    if _has_sentence_boundary(previous_text):
        return 100

    language_key = _language_family(language_code)
    current_normalized = _normalize_split_token(current_text)
    previous_normalized = _normalize_split_token(previous_text)
    if _is_language_split_before(current_normalized, language_key):
        return 80

    if _is_language_split_after(previous_normalized, language_key):
        return 70

    if _is_soft_split_word(current_text):
        return 60

    return 10


def _language_family(language_code: str | None) -> str | None:
    if not language_code:
        return None

    normalized_code = language_code.lower()
    if normalized_code.startswith("zh"):
        return "zh"
    if normalized_code.startswith("ja"):
        return "ja"
    if normalized_code.startswith("ko"):
        return "ko"
    if normalized_code.startswith("es"):
        return "es"
    if normalized_code.startswith("fr"):
        return "fr"
    if normalized_code.startswith("en"):
        return "en"

    return normalized_code


def _normalize_split_token(text: str) -> str:
    return text.strip().strip("\"'“”‘’()[]{}.,!?;:。？！…").lower()


def _is_language_split_before(text: str, language_key: str | None) -> bool:
    if not text or not language_key:
        return False

    split_words = LANGUAGE_SPLIT_BEFORE_WORDS.get(language_key, set())
    return any(text == word or text.startswith(word) for word in split_words)


def _is_language_split_after(text: str, language_key: str | None) -> bool:
    if not text or not language_key:
        return False

    split_suffixes = LANGUAGE_SPLIT_AFTER_SUFFIXES.get(language_key, ())
    return any(text.endswith(suffix) for suffix in split_suffixes)


def _is_soft_split_word(text: str) -> bool:
    normalized_text = text.strip().strip("\"'“”‘’()[]{}.,!?;:").lower()
    return normalized_text in SOFT_SPLIT_WORDS


def _is_compact_language(language_code: str | None) -> bool:
    if not language_code:
        return False

    return language_code.lower() in COMPACT_TEXT_LANGUAGES


def _split_compact_text(
    text: str,
    language_code: str | None = None,
    max_token_length: int | None = None,
) -> list[str]:
    resolved_max_token_length = max_token_length or _compact_split_token_length(
        language_code
    )
    tokens = []
    current_token = ""
    for character in text:
        if character.isspace():
            if current_token:
                tokens.extend(
                    _split_long_compact_token(
                        current_token,
                        max_token_length=resolved_max_token_length,
                        language_code=language_code,
                    )
                )
                current_token = ""
            continue

        current_token += character
        if _has_sentence_boundary(character):
            tokens.append(current_token)
            current_token = ""

    if current_token:
        tokens.extend(
            _split_long_compact_token(
                current_token,
                max_token_length=resolved_max_token_length,
                language_code=language_code,
            )
        )

    return tokens


def _compact_split_token_length(language_code: str | None) -> int:
    normalized_language = (language_code or "").lower()
    return max(12, RENDER_MAX_LINE_LENGTHS.get(normalized_language, 22))


def _split_long_compact_token(
    token: str,
    max_token_length: int = 18,
    language_code: str | None = None,
) -> list[str]:
    if len(token) <= max_token_length:
        return [token]

    chunks = []
    remaining_text = token
    while len(remaining_text) > max_token_length:
        split_index = _find_compact_split_index(
            remaining_text,
            max_token_length=max_token_length,
            language_code=language_code,
        )
        chunks.append(remaining_text[:split_index])
        remaining_text = remaining_text[split_index:]

    if remaining_text:
        chunks.append(remaining_text)

    return chunks


def _find_compact_split_index(
    text: str,
    max_token_length: int,
    language_code: str | None,
) -> int:
    language_key = _language_family(language_code)
    upper_bound = min(max_token_length, len(text) - 1)
    lower_bound = max(1, int(max_token_length * 0.45))
    candidates = []
    for index in range(lower_bound, upper_bound + 1):
        score = _score_compact_split_boundary(text, index, language_key)
        distance_penalty = abs(index - max_token_length)
        candidates.append((score, -distance_penalty, index))

    if not candidates:
        return min(max_token_length, len(text) - 1)

    _, _, split_index = max(candidates)
    return split_index


def _score_compact_split_boundary(
    text: str,
    index: int,
    language_key: str | None,
) -> int:
    previous_text = text[:index]
    current_text = text[index:]
    current_character = current_text[:1]
    if current_character in UNSAFE_COMPACT_SPLIT_PREFIXES:
        return -100

    if _has_sentence_boundary(previous_text[-1:]):
        return 100

    current_normalized = _normalize_split_token(current_text)
    previous_normalized = _normalize_split_token(previous_text)
    if _is_language_split_before(current_normalized, language_key):
        return 80

    if _is_language_split_after(previous_normalized, language_key):
        return 70

    return 10


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
        "model": options.get(
            "model",
            os.getenv("AI_DEFAULT_MODEL", "large-v3-turbo"),
        ),
        "batch_size": int(
            options.get("batch_size", os.getenv("AI_DEFAULT_BATCH_SIZE", "16"))
        ),
        "compute_type": options.get(
            "compute_type",
            os.getenv("AI_DEFAULT_COMPUTE_TYPE", "float16"),
        ),
        "align": not _to_bool(
            options.get("no_align", os.getenv("AI_DEFAULT_NO_ALIGN", "false"))
        ),
        "stt_min_segment_seconds": float(
            options.get(
                "stt_min_segment_seconds",
                os.getenv("AI_STT_MIN_SEGMENT_SECONDS", "0.2"),
            )
        ),
        "stt_max_segment_seconds": float(
            options.get(
                "stt_max_segment_seconds",
                os.getenv("AI_STT_MAX_SEGMENT_SECONDS", "7.0"),
            )
        ),
        "stt_max_segment_chars": int(
            options.get(
                "stt_max_segment_chars",
                os.getenv("AI_STT_MAX_SEGMENT_CHARS", "90"),
            )
        ),
        "stt_min_split_seconds": float(
            options.get(
                "stt_min_split_seconds",
                os.getenv("AI_STT_MIN_SPLIT_SECONDS", "1.0"),
            )
        ),
        "stt_time_offset_seconds": float(
            options.get(
                "stt_time_offset_seconds",
                os.getenv("AI_STT_TIME_OFFSET_SECONDS", "0.0"),
            )
        ),
        "translated_subtitle_max_seconds": float(
            options.get(
                "translated_subtitle_max_seconds",
                os.getenv("AI_TRANSLATED_SUBTITLE_MAX_SECONDS", "8.0"),
            )
        ),
        "translated_subtitle_max_chars": int(
            options.get(
                "translated_subtitle_max_chars",
                os.getenv("AI_TRANSLATED_SUBTITLE_MAX_CHARS", "0"),
            )
        ),
        "translated_subtitle_min_split_seconds": float(
            options.get(
                "translated_subtitle_min_split_seconds",
                os.getenv("AI_TRANSLATED_SUBTITLE_MIN_SPLIT_SECONDS", "1.5"),
            )
        ),
        "translation_block_max_seconds": float(
            options.get(
                "translation_block_max_seconds",
                os.getenv("AI_TRANSLATION_BLOCK_MAX_SECONDS", "12.0"),
            )
        ),
        "translation_block_max_chars": int(
            options.get(
                "translation_block_max_chars",
                os.getenv("AI_TRANSLATION_BLOCK_MAX_CHARS", "180"),
            )
        ),
        "frame_interval": float(
            options.get("frame_interval", os.getenv("AI_DEFAULT_FRAME_INTERVAL", "0.5"))
        ),
        "ocr_gpu": _to_bool(
            options.get("ocr_gpu", os.getenv("AI_DEFAULT_OCR_GPU", "true"))
        ),
        "ocr_change_threshold": float(
            options.get(
                "ocr_change_threshold",
                os.getenv("AI_OCR_CHANGE_THRESHOLD", "0.015"),
            )
        ),
        "ocr_skip_unchanged_frames": _to_bool(
            options.get(
                "ocr_skip_unchanged_frames",
                os.getenv("AI_OCR_SKIP_UNCHANGED_FRAMES", "true"),
            )
        ),
        "ocr_max_skip_frames": int(
            options.get(
                "ocr_max_skip_frames",
                os.getenv("AI_OCR_MAX_SKIP_FRAMES", "1"),
            )
        ),
        "ocr_min_confidence": float(
            options.get(
                "ocr_min_confidence",
                os.getenv("AI_OCR_MIN_CONFIDENCE", "0.45"),
            )
        ),
        "ocr_min_text_length": int(
            options.get(
                "ocr_min_text_length",
                os.getenv("AI_OCR_MIN_TEXT_LENGTH", "2"),
            )
        ),
        "ocr_max_special_char_ratio": float(
            options.get(
                "ocr_max_special_char_ratio",
                os.getenv("AI_OCR_MAX_SPECIAL_CHAR_RATIO", "0.6"),
            )
        ),
        "ocr_edge_margin": float(
            options.get("ocr_edge_margin", os.getenv("AI_OCR_EDGE_MARGIN", "0.0"))
        ),
        "ocr_bbox_change_threshold": float(
            options.get(
                "ocr_bbox_change_threshold",
                os.getenv("AI_OCR_BBOX_CHANGE_THRESHOLD", "0.01"),
            )
        ),
        "ocr_bbox_change_padding": float(
            options.get(
                "ocr_bbox_change_padding",
                os.getenv("AI_OCR_BBOX_CHANGE_PADDING", "0.02"),
            )
        ),
        "ocr_tracking_enabled": _to_bool(
            options.get(
                "ocr_tracking_enabled",
                os.getenv("AI_OCR_TRACKING_ENABLED", "false"),
            )
        ),
        "ocr_global_scan_interval_seconds": float(
            options.get(
                "ocr_global_scan_interval_seconds",
                os.getenv("AI_OCR_GLOBAL_SCAN_INTERVAL_SECONDS", "2.0"),
            )
        ),
        "ocr_tracking_padding": float(
            options.get(
                "ocr_tracking_padding",
                os.getenv("AI_OCR_TRACKING_PADDING", "0.025"),
            )
        ),
        "ocr_tracking_preprocess_variants": options.get(
            "ocr_tracking_preprocess_variants",
            os.getenv("AI_OCR_TRACKING_PREPROCESS_VARIANTS", "original,contrast"),
        ),
    }


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _round_time(value: Any) -> float:
    return round(float(value), 3)


def _optional_round_time(value: Any) -> float | None:
    if value is None:
        return None

    return _round_time(value)


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _split_csv_option(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip().lower() for item in value if str(item).strip()]

    return [
        item.strip().lower()
        for item in str(value or "").split(",")
        if item.strip()
    ]


def _report_progress(
    callback: ProgressCallback | None,
    current_stage: CurrentStage,
    progress: float,
    extra: dict[str, Any] | None = None,
) -> None:
    if callback is None:
        return

    callback(current_stage, progress, extra)
