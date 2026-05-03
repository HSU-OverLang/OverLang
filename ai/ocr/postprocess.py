from __future__ import annotations

from typing import Any

from ai.api.schemas import BoundingBox, OcrItem


def build_ocr_items(
    raw_items: list[dict[str, Any]],
    frame_interval_seconds: float,
    text_similarity_threshold: float = 0.9,
    bbox_tolerance: float = 0.04,
) -> list[OcrItem]:
    tracks: list[dict[str, Any]] = []

    for raw_item in sorted(raw_items, key=lambda item: item["timestamp"]):
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
