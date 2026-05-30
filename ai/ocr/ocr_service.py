from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from ai.api.schemas import BoundingBox

DEFAULT_OCR_REGIONS = "full,top,center,bottom"
DEFAULT_REFINE_ENABLED = True
DEFAULT_REFINE_SCALE = 2.0
DEFAULT_REFINE_PADDING = 0.015
DEFAULT_REFINE_MIN_CONFIDENCE = 0.45
DEFAULT_OCR_PREPROCESS_VARIANTS = "original,contrast,threshold"
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

        raw_items = []
        with Image.open(source_path) as image:
            rgb_image = image.convert("RGB")
            image_width, image_height = rgb_image.size
            for region_name, crop_box in _iter_ocr_regions(
                image_width,
                image_height,
            ):
                crop_image = rgb_image.crop(crop_box)
                for variant_name, prepared_image in _iter_preprocessed_images(
                    crop_image
                ):
                    results = self.reader.readtext(np.asarray(prepared_image))

                    for bbox_points, text, confidence in results:
                        origin_text = str(text).strip()
                        if not origin_text:
                            continue

                        raw_items.append(
                            {
                                "frameIndex": frame_index,
                                "framePath": str(source_path),
                                "timestamp": round(float(timestamp), 3),
                                "originText": origin_text,
                                "boundingBox": _normalize_bbox(
                                    bbox_points,
                                    image_width,
                                    image_height,
                                    crop_box,
                                ),
                                "confidence": round(float(confidence), 4),
                                "sourceRegion": region_name,
                                "ocrVariant": variant_name,
                            }
                        )

        if _to_bool(os.getenv("AI_OCR_REFINE_ENABLED", str(DEFAULT_REFINE_ENABLED))):
            raw_items.extend(
                _extract_refined_items(
                    self.reader,
                    source_path,
                    raw_items,
                    image_width,
                    image_height,
                )
            )

        return raw_items


def language_to_easyocr_languages(language_code: str | None) -> list[str]:
    extra_languages = _resolve_extra_ocr_languages()

    if language_code == "zh":
        return _dedupe_languages(["ch_sim", "en", *extra_languages])

    if language_code == "ja":
        return _dedupe_languages(["ja", "en", *extra_languages])

    if language_code == "ko":
        return _dedupe_languages(["ko", "en", *extra_languages])

    if language_code == "en":
        return _dedupe_languages(["en", *extra_languages])

    if language_code in {"es", "fr"}:
        return _dedupe_languages([language_code, "en", *extra_languages])

    return _dedupe_languages(["en", *extra_languages])


def _resolve_extra_ocr_languages() -> list[str]:
    raw_value = os.getenv("AI_OCR_EXTRA_LANGUAGES", "")
    return [
        language.strip().lower()
        for language in raw_value.split(",")
        if language.strip()
    ]


def _dedupe_languages(languages: list[str]) -> list[str]:
    deduped_languages = []
    for language in languages:
        if language not in deduped_languages:
            deduped_languages.append(language)

    return deduped_languages


def _read_image_size(image_path: Path) -> tuple[int, int]:
    with Image.open(image_path) as image:
        return image.size


def _iter_ocr_regions(
    image_width: int,
    image_height: int,
) -> list[tuple[str, tuple[int, int, int, int]]]:
    regions = []
    for region_name, ratios in _resolve_ocr_regions():
        left_ratio, top_ratio, right_ratio, bottom_ratio = ratios
        left = int(image_width * left_ratio)
        top = int(image_height * top_ratio)
        right = int(image_width * right_ratio)
        bottom = int(image_height * bottom_ratio)
        left = max(0, min(left, image_width - 1))
        top = max(0, min(top, image_height - 1))
        right = max(left + 1, min(right, image_width))
        bottom = max(top + 1, min(bottom, image_height))
        regions.append((region_name, (left, top, right, bottom)))

    return regions


def _resolve_ocr_regions() -> list[tuple[str, tuple[float, float, float, float]]]:
    configured_regions = os.getenv("AI_OCR_REGIONS", DEFAULT_OCR_REGIONS)
    regions = []
    for raw_region_name in configured_regions.split(","):
        region_name = raw_region_name.strip().lower()
        if not region_name:
            continue

        ratios = PRESET_OCR_REGIONS.get(region_name)
        if ratios is None:
            continue

        regions.append((region_name, ratios))

    return regions or [("full", PRESET_OCR_REGIONS["full"])]


def _iter_preprocessed_images(crop_image: Image.Image) -> list[tuple[str, Image.Image]]:
    variants = []
    configured_variants = os.getenv(
        "AI_OCR_PREPROCESS_VARIANTS",
        DEFAULT_OCR_PREPROCESS_VARIANTS,
    )
    for raw_variant_name in configured_variants.split(","):
        variant_name = raw_variant_name.strip().lower()
        if not variant_name:
            continue

        prepared_image = _build_preprocessed_image(crop_image, variant_name)
        if prepared_image is not None:
            variants.append((variant_name, prepared_image))

    return variants or [("original", crop_image)]


def _build_preprocessed_image(
    crop_image: Image.Image,
    variant_name: str,
) -> Image.Image | None:
    if variant_name == "original":
        return crop_image

    if variant_name == "contrast":
        return (
            ImageEnhance.Contrast(crop_image)
            .enhance(1.8)
            .filter(ImageFilter.SHARPEN)
        )

    if variant_name == "threshold":
        grayscale_image = crop_image.convert("L")
        enhanced_image = ImageEnhance.Contrast(grayscale_image).enhance(2.0)
        threshold_image = enhanced_image.point(
            lambda pixel: 255 if pixel >= 150 else 0
        )
        return threshold_image.convert("RGB")

    if variant_name == "invert_threshold":
        grayscale_image = crop_image.convert("L")
        enhanced_image = ImageEnhance.Contrast(grayscale_image).enhance(2.0)
        threshold_image = enhanced_image.point(
            lambda pixel: 0 if pixel >= 150 else 255
        )
        return threshold_image.convert("RGB")

    return None


def _extract_refined_items(
    reader: Any,
    source_path: Path,
    raw_items: list[dict[str, Any]],
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    if not raw_items:
        return []

    refine_scale = float(os.getenv("AI_OCR_REFINE_SCALE", str(DEFAULT_REFINE_SCALE)))
    refine_padding = float(
        os.getenv("AI_OCR_REFINE_PADDING", str(DEFAULT_REFINE_PADDING))
    )
    refine_min_confidence = float(
        os.getenv(
            "AI_OCR_REFINE_MIN_CONFIDENCE",
            str(DEFAULT_REFINE_MIN_CONFIDENCE),
        )
    )
    refined_items = []
    with Image.open(source_path) as image:
        rgb_image = image.convert("RGB")
        for raw_item in raw_items:
            crop_box = _bbox_to_padded_pixel_box(
                raw_item["boundingBox"],
                image_width,
                image_height,
                refine_padding,
            )
            crop_image = rgb_image.crop(crop_box)
            if refine_scale > 1.0:
                crop_image = crop_image.resize(
                    (
                        max(1, int(crop_image.width * refine_scale)),
                        max(1, int(crop_image.height * refine_scale)),
                    )
                )

            results = reader.readtext(np.asarray(crop_image))
            for bbox_points, text, confidence in results:
                origin_text = str(text).strip()
                if not origin_text or float(confidence) < refine_min_confidence:
                    continue

                refined_items.append(
                    {
                        "frameIndex": raw_item["frameIndex"],
                        "framePath": raw_item["framePath"],
                        "timestamp": raw_item["timestamp"],
                        "originText": origin_text,
                        "boundingBox": _normalize_refined_bbox(
                            bbox_points,
                            image_width,
                            image_height,
                            crop_box,
                            refine_scale,
                        ),
                        "confidence": round(float(confidence), 4),
                        "sourceRegion": f"refine:{raw_item.get('sourceRegion', 'unknown')}",
                        "refined": True,
                    }
                )

    return refined_items


def _bbox_to_padded_pixel_box(
    bounding_box: BoundingBox,
    image_width: int,
    image_height: int,
    padding_ratio: float,
) -> tuple[int, int, int, int]:
    left = int((bounding_box.x - padding_ratio) * image_width)
    top = int((bounding_box.y - padding_ratio) * image_height)
    right = int((bounding_box.x + bounding_box.w + padding_ratio) * image_width)
    bottom = int((bounding_box.y + bounding_box.h + padding_ratio) * image_height)

    left = max(0, min(left, image_width - 1))
    top = max(0, min(top, image_height - 1))
    right = max(left + 1, min(right, image_width))
    bottom = max(top + 1, min(bottom, image_height))
    return left, top, right, bottom


def _normalize_refined_bbox(
    bbox_points: list[list[float]],
    image_width: int,
    image_height: int,
    crop_box: tuple[int, int, int, int],
    refine_scale: float,
) -> BoundingBox:
    safe_scale = max(refine_scale, 1.0)
    scaled_points = [
        [point[0] / safe_scale, point[1] / safe_scale]
        for point in bbox_points
    ]
    return _normalize_bbox(
        scaled_points,
        image_width,
        image_height,
        crop_box,
    )


def _normalize_bbox(
    bbox_points: list[list[float]],
    image_width: int,
    image_height: int,
    crop_box: tuple[int, int, int, int],
) -> BoundingBox:
    crop_left, crop_top, crop_right, crop_bottom = crop_box
    crop_width = crop_right - crop_left
    crop_height = crop_bottom - crop_top
    x_values = [point[0] for point in bbox_points]
    y_values = [point[1] for point in bbox_points]
    x_min = max(min(x_values), 0)
    y_min = max(min(y_values), 0)
    x_max = min(max(x_values), crop_width)
    y_max = min(max(y_values), crop_height)

    x_min += crop_left
    y_min += crop_top
    x_max += crop_left
    y_max += crop_top

    x_min = max(min(x_min, image_width), 0)
    y_min = max(min(y_min, image_height), 0)
    x_max = max(min(x_max, image_width), 0)
    y_max = max(min(y_max, image_height), 0)

    return BoundingBox(
        x=round(x_min / image_width, 6),
        y=round(y_min / image_height, 6),
        w=round((x_max - x_min) / image_width, 6),
        h=round((y_max - y_min) / image_height, 6),
    )


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}
