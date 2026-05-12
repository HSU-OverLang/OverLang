from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from ai.api.schemas import BoundingBox

DEFAULT_OCR_REGIONS = "full,top,center,bottom"
DEFAULT_REFINE_ENABLED = True
DEFAULT_REFINE_SCALE = 2.0
DEFAULT_REFINE_PADDING = 0.015
DEFAULT_REFINE_MIN_CONFIDENCE = 0.2
PRESET_OCR_REGIONS = {
    "full": (0.0, 0.0, 1.0, 1.0),
    "top": (0.0, 0.0, 1.0, 0.35),
    "center": (0.0, 0.25, 1.0, 0.75),
    "bottom": (0.0, 0.55, 1.0, 1.0),
}


class EasyOcrService:
    def __init__(
        self,
        languages: list[str],
        gpu: bool = True,
    ) -> None:
        try:
            import easyocr
        except ImportError as error:
            raise ImportError(
                "EasyOCR is not installed. Install easyocr before running OCR."
            ) from error

        self.reader = easyocr.Reader(languages, gpu=gpu)

    def extract_frame_text(
        self,
        frame_path: str | Path,
        frame_index: int,
        timestamp: float,
    ) -> list[dict[str, Any]]:
        source_path = Path(frame_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Frame image not found: {source_path}")

        image_width, image_height = _read_image_size(source_path)
        results = self.reader.readtext(str(source_path))

        raw_items = []
        for bbox_points, text, confidence in results:
            origin_text = str(text).strip()
            if not origin_text:
                continue

            raw_items.append(
                {
                    "frameIndex": frame_index,
                    "timestamp": round(float(timestamp), 3),
                    "originText": origin_text,
                    "boundingBox": _normalize_bbox(
                        bbox_points,
                        image_width,
                        image_height,
                    ),
                    "confidence": round(float(confidence), 4),
                }
            )

        return raw_items


def language_to_easyocr_languages(language_code: str | None) -> list[str]:
    if language_code == "zh":
        return ["ch_sim", "en"]

    if language_code == "ja":
        return ["ja", "en"]

    if language_code == "ko":
        return ["ko", "en"]

    if language_code == "en":
        return ["en"]

    if language_code in {"es", "fr"}:
        return [language_code, "en"]

    return ["en"]


def _read_image_size(image_path: Path) -> tuple[int, int]:
    with Image.open(image_path) as image:
        return image.size


def _normalize_bbox(
    bbox_points: list[list[float]],
    image_width: int,
    image_height: int,
) -> BoundingBox:
    x_values = [point[0] for point in bbox_points]
    y_values = [point[1] for point in bbox_points]
    x_min = max(min(x_values), 0)
    y_min = max(min(y_values), 0)
    x_max = min(max(x_values), image_width)
    y_max = min(max(y_values), image_height)

    return BoundingBox(
        x=round(x_min / image_width, 6),
        y=round(y_min / image_height, 6),
        w=round((x_max - x_min) / image_width, 6),
        h=round((y_max - y_min) / image_height, 6),
    )
