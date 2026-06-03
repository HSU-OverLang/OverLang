from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image

from ai.api.schemas import BoundingBox, OcrStyle

BLUR_PADDING_RATIO = 0.01
BACKGROUND_SAMPLE_PADDING_RATIO = 0.015
BOLD_STROKE_CONTRAST_THRESHOLD = 55
BOLD_DARK_PIXEL_RATIO_THRESHOLD = 0.18
DEFAULT_FONT_SCALE = 0.66
DEFAULT_FONT_RATIO_MAX = 0.045


def build_ocr_style(
    frame_path: str | None,
    bounding_box: BoundingBox,
    line_count: int = 1,
) -> OcrStyle | None:
    if not frame_path:
        return None

    source_path = Path(frame_path)
    if not source_path.exists():
        return None

    with Image.open(source_path) as image:
        rgb_image = image.convert("RGB")
        image_width, image_height = rgb_image.size
        background_region = _expand_box(
            bounding_box,
            padding_ratio=BACKGROUND_SAMPLE_PADDING_RATIO,
        )
        crop_box = _to_pixel_box(background_region, image_width, image_height)
        if crop_box is None:
            return None

        pixels = np.asarray(rgb_image.crop(crop_box), dtype=np.uint8)

    if pixels.size == 0:
        return None

    dominant_background_color = _dominant_color(pixels)
    background_color = _mean_color(pixels)
    text_color = _estimate_text_color(pixels, dominant_background_color)

    return OcrStyle(
        background_color=background_color,
        dominant_background_color=dominant_background_color,
        text_color=text_color,
        font_size_ratio=_estimate_font_size_ratio(bounding_box, line_count),
        font_weight=_estimate_font_weight(pixels),
        text_align=_estimate_text_align(bounding_box),
        blur_region=_expand_box(
            bounding_box,
            padding_ratio=BLUR_PADDING_RATIO,
        ),
    )


def _expand_box(
    bounding_box: BoundingBox,
    padding_ratio: float,
) -> BoundingBox:
    x = max(0.0, bounding_box.x - padding_ratio)
    y = max(0.0, bounding_box.y - padding_ratio)
    right = min(1.0, bounding_box.x + bounding_box.w + padding_ratio)
    bottom = min(1.0, bounding_box.y + bounding_box.h + padding_ratio)

    return BoundingBox(
        x=round(x, 6),
        y=round(y, 6),
        w=round(max(0.0, right - x), 6),
        h=round(max(0.0, bottom - y), 6),
    )


def _to_pixel_box(
    bounding_box: BoundingBox,
    image_width: int,
    image_height: int,
) -> tuple[int, int, int, int] | None:
    left = int(bounding_box.x * image_width)
    top = int(bounding_box.y * image_height)
    right = int((bounding_box.x + bounding_box.w) * image_width)
    bottom = int((bounding_box.y + bounding_box.h) * image_height)

    left = max(0, min(left, image_width - 1))
    top = max(0, min(top, image_height - 1))
    right = max(left + 1, min(right, image_width))
    bottom = max(top + 1, min(bottom, image_height))

    if right <= left or bottom <= top:
        return None

    return left, top, right, bottom


def _mean_color(pixels: np.ndarray) -> str:
    rgb = pixels.reshape(-1, 3).mean(axis=0)
    return _rgb_to_hex(rgb)


def _dominant_color(pixels: np.ndarray) -> str:
    flattened_pixels = pixels.reshape(-1, 3)
    quantized_pixels = (flattened_pixels // 32) * 32
    colors, counts = np.unique(quantized_pixels, axis=0, return_counts=True)
    dominant_color = colors[int(counts.argmax())] + 16
    return _rgb_to_hex(dominant_color)


def _readable_text_color(background_color: str) -> str:
    red = int(background_color[1:3], 16)
    green = int(background_color[3:5], 16)
    blue = int(background_color[5:7], 16)
    luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue)
    return "#000000" if luminance >= 160 else "#FFFFFF"


def _estimate_text_color(pixels: np.ndarray, background_color: str) -> str:
    background_rgb = _hex_to_rgb(background_color)
    flattened_pixels = pixels.reshape(-1, 3).astype(float)
    distances = np.linalg.norm(flattened_pixels - background_rgb, axis=1)
    if distances.size == 0:
        return _readable_text_color(background_color)

    threshold = max(45.0, float(np.percentile(distances, 82)))
    foreground_pixels = flattened_pixels[distances >= threshold]
    if len(foreground_pixels) < 8:
        return _readable_text_color(background_color)

    background_luminance = _luminance(background_rgb)
    foreground_luminance = np.apply_along_axis(_luminance, 1, foreground_pixels)
    if background_luminance < 128:
        preferred_pixels = foreground_pixels[
            foreground_luminance >= background_luminance + 35
        ]
    else:
        preferred_pixels = foreground_pixels[
            foreground_luminance <= background_luminance - 35
        ]

    if len(preferred_pixels) >= 8:
        foreground_pixels = preferred_pixels

    return _dominant_color(foreground_pixels.astype(np.uint8))


def _hex_to_rgb(color: str) -> np.ndarray:
    try:
        return np.array(
            [
                int(color[1:3], 16),
                int(color[3:5], 16),
                int(color[5:7], 16),
            ],
            dtype=float,
        )
    except (TypeError, ValueError):
        return np.array([0, 0, 0], dtype=float)


def _luminance(rgb: np.ndarray) -> float:
    return float((0.299 * rgb[0]) + (0.587 * rgb[1]) + (0.114 * rgb[2]))


def _estimate_font_size_ratio(
    bounding_box: BoundingBox,
    line_count: int,
) -> float:
    safe_line_count = max(1, line_count)
    line_height_ratio = bounding_box.h / safe_line_count
    font_size_ratio = line_height_ratio * _font_scale()
    return round(max(0.0, min(font_size_ratio, _font_ratio_max())), 6)


def _font_scale() -> float:
    return _float_env("AI_OCR_FONT_SCALE", DEFAULT_FONT_SCALE)


def _font_ratio_max() -> float:
    return _float_env("AI_OCR_FONT_RATIO_MAX", DEFAULT_FONT_RATIO_MAX)


def _float_env(env_name: str, default_value: float) -> float:
    try:
        return float(os.getenv(env_name, default_value))
    except (TypeError, ValueError):
        return default_value


def _estimate_font_weight(pixels: np.ndarray) -> str:
    luminance = (
        (pixels[:, :, 0].astype(float) * 0.299)
        + (pixels[:, :, 1].astype(float) * 0.587)
        + (pixels[:, :, 2].astype(float) * 0.114)
    )
    contrast = float(luminance.max() - luminance.min())
    dark_pixel_ratio = float((luminance < 80).mean())
    if (
        contrast >= BOLD_STROKE_CONTRAST_THRESHOLD
        and dark_pixel_ratio >= BOLD_DARK_PIXEL_RATIO_THRESHOLD
    ):
        return "BOLD"

    return "NORMAL"


def _estimate_text_align(bounding_box: BoundingBox) -> str:
    center_x = bounding_box.x + (bounding_box.w / 2)
    if 0.4 <= center_x <= 0.6:
        return "CENTER"

    if center_x < 0.4:
        return "LEFT"

    return "RIGHT"


def _rgb_to_hex(rgb: np.ndarray) -> str:
    red, green, blue = [max(0, min(255, int(round(value)))) for value in rgb]
    return f"#{red:02X}{green:02X}{blue:02X}"
