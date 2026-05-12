from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Callable

from ai.api.schemas import (
    AnalysisMetadata,
    AnalysisRequest,
    AnalysisResult,
    CurrentStage,
    JobType,
    LearningData,
    OcrItem,
    SubtitleSegment,
    TranslationProvider,
    WordTiming,
    WorkerJobPayload,
)
from ai.learning import generate_learning_data
from ai.ocr.frame_change import annotate_frame_changes
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
from ai.translation import create_translation_service

ProgressCallback = Callable[[CurrentStage, float, dict[str, Any] | None], None]

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
        learning_data: LearningData | None = None
        pipeline_steps: list[str] = []
        warnings: list[str] = []
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
            frames = annotate_frame_changes(
                frames,
                change_threshold=float(runtime_options["ocr_change_threshold"]),
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

        resolved_source_language = _resolve_source_language(
            normalized_job.source_language,
            subtitles,
        )
        if _should_run_translation(normalized_job, resolved_source_language):
            _report_progress(progress_callback, CurrentStage.TRANSLATION, 80.0)
            warnings.extend(
                _run_translation_stage(
                    normalized_job,
                    subtitles,
                    ocr_items,
                    resolved_source_language,
                )
            )
            subtitles = _split_translated_subtitles_for_rendering(
                subtitles,
                target_language=normalized_job.target_language,
                max_duration_seconds=float(
                    runtime_options["translated_subtitle_max_seconds"]
                ),
                max_text_length=int(runtime_options["translated_subtitle_max_chars"]),
                min_split_duration_seconds=float(
                    runtime_options["translated_subtitle_min_split_seconds"]
                ),
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
                warnings.append(f"Learning data generation failed: {error}")

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
                fallback_used=False,
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
    consecutive_skipped_frames = 0
    for frame in frames:
        should_skip_frame = (
            runtime_options["ocr_skip_unchanged_frames"]
            and not bool(frame.get("hasVisualChange", True))
            and consecutive_skipped_frames
            < int(runtime_options["ocr_max_skip_frames"])
        )

        if should_skip_frame:
            raw_items.extend(
                _carry_forward_ocr_items(
                    latest_detected_items,
                    frame,
                )
            )
            consecutive_skipped_frames += 1
            continue

        detected_items = ocr_service.extract_frame_text(
            frame_path=str(frame["path"]),
            frame_index=int(frame["frameIndex"]),
            timestamp=float(frame["timestamp"]),
        )
        raw_items.extend(detected_items)
        latest_detected_items = detected_items
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


def _run_translation_stage(
    job: AnalysisRequest | WorkerJobPayload,
    subtitles: list[SubtitleSegment],
    ocr_items: list[OcrItem],
    source_language: str | None,
) -> list[str]:
    target_language = job.target_language
    if target_language is None:
        return []

    translation_service = create_translation_service(job.translation_provider)
    subtitle_texts = [subtitle.text for subtitle in subtitles]
    ocr_texts = [ocr_item.origin_text for ocr_item in ocr_items]

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

    for ocr_item, translated_text in zip(ocr_items, ocr_translations):
        ocr_item.translated_text = translated_text

    if _enum_value(job.translation_provider) == TranslationProvider.DEFAULT.value:
        return [
            "DEFAULT translation provider uses development placeholder output. "
            "Configure a production provider before serving user-facing translations."
        ]

    return []


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
        tokens = _split_compact_text(text)

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
        tokens = _split_compact_text(subtitle.text)

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
    min_split_duration_seconds: float,
) -> tuple[list[WordTiming], list[WordTiming]]:
    split_index = _find_best_word_split_index(
        chunk,
        min_split_duration_seconds=min_split_duration_seconds,
    )
    if split_index is None:
        return chunk, []

    return chunk[:split_index], chunk[split_index:]


def _find_best_word_split_index(
    chunk: list[WordTiming],
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

        if _has_sentence_boundary(previous.word) or _is_soft_split_word(current.word):
            candidates.append(index)

    if not candidates:
        return None

    target_index = max(1, int(len(chunk) * 0.6))
    return min(candidates, key=lambda index: abs(index - target_index))


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


def _split_subtitle_by_text(
    subtitle: SubtitleSegment,
    max_duration_seconds: float,
    max_text_length: int,
    min_split_duration_seconds: float,
) -> list[SubtitleSegment]:
    words = subtitle.text.split()
    if _is_compact_language(subtitle.language_code):
        words = _split_compact_text(subtitle.text)

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

        middle = _find_best_text_split_index(chunk) or max(1, len(chunk) // 2)
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


def _find_best_text_split_index(chunk: list[str]) -> int | None:
    if len(chunk) <= 2:
        return None

    candidates = []
    for index in range(1, len(chunk)):
        previous = chunk[index - 1]
        current = chunk[index]
        if _has_sentence_boundary(previous) or _is_soft_split_word(current):
            candidates.append(index)

    if not candidates:
        return None

    target_index = max(1, int(len(chunk) * 0.6))
    return min(candidates, key=lambda index: abs(index - target_index))


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
    return text.rstrip().endswith(SENTENCE_BOUNDARY_SUFFIXES)


def _is_soft_split_word(text: str) -> bool:
    normalized_text = text.strip().strip("\"'“”‘’()[]{}.,!?;:").lower()
    return normalized_text in SOFT_SPLIT_WORDS


def _is_compact_language(language_code: str | None) -> bool:
    if not language_code:
        return False

    return language_code.lower() in COMPACT_TEXT_LANGUAGES


def _split_compact_text(text: str) -> list[str]:
    tokens = []
    current_token = ""
    for character in text:
        if character.isspace():
            if current_token:
                tokens.extend(_split_long_compact_token(current_token))
                current_token = ""
            continue

        current_token += character
        if character in SENTENCE_BOUNDARY_SUFFIXES:
            tokens.append(current_token)
            current_token = ""

    if current_token:
        tokens.extend(_split_long_compact_token(current_token))

    return tokens


def _split_long_compact_token(token: str, max_token_length: int = 18) -> list[str]:
    if len(token) <= max_token_length:
        return [token]

    return [
        token[index : index + max_token_length]
        for index in range(0, len(token), max_token_length)
    ]


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
        "frame_interval": float(
            options.get("frame_interval", os.getenv("AI_DEFAULT_FRAME_INTERVAL", "1.0"))
        ),
        "ocr_gpu": _to_bool(
            options.get("ocr_gpu", os.getenv("AI_DEFAULT_OCR_GPU", "true"))
        ),
        "ocr_change_threshold": float(options.get("ocr_change_threshold", 0.015)),
        "ocr_skip_unchanged_frames": bool(
            options.get("ocr_skip_unchanged_frames", True)
        ),
        "ocr_max_skip_frames": int(options.get("ocr_max_skip_frames", 1)),
        "ocr_min_confidence": float(options.get("ocr_min_confidence", 0.3)),
        "ocr_min_text_length": int(options.get("ocr_min_text_length", 2)),
        "ocr_max_special_char_ratio": float(
            options.get("ocr_max_special_char_ratio", 0.6)
        ),
        "ocr_edge_margin": float(options.get("ocr_edge_margin", 0.0)),
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


def _report_progress(
    callback: ProgressCallback | None,
    current_stage: CurrentStage,
    progress: float,
    extra: dict[str, Any] | None = None,
) -> None:
    if callback is None:
        return

    callback(current_stage, progress, extra)
