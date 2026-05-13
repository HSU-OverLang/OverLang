from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


DEFAULT_CHANGE_THRESHOLD = 0.015
DEFAULT_SAMPLE_SIZE = (320, 180)
DEFAULT_BBOX_SAMPLE_SIZE = (160, 80)
DEFAULT_BBOX_PADDING_RATIO = 0.02

TEXT_PRIORITY_REGIONS = (
    (0.00, 0.00, 1.00, 0.30),  # top captions or labels
    (0.00, 0.35, 1.00, 1.00),  # subtitles and lower-third overlays
    (0.15, 0.15, 0.85, 0.85),  # centered title cards
)
PIXEL_SCORE_WEIGHT = 0.35
REGION_SCORE_WEIGHT = 0.35
EDGE_SCORE_WEIGHT = 0.30
SIGNIFICANT_PIXEL_DIFF_THRESHOLD = 0.12
SIGNIFICANT_EDGE_DIFF_THRESHOLD = 0.08
LOCALIZED_CHANGE_MULTIPLIER = 25.0


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
            change_metrics = calculate_frame_change_metrics(
                previous_frame_path,
                current_frame_path,
                sample_size=sample_size,
            )
            current_frame.update(change_metrics)
            current_frame["hasVisualChange"] = (
                change_metrics["changeScore"] >= change_threshold
            )

        annotated_frames.append(current_frame)
        previous_frame_path = current_frame_path

    return annotated_frames


def calculate_frame_change_score(
    previous_frame_path: str | Path,
    current_frame_path: str | Path,
    sample_size: tuple[int, int] = DEFAULT_SAMPLE_SIZE,
) -> float:
    return calculate_frame_change_metrics(
        previous_frame_path,
        current_frame_path,
        sample_size=sample_size,
    )["changeScore"]


def calculate_frame_change_metrics(
    previous_frame_path: str | Path,
    current_frame_path: str | Path,
    sample_size: tuple[int, int] = DEFAULT_SAMPLE_SIZE,
) -> dict[str, float]:
    previous_pixels = _load_sampled_grayscale(previous_frame_path, sample_size)
    current_pixels = _load_sampled_grayscale(current_frame_path, sample_size)
    diff = np.abs(previous_pixels - current_pixels)

    pixel_score = float(diff.mean())
    region_score = _calculate_priority_region_score(diff)
    edge_score = _calculate_edge_change_score(previous_pixels, current_pixels)
    localized_score = _calculate_localized_change_score(
        diff,
        previous_pixels,
        current_pixels,
    )
    change_score = max(
        (pixel_score * PIXEL_SCORE_WEIGHT)
        + (region_score * REGION_SCORE_WEIGHT)
        + (edge_score * EDGE_SCORE_WEIGHT),
        region_score,
        edge_score,
        localized_score,
    )

    return {
        "changeScore": _round_score(change_score),
        "pixelChangeScore": _round_score(pixel_score),
        "regionChangeScore": _round_score(region_score),
        "edgeChangeScore": _round_score(edge_score),
        "localizedChangeScore": _round_score(localized_score),
    }


def calculate_bounding_box_change_score(
    previous_frame_path: str | Path,
    current_frame_path: str | Path,
    bounding_boxes: list[Any],
    padding_ratio: float = DEFAULT_BBOX_PADDING_RATIO,
    sample_size: tuple[int, int] = DEFAULT_BBOX_SAMPLE_SIZE,
) -> float:
    if not bounding_boxes:
        return 0.0

    previous_path = Path(previous_frame_path)
    current_path = Path(current_frame_path)
    if not previous_path.exists():
        raise FileNotFoundError(f"Frame image not found: {previous_path}")
    if not current_path.exists():
        raise FileNotFoundError(f"Frame image not found: {current_path}")

    scores = []
    with Image.open(previous_path) as previous_image, Image.open(current_path) as current_image:
        previous_gray = previous_image.convert("L")
        current_gray = current_image.convert("L")
        image_width, image_height = current_gray.size

        for bounding_box in bounding_boxes:
            crop_box = _bbox_to_padded_pixel_box(
                bounding_box,
                image_width,
                image_height,
                padding_ratio,
            )
            previous_pixels = _crop_sampled_grayscale(
                previous_gray,
                crop_box,
                sample_size,
            )
            current_pixels = _crop_sampled_grayscale(
                current_gray,
                crop_box,
                sample_size,
            )
            diff = np.abs(previous_pixels - current_pixels)
            pixel_score = float(diff.mean())
            edge_score = _calculate_edge_change_score(previous_pixels, current_pixels)
            localized_score = _calculate_localized_change_score(
                diff,
                previous_pixels,
                current_pixels,
            )
            scores.append(max(pixel_score, edge_score, localized_score))

    return _round_score(max(scores) if scores else 0.0)


def _calculate_priority_region_score(diff: np.ndarray) -> float:
    height, width = diff.shape
    region_scores = []

    for left_ratio, top_ratio, right_ratio, bottom_ratio in TEXT_PRIORITY_REGIONS:
        left = int(width * left_ratio)
        right = max(left + 1, int(width * right_ratio))
        top = int(height * top_ratio)
        bottom = max(top + 1, int(height * bottom_ratio))
        region_scores.append(float(diff[top:bottom, left:right].mean()))

    return max(region_scores) if region_scores else float(diff.mean())


def _calculate_edge_change_score(
    previous_pixels: np.ndarray,
    current_pixels: np.ndarray,
) -> float:
    previous_edges = _calculate_edge_map(previous_pixels)
    current_edges = _calculate_edge_map(current_pixels)
    return float(np.abs(previous_edges - current_edges).mean())


def _calculate_localized_change_score(
    diff: np.ndarray,
    previous_pixels: np.ndarray,
    current_pixels: np.ndarray,
) -> float:
    edge_diff = np.abs(
        _calculate_edge_map(previous_pixels) - _calculate_edge_map(current_pixels)
    )
    strong_pixel_ratio = _calculate_strong_change_ratio(
        diff,
        SIGNIFICANT_PIXEL_DIFF_THRESHOLD,
    )
    strong_region_ratio = _calculate_priority_region_strong_change_ratio(
        diff,
        SIGNIFICANT_PIXEL_DIFF_THRESHOLD,
    )
    strong_edge_ratio = _calculate_strong_change_ratio(
        edge_diff,
        SIGNIFICANT_EDGE_DIFF_THRESHOLD,
    )
    return min(
        max(strong_pixel_ratio, strong_region_ratio, strong_edge_ratio)
        * LOCALIZED_CHANGE_MULTIPLIER,
        1.0,
    )


def _calculate_priority_region_strong_change_ratio(
    diff: np.ndarray,
    threshold: float,
) -> float:
    height, width = diff.shape
    region_ratios = []

    for left_ratio, top_ratio, right_ratio, bottom_ratio in TEXT_PRIORITY_REGIONS:
        left = int(width * left_ratio)
        right = max(left + 1, int(width * right_ratio))
        top = int(height * top_ratio)
        bottom = max(top + 1, int(height * bottom_ratio))
        region_ratios.append(
            _calculate_strong_change_ratio(diff[top:bottom, left:right], threshold)
        )

    return max(region_ratios) if region_ratios else _calculate_strong_change_ratio(
        diff,
        threshold,
    )


def _calculate_strong_change_ratio(
    diff: np.ndarray,
    threshold: float,
) -> float:
    return float(np.mean(diff >= threshold))


def _calculate_edge_map(pixels: np.ndarray) -> np.ndarray:
    vertical_edges = np.abs(np.diff(pixels, axis=0, prepend=pixels[:1, :]))
    horizontal_edges = np.abs(np.diff(pixels, axis=1, prepend=pixels[:, :1]))
    return (vertical_edges + horizontal_edges) / 2.0


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
        ) / 255.0


def _crop_sampled_grayscale(
    image: Image.Image,
    crop_box: tuple[int, int, int, int],
    sample_size: tuple[int, int],
) -> np.ndarray:
    return np.asarray(
        image.crop(crop_box).resize(sample_size),
        dtype=np.float32,
    ) / 255.0


def _bbox_to_padded_pixel_box(
    bounding_box: Any,
    image_width: int,
    image_height: int,
    padding_ratio: float,
) -> tuple[int, int, int, int]:
    x = _bbox_value(bounding_box, "x")
    y = _bbox_value(bounding_box, "y")
    w = _bbox_value(bounding_box, "w")
    h = _bbox_value(bounding_box, "h")

    left = int((x - padding_ratio) * image_width)
    top = int((y - padding_ratio) * image_height)
    right = int((x + w + padding_ratio) * image_width)
    bottom = int((y + h + padding_ratio) * image_height)

    left = max(0, min(left, image_width - 1))
    top = max(0, min(top, image_height - 1))
    right = max(left + 1, min(right, image_width))
    bottom = max(top + 1, min(bottom, image_height))
    return left, top, right, bottom


def _bbox_value(
    bounding_box: Any,
    key: str,
) -> float:
    if isinstance(bounding_box, dict):
        return float(bounding_box[key])

    return float(getattr(bounding_box, key))


def _round_score(value: float) -> float:
    return round(float(value), 6)
