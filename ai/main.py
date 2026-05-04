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
    parser = argparse.ArgumentParser(description="OverLang AI CLI")
    parser.add_argument("--input", type=str, required=True, help="Input media file path")
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
        help="Source language code (ko, en, ja...)",
    )
    parser.add_argument(
        "--target-language",
        type=str,
        default=None,
        help="Target language code",
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

    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    request = AnalysisRequest(
        source_type=SourceType.UPLOAD,
        file_url=str(input_path.resolve()),
        job_type=JobType(args.job_type),
        source_language=args.language,
        target_language=args.target_language,
        translation_provider=TranslationProvider(args.translation_provider),
        use_user_api_key=False,
        options={
            "model": args.model,
            "compute_type": args.compute_type,
            "batch_size": args.batch_size,
            "no_align": args.no_align,
            "frame_interval": args.frame_interval,
            "ocr_gpu": not args.ocr_cpu,
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


if __name__ == "__main__":
    main()
