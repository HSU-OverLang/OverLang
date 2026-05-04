from __future__ import annotations

from typing import Any

from ai.api.schemas import BoundingBox, OcrItem


def build_ocr_items(
    raw_items: list[dict[str, Any]],
    frame_interval_seconds: float,
    text_similarity_threshold: float = 0.9,
    bbox_tolerance: float = 0.04,
    min_confidence: float = 0.3,
    min_text_length: int = 2,
    max_special_char_ratio: float = 0.6,
    edge_margin: float = 0.0,
) -> list[OcrItem]:
    tracks: list[dict[str, Any]] = []

    for raw_item in sorted(raw_items, key=lambda item: item["timestamp"]):
        if not _is_valid_raw_item(
            raw_item,
            min_confidence,
            min_text_length,
            max_special_char_ratio,
            edge_margin,
        ):
            continue

        matched_track = _find_matching_track(
            tracks,
            raw_item,
            text_similarity_threshold,
            bbox_tolerance,
        )
        if matched_track is None:
            tracks.append(_create_track(raw_item, frame_interval_seconds))
            continue

        _extend_track(matched_track, raw_item, frame_interval_seconds)

    return [_track_to_ocr_item(track) for track in tracks]


def _create_track(
    raw_item: dict[str, Any],
    frame_interval_seconds: float,
) -> dict[str, Any]:
    return {
        "startTime": float(raw_item["timestamp"]),
        "endTime": round(float(raw_item["timestamp"]) + frame_interval_seconds, 3),
        "originText": raw_item["originText"],
        "boundingBox": raw_item["boundingBox"],
        "confidenceValues": [raw_item.get("confidence")],
        "lastTimestamp": float(raw_item["timestamp"]),
        "carriedFrameCount": 1 if raw_item.get("carriedForward") else 0,
    }


def _extend_track(
    track: dict[str, Any],
    raw_item: dict[str, Any],
    frame_interval_seconds: float,
) -> None:
    track["endTime"] = round(float(raw_item["timestamp"]) + frame_interval_seconds, 3)
    track["lastTimestamp"] = float(raw_item["timestamp"])
    track["confidenceValues"].append(raw_item.get("confidence"))
    track["boundingBox"] = _average_bbox(track["boundingBox"], raw_item["boundingBox"])
    if raw_item.get("carriedForward"):
        track["carriedFrameCount"] += 1


def _is_valid_raw_item(
    raw_item: dict[str, Any],
    min_confidence: float,
    min_text_length: int,
    max_special_char_ratio: float,
    edge_margin: float,
) -> bool:
    text = str(raw_item.get("originText", "")).strip()
    if len(text.replace(" ", "")) < min_text_length:
        return False

    confidence = raw_item.get("confidence")
    if confidence is not None and float(confidence) < min_confidence:
        return False

    if _special_char_ratio(text) > max_special_char_ratio:
        return False

    if _is_edge_noise(raw_item["boundingBox"], edge_margin):
        return False

    return True


def _special_char_ratio(text: str) -> float:
    visible_chars = [char for char in text if not char.isspace()]
    if not visible_chars:
        return 1.0

    special_chars = [char for char in visible_chars if not char.isalnum()]
    return len(special_chars) / len(visible_chars)


def _is_edge_noise(
    bounding_box: BoundingBox,
    edge_margin: float,
) -> bool:
    if edge_margin <= 0:
        return False

    area = bounding_box.w * bounding_box.h
    touches_edge = (
        bounding_box.x <= edge_margin
        or bounding_box.y <= edge_margin
        or bounding_box.x + bounding_box.w >= 1 - edge_margin
        or bounding_box.y + bounding_box.h >= 1 - edge_margin
    )

    return touches_edge and area <= 0.01


def _track_to_ocr_item(track: dict[str, Any]) -> OcrItem:
    confidence_values = [
        float(confidence)
        for confidence in track["confidenceValues"]
        if confidence is not None
    ]
    confidence = None
    if confidence_values:
        confidence = round(sum(confidence_values) / len(confidence_values), 4)

    return OcrItem(
        start_time=round(float(track["startTime"]), 3),
        end_time=round(float(track["endTime"]), 3),
        origin_text=track["originText"],
        translated_text=None,
        bounding_box=track["boundingBox"],
        confidence=confidence,
    )


def _find_matching_track(
    tracks: list[dict[str, Any]],
    raw_item: dict[str, Any],
    text_similarity_threshold: float,
    bbox_tolerance: float,
) -> dict[str, Any] | None:
    for track in reversed(tracks):
        if not _is_same_text(
            track["originText"],
            raw_item["originText"],
            text_similarity_threshold,
        ):
            continue

        if not _is_similar_bbox(
            track["boundingBox"],
            raw_item["boundingBox"],
            bbox_tolerance,
        ):
            continue

        return track

    return None


def _is_same_text(
    left: str,
    right: str,
    threshold: float,
) -> bool:
    normalized_left = _normalize_text(left)
    normalized_right = _normalize_text(right)
    if not normalized_left or not normalized_right:
        return False

    if normalized_left == normalized_right:
        return True

    return _similarity(normalized_left, normalized_right) >= threshold


def _normalize_text(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _similarity(left: str, right: str) -> float:
    try:
        from difflib import SequenceMatcher

        return SequenceMatcher(None, left, right).ratio()
    except Exception:
        return 0.0


def _is_similar_bbox(
    left: BoundingBox,
    right: BoundingBox,
    tolerance: float,
) -> bool:
    return (
        abs(left.x - right.x) <= tolerance
        and abs(left.y - right.y) <= tolerance
        and abs(left.w - right.w) <= tolerance
        and abs(left.h - right.h) <= tolerance
    )


def _average_bbox(
    left: BoundingBox,
    right: BoundingBox,
) -> BoundingBox:
    return BoundingBox(
        x=round((left.x + right.x) / 2, 6),
        y=round((left.y + right.y) / 2, 6),
        w=round((left.w + right.w) / 2, 6),
        h=round((left.h + right.h) / 2, 6),
    )
