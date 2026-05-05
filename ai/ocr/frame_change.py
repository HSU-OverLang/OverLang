from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


DEFAULT_CHANGE_THRESHOLD = 0.015
DEFAULT_SAMPLE_SIZE = (160, 90)


def annotate_frame_changes(
    frames: list[dict[str, Any]],
    change_threshold: float = DEFAULT_CHANGE_THRESHOLD,
    sample_size: tuple[int, int] = DEFAULT_SAMPLE_SIZE,
) -> list[dict[str, Any]]:
    annotated_frames: list[dict[str, Any]] = []
    previous_frame_path: Path | None = None

    for index, frame in enumerate(frames):
        current_frame = dict(frame)
        current_frame_path = Path(str(current_frame["path"]))

        if index == 0 or previous_frame_path is None:
            current_frame["changeScore"] = 1.0
            current_frame["hasVisualChange"] = True
        else:
            change_score = calculate_frame_change_score(
                previous_frame_path,
                current_frame_path,
                sample_size=sample_size,
            )
            current_frame["changeScore"] = change_score
            current_frame["hasVisualChange"] = change_score >= change_threshold

        annotated_frames.append(current_frame)
        previous_frame_path = current_frame_path

    return annotated_frames


def calculate_frame_change_score(
    previous_frame_path: str | Path,
    current_frame_path: str | Path,
    sample_size: tuple[int, int] = DEFAULT_SAMPLE_SIZE,
) -> float:
    previous_pixels = _load_sampled_grayscale(previous_frame_path, sample_size)
    current_pixels = _load_sampled_grayscale(current_frame_path, sample_size)
    diff = np.abs(previous_pixels - current_pixels)

    return round(float(diff.mean() / 255.0), 6)


def _load_sampled_grayscale(
    frame_path: str | Path,
    sample_size: tuple[int, int],
) -> np.ndarray:
    source_path = Path(frame_path)
    if not source_path.exists():
        raise FileNotFoundError(f"Frame image not found: {source_path}")

    with Image.open(source_path) as image:
        return np.asarray(
            image.convert("L").resize(sample_size),
            dtype=np.float32,
        )
