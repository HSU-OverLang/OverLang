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
    active_tracks: list[dict[str, Any]] = []
    finalized_tracks: list[dict[str, Any]] = []
    max_tracking_gap_seconds = max(frame_interval_seconds * 1.5, frame_interval_seconds)

    for timestamp, frame_items in _group_raw_items_by_timestamp(raw_items):
        valid_items = [
            raw_item
            for raw_item in frame_items
            if _is_valid_raw_item(
                raw_item,
                min_confidence,
                min_text_length,
                max_special_char_ratio,
                edge_margin,
            )
        ]

        active_tracks, expired_tracks = _split_expired_tracks(
            active_tracks,
            timestamp,
            max_tracking_gap_seconds,
        )
        finalized_tracks.extend(expired_tracks)

        matched_track_ids: set[int] = set()
        for raw_item in valid_items:
            matched_track = _find_best_matching_active_track(
                active_tracks,
                raw_item,
                matched_track_ids,
                text_similarity_threshold,
                bbox_tolerance,
            )
            if matched_track is None:
                active_tracks.append(_create_track(raw_item, frame_interval_seconds))
                continue

            _extend_track(matched_track, raw_item, frame_interval_seconds)
            matched_track_ids.add(id(matched_track))

        if valid_items:
            remaining_active_tracks = []
            for track in active_tracks:
                if id(track) in matched_track_ids or track["lastTimestamp"] == timestamp:
                    remaining_active_tracks.append(track)
                    continue

                finalized_tracks.append(track)
            active_tracks = remaining_active_tracks

    finalized_tracks.extend(active_tracks)
    finalized_tracks.sort(key=lambda track: (track["startTime"], track["endTime"]))
    return [_track_to_ocr_item(track) for track in finalized_tracks]


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


def _group_raw_items_by_timestamp(
    raw_items: list[dict[str, Any]],
) -> list[tuple[float, list[dict[str, Any]]]]:
    grouped_items: dict[float, list[dict[str, Any]]] = {}
    for raw_item in raw_items:
        timestamp = round(float(raw_item["timestamp"]), 3)
        grouped_items.setdefault(timestamp, []).append(raw_item)

    return sorted(grouped_items.items(), key=lambda item: item[0])


def _split_expired_tracks(
    tracks: list[dict[str, Any]],
    timestamp: float,
    max_tracking_gap_seconds: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    active_tracks = []
    expired_tracks = []
    for track in tracks:
        if timestamp - float(track["lastTimestamp"]) > max_tracking_gap_seconds:
            expired_tracks.append(track)
            continue

        active_tracks.append(track)

    return active_tracks, expired_tracks


def _find_best_matching_active_track(
    tracks: list[dict[str, Any]],
    raw_item: dict[str, Any],
    matched_track_ids: set[int],
    text_similarity_threshold: float,
    bbox_tolerance: float,
) -> dict[str, Any] | None:
    candidates = []
    for track in reversed(tracks):
        if id(track) in matched_track_ids:
            continue

        text_similarity = _text_similarity(
            track["originText"],
            raw_item["originText"],
        )
        if text_similarity < text_similarity_threshold:
            continue

        bbox_overlap = _bbox_iou(track["boundingBox"], raw_item["boundingBox"])
        if bbox_overlap <= 0 and not _is_similar_bbox(
            track["boundingBox"],
            raw_item["boundingBox"],
            bbox_tolerance,
        ):
            continue

        candidates.append((text_similarity + bbox_overlap, track))

    if not candidates:
        return None

    return max(candidates, key=lambda candidate: candidate[0])[1]


def _is_same_text(
    left: str,
    right: str,
    threshold: float,
) -> bool:
    return _text_similarity(left, right) >= threshold


def _text_similarity(
    left: str,
    right: str,
) -> float:
    normalized_left = _normalize_text(left)
    normalized_right = _normalize_text(right)
    if not normalized_left or not normalized_right:
        return 0.0

    if normalized_left == normalized_right:
        return 1.0

    return _similarity(normalized_left, normalized_right)


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


def _bbox_iou(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    left_x2 = left.x + left.w
    left_y2 = left.y + left.h
    right_x2 = right.x + right.w
    right_y2 = right.y + right.h

    intersection_w = max(0.0, min(left_x2, right_x2) - max(left.x, right.x))
    intersection_h = max(0.0, min(left_y2, right_y2) - max(left.y, right.y))
    intersection_area = intersection_w * intersection_h
    if intersection_area <= 0:
        return 0.0

    left_area = left.w * left.h
    right_area = right.w * right.h
    union_area = left_area + right_area - intersection_area
    if union_area <= 0:
        return 0.0

    return intersection_area / union_area


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
