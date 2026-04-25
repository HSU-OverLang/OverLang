from __future__ import annotations

from pathlib import Path

import ffmpeg


def extract_frames(
    input_path: str | Path,
    output_dir: str | Path,
    interval_seconds: float = 1.0,
) -> list[dict[str, object]]:
    source_path = Path(input_path)
    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)

    if not source_path.exists():
        raise FileNotFoundError(f"Input media file not found: {source_path}")

    output_pattern = destination_dir / "frame_%06d.png"
    try:
        (
            ffmpeg.input(str(source_path))
            .filter("fps", fps=f"1/{interval_seconds}")
            .output(str(output_pattern), start_number=0)
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as error:
        error_message = error.stderr.decode() if error.stderr else str(error)
        raise RuntimeError(f"FFmpeg frame extraction failed: {error_message}") from error

    frame_paths = sorted(destination_dir.glob("frame_*.png"))
    frames = []
    for index, frame_path in enumerate(frame_paths):
        frames.append(
            {
                "frameIndex": index,
                "timestamp": round(index * interval_seconds, 3),
                "path": str(frame_path),
            }
        )

    return frames
