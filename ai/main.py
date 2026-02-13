import logging
import json
import os
import time
import argparse
import torch
import whisperx
import warnings
from typing import List, Dict, Any

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

warnings.filterwarnings("ignore", category=UserWarning)

# PyTorch Patch
if hasattr(torch.serialization, "add_safe_globals"):
    original_load = torch.serialization.load
    def patched_load(*args, **kwargs):
        kwargs['weights_only'] = False
        return original_load(*args, **kwargs)
    torch.load = patched_load
    torch.serialization.load = patched_load

def setup_environment():
    """GPU 및 환경 설정 확인"""
    logger.info("--- [OverLang AI] Start ---")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Device: {device.upper()}")
    if device == "cuda":
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    return device

def process_audio(audio_path: str, device: str, language: str = None, model_name: str = "large-v2") -> List[Dict[str, Any]]:
    if not os.path.exists(audio_path):
        logger.error(f"File not found: {audio_path}")
        return []

    logger.info(f"Processing: {audio_path}")
    start_time = time.time()
    compute_type = "float16" if device == "cuda" else "int8"
    
    try:
        model = whisperx.load_model(model_name, device, compute_type=compute_type)
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=16, language=language)
        
        # Align (Optional)
        try:
            model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
            result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)
        except Exception as e:
            logger.warning(f"Align failed: {e}")

        formatted_results = []
        for segment in result["segments"]:
            item = {
                "startTime": round(segment["start"], 3),
                "endTime": round(segment["end"], 3),
                "text": segment["text"].strip()
            }
            formatted_results.append(item)
            
        logger.info(f"Done ({time.time() - start_time:.2f}s)")
        return formatted_results

    except Exception as e:
        logger.error(f"Error: {e}")
        return []

def save_to_json(data: List[Dict[str, Any]], output_path: str):
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    parser = argparse.ArgumentParser(description="OverLang AI")
    parser.add_argument("--input", type=str, help="Input file path")
    parser.add_argument("--output", type=str, default="result.json", help="Output path")
    parser.add_argument("--language", type=str, default=None, help="Language code (ko, en...)")
    parser.add_argument("--model", type=str, default="large-v2", help="Whisper model size")
    args = parser.parse_args()
    
    if not args.input:
        logger.error("No input provided. Use --input")
        return

    device = setup_environment()
    results = process_audio(args.input, device, args.language, args.model)
    
    if results:
        save_to_json(results, args.output)

if __name__ == "__main__":
    main()
