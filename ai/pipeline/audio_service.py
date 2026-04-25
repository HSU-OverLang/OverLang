from __future__ import annotations

from pathlib import Path

import ffmpeg


def extract_audio_to_wav(
    input_path: str | Path,
    output_dir: str | Path,
    sample_rate: int = 16000,
) -> Path:
    source_path = Path(input_path)
    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)

    if not source_path.exists():
        raise FileNotFoundError(f"Input media file not found: {source_path}")

    output_path = destination_dir / f"{source_path.stem}_16k.wav"

    try:
        (
            ffmpeg.input(str(source_path))
            .output(str(output_path), ac=1, ar=sample_rate)
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as error:
        error_message = error.stderr.decode() if error.stderr else str(error)
        raise RuntimeError(f"FFmpeg audio extraction failed: {error_message}") from error

    return output_path
