import argparse
import logging
import json
import os
import time
import torch
import warnings
from typing import List, Dict, Any
from stt_service import STTService

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=UserWarning)

# PyTorch Patch (for Safe Globals)
if hasattr(torch.serialization, "add_safe_globals"):
    original_load = torch.serialization.load

    def patched_load(*args, **kwargs):
        kwargs["weights_only"] = False
        return original_load(*args, **kwargs)

    torch.load = patched_load
    torch.serialization.load = patched_load


def save_to_json(data: List[Dict[str, Any]], output_path: str):
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved results to: {output_path}")
    except Exception as e:
        logger.error(f"Failed to save JSON: {e}")


def main():
    parser = argparse.ArgumentParser(description="OverLang AI CLI")

    # Input/Output
    parser.add_argument(
        "--input", type=str, required=True, help="Input audio file path"
    )
    parser.add_argument(
        "--output", type=str, default="result.json", help="Output JSON path"
    )

    # Model Config
    parser.add_argument(
        "--model",
        type=str,
        default="large-v2",
        help="Whisper model size (default: large-v2)",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda",
        choices=["cuda", "cpu"],
        help="Execution device",
    )
    parser.add_argument(
        "--compute-type",
        type=str,
        default="float16",
        help="Compute type (float16, int8)",
    )

    # Runtime Config
    parser.add_argument(
        "--batch-size", type=int, default=16, help="Batch size for transcription"
    )
    parser.add_argument(
        "--language", type=str, default=None, help="Language code (ko, en...)"
    )
    parser.add_argument(
        "--no-align", action="store_true", help="Skip alignment step for speed"
    )
    parser.add_argument(
        "--warmup", action="store_true", help="Load model immediately on start"
    )

    args = parser.parse_args()

    # 0. File Check
    if not os.path.exists(args.input):
        logger.error(f"Input file not found: {args.input}")
        return

    # 1. Initialize Service
    try:
        service = STTService(
            device=args.device, model_name=args.model, compute_type=args.compute_type
        )

        # 2. Warmup (Optional)
        if args.warmup:
            logger.info("Warming up model...")
            service.load_model()

        # 3. Process
        start_time = time.time()
        results = service.transcribe(
            audio_path=args.input,
            batch_size=args.batch_size,
            language=args.language,
            align=not args.no_align,  # CLI flag is 'no-align', so invert
        )

        elapsed = time.time() - start_time
        logger.info(f"Total processed in {elapsed:.2f}s")

        # 4. Save
        if results:
            save_to_json(results, args.output)

        # 5. Cleanup (CLI only - Server might keep it)
        service.unload_model()

    except Exception as e:
        logger.error(f"Critical Error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
