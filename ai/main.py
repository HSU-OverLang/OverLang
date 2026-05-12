from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

from ai.api.schemas import AnalysisRequest, JobType, SourceType, TranslationProvider
from ai.pipeline.run_pipeline import run_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def main() -> None:
    _load_env_file()

    parser = argparse.ArgumentParser(description="OverLang AI CLI")
    parser.add_argument("--input", type=str, required=True, help="Input media path or URL")
    parser.add_argument(
        "--source-type",
        type=str,
        default=SourceType.UPLOAD.value,
        choices=[source_type.value for source_type in SourceType],
        help="Input source type",
    )
    parser.add_argument("--output", type=str, default="result.json", help="Output JSON path")
    parser.add_argument(
        "--job-type",
        type=str,
        default=JobType.FULL_ANALYSIS.value,
        choices=[job_type.value for job_type in JobType],
        help="Pipeline job type",
    )
    parser.add_argument("--model", type=str, default="large-v3-turbo", help="Whisper model size")
    parser.add_argument(
        "--compute-type",
        type=str,
        default="float16",
        help="Compute type (float16, int8_float16, int8)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for transcription",
    )
    parser.add_argument(
        "--language",
        type=str,
        default=None,
        help="Source language code (KO, EN, ZH, JA, ES, FR)",
    )
    parser.add_argument(
        "--target-language",
        type=str,
        default=None,
        help="Target language code (KO, EN, ZH, JA, ES, FR)",
    )
    parser.add_argument(
        "--translation-provider",
        type=str,
        default=TranslationProvider.DEFAULT.value,
        choices=[provider.value for provider in TranslationProvider],
        help="Translation provider identifier",
    )
    parser.add_argument(
        "--no-align",
        action="store_true",
        help="Skip alignment step for speed",
    )
    parser.add_argument(
        "--stt-min-segment-seconds",
        type=float,
        default=0.2,
        help="Minimum subtitle segment duration before merging with the previous segment",
    )
    parser.add_argument(
        "--stt-max-segment-seconds",
        type=float,
        default=15.0,
        help="Maximum source subtitle duration before safety splitting long STT output",
    )
    parser.add_argument(
        "--stt-max-segment-chars",
        type=int,
        default=220,
        help="Maximum source subtitle text length before safety splitting long STT output",
    )
    parser.add_argument(
        "--stt-min-split-seconds",
        type=float,
        default=1.0,
        help="Minimum duration for sentence-boundary STT split chunks",
    )
    parser.add_argument(
        "--translated-subtitle-max-seconds",
        type=float,
        default=8.0,
        help="Maximum rendered translated subtitle duration before splitting",
    )
    parser.add_argument(
        "--translated-subtitle-max-chars",
        type=int,
        default=0,
        help="Maximum rendered translated subtitle length. Use 0 for two-line language defaults.",
    )
    parser.add_argument(
        "--translated-subtitle-min-split-seconds",
        type=float,
        default=1.5,
        help="Minimum duration for rendered translated subtitle chunks",
    )
    parser.add_argument(
        "--frame-interval",
        type=float,
        default=1.0,
        help="Frame extraction interval for OCR jobs",
    )
    parser.add_argument(
        "--ocr-cpu",
        action="store_true",
        help="Run OCR on CPU instead of GPU",
    )
    parser.add_argument(
        "--ocr-change-threshold",
        type=float,
        default=0.015,
        help="Minimum frame difference score required to run OCR",
    )
    parser.add_argument(
        "--disable-ocr-frame-skip",
        action="store_true",
        help="Run OCR on every extracted frame",
    )
    parser.add_argument(
        "--ocr-max-skip-frames",
        type=int,
        default=1,
        help="Maximum consecutive unchanged frames to skip before forcing OCR",
    )
    parser.add_argument(
        "--ocr-min-confidence",
        type=float,
        default=0.3,
        help="Minimum OCR confidence to keep a detected text item",
    )
    parser.add_argument(
        "--ocr-min-text-length",
        type=int,
        default=2,
        help="Minimum non-space text length to keep a detected text item",
    )
    parser.add_argument(
        "--ocr-max-special-char-ratio",
        type=float,
        default=0.6,
        help="Maximum special character ratio allowed for OCR text",
    )
    parser.add_argument(
        "--ocr-edge-margin",
        type=float,
        default=0.0,
        help="Edge margin for filtering tiny OCR noise near image borders",
    )

    args = parser.parse_args()
    source_type = SourceType(args.source_type)
    file_url = None
    source_url = None

    if source_type == SourceType.UPLOAD:
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        file_url = str(input_path.resolve())
    elif source_type == SourceType.YOUTUBE:
        source_url = args.input

    request = AnalysisRequest(
        source_type=source_type,
        file_url=file_url,
        source_url=source_url,
        job_type=JobType(args.job_type),
        source_language=args.language,
        target_language=args.target_language,
        translation_provider=TranslationProvider(args.translation_provider),
        options={
            "model": args.model,
            "compute_type": args.compute_type,
            "batch_size": args.batch_size,
            "no_align": args.no_align,
            "stt_min_segment_seconds": args.stt_min_segment_seconds,
            "stt_max_segment_seconds": args.stt_max_segment_seconds,
            "stt_max_segment_chars": args.stt_max_segment_chars,
            "stt_min_split_seconds": args.stt_min_split_seconds,
            "translated_subtitle_max_seconds": args.translated_subtitle_max_seconds,
            "translated_subtitle_max_chars": args.translated_subtitle_max_chars,
            "translated_subtitle_min_split_seconds": (
                args.translated_subtitle_min_split_seconds
            ),
            "frame_interval": args.frame_interval,
            "ocr_gpu": not args.ocr_cpu,
            "ocr_change_threshold": args.ocr_change_threshold,
            "ocr_skip_unchanged_frames": not args.disable_ocr_frame_skip,
            "ocr_max_skip_frames": args.ocr_max_skip_frames,
            "ocr_min_confidence": args.ocr_min_confidence,
            "ocr_min_text_length": args.ocr_min_text_length,
            "ocr_max_special_char_ratio": args.ocr_max_special_char_ratio,
            "ocr_edge_margin": args.ocr_edge_margin,
        },
    )

    def progress_callback(current_stage, progress, extra=None) -> None:
        logger.info("Stage=%s Progress=%.1f", current_stage.value, progress)

    start_time = time.time()
    result = run_pipeline(request, progress_callback=progress_callback)
    elapsed = time.time() - start_time

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(result.model_dump(by_alias=True), file, ensure_ascii=False, indent=2)

    logger.info("Saved results to: %s", output_path)
    logger.info("Total processed in %.2fs", elapsed)


def _load_env_file() -> None:
    try:
        from dotenv import load_dotenv
    except ModuleNotFoundError:
        logger.debug("python-dotenv is not installed; skipping .env loading.")
        return

    load_dotenv(Path(__file__).resolve().parent / ".env")


if __name__ == "__main__":
    main()
