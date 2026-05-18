from __future__ import annotations

import statistics
from typing import Any

from ai.api.schemas import BoundingBox, OcrItem
from ai.ocr.overlay_style import build_ocr_style

LINE_VERTICAL_OVERLAP_THRESHOLD = 0.45
LINE_CENTER_DISTANCE_RATIO = 0.75
LINE_HORIZONTAL_GAP_RATIO = 3.0
LINE_HORIZONTAL_GAP_MIN = 0.06
BLOCK_HORIZONTAL_OVERLAP_THRESHOLD = 0.35
BLOCK_VERTICAL_GAP_RATIO = 1.6
BLOCK_VERTICAL_GAP_MIN = 0.035
TRACK_COVERAGE_PADDING_RATIO = 0.012
TRACK_MULTILINE_COVERAGE_PADDING_RATIO = 0.018
TRACK_START_DELAY_SECONDS = 0.15
TRACK_END_TRIM_SECONDS = 0.05
MIN_OCR_ITEM_DURATION_SECONDS = 0.25
DUPLICATE_TEXT_SIMILARITY_THRESHOLD = 0.85
DUPLICATE_BBOX_IOU_THRESHOLD = 0.45
DUPLICATE_CENTER_DISTANCE_RATIO = 1.0
DUPLICATE_CONTAINMENT_RATIO = 0.8
DUPLICATE_COVERAGE_RATIO = 0.9
DUPLICATE_NORMALIZED_TEXT_THRESHOLD = 0.95
TRACK_TEXT_STABILITY_THRESHOLD = 0.82
TRACK_CENTER_DISTANCE_RATIO = 2.5
TRACK_CENTER_DISTANCE_MIN = 0.08
PROGRESSIVE_TEXT_MIN_LENGTH = 2
PROGRESSIVE_TEXT_MIN_LENGTH_RATIO = 0.35
PROGRESSIVE_TEXT_SCORE = 0.88


def build_ocr_items(
    raw_items: list[dict[str, Any]],
    frame_interval_seconds: float,
    frame_timestamps: list[float] | None = None,
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

    for timestamp, frame_items in _group_raw_items_by_timestamp(
        raw_items,
        frame_timestamps,
    ):
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
        valid_items = _deduplicate_overlapping_frame_items(valid_items)
        valid_items = _merge_adjacent_frame_items(valid_items)

        if not valid_items:
            active_tracks, disappeared_tracks = _mark_missing_tracks(
                active_tracks,
                missing_timestamp=timestamp,
            )
            finalized_tracks.extend(disappeared_tracks)
            continue

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

        active_tracks, disappeared_tracks = _mark_unmatched_tracks(
            active_tracks,
            matched_track_ids,
            timestamp,
        )
        finalized_tracks.extend(disappeared_tracks)

    finalized_tracks.extend(active_tracks)
    finalized_tracks = [
        track for track in finalized_tracks if _should_keep_track(track)
    ]
    finalized_tracks.sort(key=lambda track: (track["startTime"], track["endTime"]))
    return _deduplicate_ocr_items(
        [_track_to_ocr_item(track) for track in finalized_tracks]
    )


def _create_track(
    raw_item: dict[str, Any],
    frame_interval_seconds: float,
) -> dict[str, Any]:
    return {
        "startTime": float(raw_item["timestamp"]),
        "endTime": round(float(raw_item["timestamp"]) + frame_interval_seconds, 3),
        "originText": raw_item["originText"],
        "textCandidates": [_build_text_candidate(raw_item)],
        "boundingBox": raw_item["boundingBox"],
        "boundingBoxValues": [raw_item["boundingBox"]],
        "confidenceValues": [raw_item.get("confidence")],
        "mergedItemCountValues": [int(raw_item.get("mergedItemCount", 1))],
        "frameIntervalSeconds": frame_interval_seconds,
        "lastTimestamp": float(raw_item["timestamp"]),
        "missingFrameCount": 0,
        "styleFramePath": raw_item.get("framePath"),
        "carriedFrameCount": 1 if raw_item.get("carriedForward") else 0,
    }


def _extend_track(
    track: dict[str, Any],
    raw_item: dict[str, Any],
    frame_interval_seconds: float,
) -> None:
    track["endTime"] = round(float(raw_item["timestamp"]) + frame_interval_seconds, 3)
    track["lastTimestamp"] = float(raw_item["timestamp"])
    track["missingFrameCount"] = 0
    track["confidenceValues"].append(raw_item.get("confidence"))
    track["textCandidates"].append(_build_text_candidate(raw_item))
    track["mergedItemCountValues"].append(int(raw_item.get("mergedItemCount", 1)))
    if not raw_item.get("carriedForward"):
        track["boundingBoxValues"].append(raw_item["boundingBox"])
    track["boundingBox"] = _median_bbox(track["boundingBoxValues"])
    if not raw_item.get("carriedForward") and raw_item.get("framePath"):
        track["styleFramePath"] = raw_item.get("framePath")
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

    coverage_box = _track_coverage_bbox(track)
    return OcrItem(
        start_time=_resolve_track_start_time(track),
        end_time=_resolve_track_end_time(track),
        origin_text=_resolve_track_text(track),
        translated_text=None,
        bounding_box=coverage_box,
        confidence=confidence,
        style=build_ocr_style(
            track.get("styleFramePath"),
            coverage_box,
        ),
    )


def _should_keep_track(track: dict[str, Any]) -> bool:
    duration = float(track["endTime"]) - float(track["startTime"])
    real_detection_count = len(track.get("boundingBoxValues", []))
    max_confidence = max(
        (
            float(confidence)
            for confidence in track.get("confidenceValues", [])
            if confidence is not None
        ),
        default=0.0,
    )
    return (
        duration >= MIN_OCR_ITEM_DURATION_SECONDS
        or real_detection_count >= 2
        or max_confidence >= 0.75
    )


def _resolve_track_start_time(track: dict[str, Any]) -> float:
    start_time = float(track["startTime"])
    end_time = float(track["endTime"])
    if _has_progressive_text_candidates(track):
        representative_timestamp = _resolve_track_text_group(track).get(
            "firstTimestamp",
        )
        if representative_timestamp is not None:
            start_time = max(start_time, float(representative_timestamp))

    duration = max(0.0, end_time - start_time)
    start_delay = min(TRACK_START_DELAY_SECONDS, duration * 0.25)
    delayed_start_time = start_time + start_delay
    if delayed_start_time >= end_time:
        return round(start_time, 3)

    return round(delayed_start_time, 3)


def _resolve_track_end_time(track: dict[str, Any]) -> float:
    start_time = _resolve_track_start_time(track)
    end_time = float(track["endTime"])
    frame_interval_seconds = float(track.get("frameIntervalSeconds") or 0.0)
    end_trim_seconds = min(TRACK_END_TRIM_SECONDS, frame_interval_seconds * 0.25)
    trimmed_end_time = end_time - end_trim_seconds
    if trimmed_end_time <= start_time:
        return round(end_time, 3)

    return round(trimmed_end_time, 3)


def _track_coverage_bbox(track: dict[str, Any]) -> BoundingBox:
    merged_item_count = max(track.get("mergedItemCountValues", [1]), default=1)
    resolved_text = _resolve_track_text(track)
    padding_ratio = TRACK_COVERAGE_PADDING_RATIO
    if "\n" in resolved_text or merged_item_count > 1:
        padding_ratio = TRACK_MULTILINE_COVERAGE_PADDING_RATIO

    return _coverage_bbox(track["boundingBoxValues"], padding_ratio=padding_ratio)


def _merge_adjacent_frame_items(
    raw_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(raw_items) <= 1:
        return raw_items

    line_items = _merge_items_into_lines(raw_items)
    return _merge_lines_into_blocks(line_items)


def _deduplicate_overlapping_frame_items(
    raw_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(raw_items) <= 1:
        return raw_items

    sorted_items = sorted(
        raw_items,
        key=lambda item: (
            float(item.get("confidence") or 0.0),
            item["boundingBox"].w * item["boundingBox"].h,
        ),
        reverse=True,
    )
    deduplicated_items: list[dict[str, Any]] = []
    for raw_item in sorted_items:
        if any(
            _is_duplicate_frame_item(raw_item, kept_item)
            for kept_item in deduplicated_items
        ):
            continue

        deduplicated_items.append(raw_item)

    return sorted(
        deduplicated_items,
        key=lambda item: (
            item["boundingBox"].y,
            item["boundingBox"].x,
        ),
    )


def _is_duplicate_frame_item(
    left_item: dict[str, Any],
    right_item: dict[str, Any],
) -> bool:
    text_similarity = _text_similarity(
        left_item["originText"],
        right_item["originText"],
    )
    is_progressive_text = _is_progressive_text_pair(
        left_item["originText"],
        right_item["originText"],
    )
    if (
        text_similarity < DUPLICATE_TEXT_SIMILARITY_THRESHOLD
        and not is_progressive_text
    ):
        return False

    left_box = left_item["boundingBox"]
    right_box = right_item["boundingBox"]
    if _bbox_iou(left_box, right_box) >= DUPLICATE_BBOX_IOU_THRESHOLD:
        return True

    if _bbox_containment_ratio(left_box, right_box) >= DUPLICATE_CONTAINMENT_RATIO:
        return True

    if _bbox_coverage_ratio(left_box, right_box) >= DUPLICATE_COVERAGE_RATIO:
        return True

    return _is_near_bbox_center(left_box, right_box)


def _build_text_candidate(raw_item: dict[str, Any]) -> dict[str, Any]:
    return {
        "text": str(raw_item.get("originText", "")).strip(),
        "confidence": float(raw_item.get("confidence") or 0.0),
        "timestamp": float(raw_item.get("timestamp", 0.0)),
    }


def _resolve_track_text(track: dict[str, Any]) -> str:
    return str(_resolve_track_text_group(track).get("text", "")).strip()


def _resolve_track_text_group(track: dict[str, Any]) -> dict[str, Any]:
    candidates = [
        candidate
        for candidate in track.get("textCandidates", [])
        if str(candidate.get("text", "")).strip()
    ]
    if not candidates:
        return {
            "text": str(track.get("originText", "")).strip(),
            "count": 0,
            "confidence": 0.0,
            "firstTimestamp": float(track.get("startTime", 0.0)),
            "lastTimestamp": float(track.get("startTime", 0.0)),
        }

    grouped_candidates: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        text = str(candidate["text"]).strip()
        normalized_text = _normalize_text(text)
        if not normalized_text:
            continue

        timestamp = float(candidate.get("timestamp") or 0.0)
        group = grouped_candidates.setdefault(
            normalized_text,
            {
                "text": text,
                "count": 0,
                "confidence": 0.0,
                "firstTimestamp": timestamp,
                "lastTimestamp": timestamp,
            },
        )
        group["count"] += 1
        group["confidence"] += float(candidate.get("confidence") or 0.0)
        group["firstTimestamp"] = min(float(group["firstTimestamp"]), timestamp)
        group["lastTimestamp"] = max(float(group["lastTimestamp"]), timestamp)
        if len(text) > len(str(group["text"])):
            group["text"] = text

    if not grouped_candidates:
        return {
            "text": str(track.get("originText", "")).strip(),
            "count": 0,
            "confidence": 0.0,
            "firstTimestamp": float(track.get("startTime", 0.0)),
            "lastTimestamp": float(track.get("startTime", 0.0)),
        }

    groups = list(grouped_candidates.values())
    if _has_progressive_text_candidates(track):
        return max(
            groups,
            key=lambda group: (
                len(_compact_text(str(group["text"]))),
                int(group["count"]),
                float(group["confidence"]),
                float(group["lastTimestamp"]),
            ),
        )

    return max(
        groups,
        key=lambda group: (
            int(group["count"]),
            float(group["confidence"]),
            float(group["lastTimestamp"]),
            len(str(group["text"])),
        ),
    )


def _has_progressive_text_candidates(track: dict[str, Any]) -> bool:
    candidates = [
        str(candidate.get("text", "")).strip()
        for candidate in track.get("textCandidates", [])
        if str(candidate.get("text", "")).strip()
    ]
    for left_index, left_text in enumerate(candidates):
        for right_text in candidates[left_index + 1 :]:
            if _is_progressive_text_pair(left_text, right_text):
                return True

    return False


def _is_progressive_text_pair(left: str, right: str) -> bool:
    left_compact = _compact_text(left)
    right_compact = _compact_text(right)
    if not left_compact or not right_compact:
        return False

    shorter_length = min(len(left_compact), len(right_compact))
    longer_length = max(len(left_compact), len(right_compact))
    if shorter_length < PROGRESSIVE_TEXT_MIN_LENGTH:
        return False

    if shorter_length / longer_length < PROGRESSIVE_TEXT_MIN_LENGTH_RATIO:
        return False

    return left_compact in right_compact or right_compact in left_compact


def _compact_text(text: str) -> str:
    return "".join(_normalize_text(text).split())


def _merge_items_into_lines(
    raw_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sorted_items = sorted(
        raw_items,
        key=lambda item: (
            _bbox_center_y(item["boundingBox"]),
            item["boundingBox"].x,
        ),
    )
    lines: list[list[dict[str, Any]]] = []

    for item in sorted_items:
        target_line = _find_matching_line(lines, item)
        if target_line is None:
            lines.append([item])
            continue

        target_line.append(item)

    merged_lines = [
        _merge_raw_items(sorted(line, key=lambda item: item["boundingBox"].x))
        for line in lines
    ]
    return sorted(
        merged_lines,
        key=lambda item: (
            item["boundingBox"].y,
            item["boundingBox"].x,
        ),
    )


def _find_matching_line(
    lines: list[list[dict[str, Any]]],
    item: dict[str, Any],
) -> list[dict[str, Any]] | None:
    item_box = item["boundingBox"]
    candidates = []
    for line in lines:
        line_box = _union_bbox([line_item["boundingBox"] for line_item in line])
        if not _is_same_text_line(line_box, item_box):
            continue

        if not _is_horizontally_adjacent(line_box, item_box):
            continue

        candidates.append((abs(_bbox_center_y(line_box) - _bbox_center_y(item_box)), line))

    if not candidates:
        return None

    return min(candidates, key=lambda candidate: candidate[0])[1]


def _is_same_text_line(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    overlap = _vertical_overlap_ratio(left, right)
    center_distance = abs(_bbox_center_y(left) - _bbox_center_y(right))
    max_height = max(left.h, right.h)
    return (
        overlap >= LINE_VERTICAL_OVERLAP_THRESHOLD
        or center_distance <= max_height * LINE_CENTER_DISTANCE_RATIO
    )


def _is_horizontally_adjacent(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    gap = max(
        0.0,
        max(left.x, right.x) - min(left.x + left.w, right.x + right.w),
    )
    max_gap = max(
        LINE_HORIZONTAL_GAP_MIN,
        max(left.h, right.h) * LINE_HORIZONTAL_GAP_RATIO,
    )
    return gap <= max_gap


def _merge_lines_into_blocks(
    line_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if len(line_items) <= 1:
        return line_items

    blocks: list[list[dict[str, Any]]] = []
    for line_item in sorted(
        line_items,
        key=lambda item: (
            item["boundingBox"].y,
            item["boundingBox"].x,
        ),
    ):
        target_block = _find_matching_block(blocks, line_item)
        if target_block is None:
            blocks.append([line_item])
            continue

        target_block.append(line_item)

    return [
        _merge_raw_items(
            sorted(
                block,
                key=lambda item: (
                    item["boundingBox"].y,
                    item["boundingBox"].x,
                ),
            ),
            separator="\n",
        )
        for block in blocks
    ]


def _find_matching_block(
    blocks: list[list[dict[str, Any]]],
    line_item: dict[str, Any],
) -> list[dict[str, Any]] | None:
    line_box = line_item["boundingBox"]
    candidates = []
    for block in blocks:
        block_box = _union_bbox([item["boundingBox"] for item in block])
        if _horizontal_overlap_ratio(block_box, line_box) < BLOCK_HORIZONTAL_OVERLAP_THRESHOLD:
            continue

        gap = max(0.0, line_box.y - (block_box.y + block_box.h))
        max_gap = max(
            BLOCK_VERTICAL_GAP_MIN,
            max(block_box.h / max(len(block), 1), line_box.h) * BLOCK_VERTICAL_GAP_RATIO,
        )
        if gap > max_gap:
            continue

        candidates.append((gap, block))

    if not candidates:
        return None

    return min(candidates, key=lambda candidate: candidate[0])[1]


def _merge_raw_items(
    raw_items: list[dict[str, Any]],
    separator: str = " ",
) -> dict[str, Any]:
    merged_item = dict(raw_items[0])
    merge_items = _deduplicate_merge_items(raw_items)
    merged_item["originText"] = separator.join(
        str(item["originText"]).strip()
        for item in merge_items
        if str(item.get("originText", "")).strip()
    )
    merged_item["boundingBox"] = _union_bbox(
        [item["boundingBox"] for item in merge_items]
    )
    confidences = [
        float(item["confidence"])
        for item in merge_items
        if item.get("confidence") is not None
    ]
    merged_item["confidence"] = (
        round(sum(confidences) / len(confidences), 4) if confidences else None
    )
    merged_item["mergedItemCount"] = sum(
        int(item.get("mergedItemCount", 1)) for item in merge_items
    )
    return merged_item


def _deduplicate_merge_items(
    raw_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    deduplicated_items: list[dict[str, Any]] = []
    for raw_item in raw_items:
        if any(
            _is_duplicate_merge_item(raw_item, kept_item)
            for kept_item in deduplicated_items
        ):
            continue

        deduplicated_items.append(raw_item)

    return deduplicated_items


def _is_duplicate_merge_item(
    left_item: dict[str, Any],
    right_item: dict[str, Any],
) -> bool:
    left_text = _normalize_text(left_item.get("originText", ""))
    right_text = _normalize_text(right_item.get("originText", ""))
    if not left_text or not right_text:
        return False

    text_similarity = 1.0 if left_text == right_text else _similarity(left_text, right_text)
    is_progressive_text = _is_progressive_text_pair(left_text, right_text)
    if text_similarity < DUPLICATE_NORMALIZED_TEXT_THRESHOLD and not is_progressive_text:
        return False

    left_box = left_item["boundingBox"]
    right_box = right_item["boundingBox"]
    return (
        _bbox_iou(left_box, right_box) >= DUPLICATE_BBOX_IOU_THRESHOLD
        or _bbox_containment_ratio(left_box, right_box) >= DUPLICATE_CONTAINMENT_RATIO
        or _bbox_coverage_ratio(left_box, right_box) >= DUPLICATE_COVERAGE_RATIO
        or _is_near_bbox_center(left_box, right_box)
    )


def _deduplicate_ocr_items(
    ocr_items: list[OcrItem],
) -> list[OcrItem]:
    if len(ocr_items) <= 1:
        return ocr_items

    sorted_items = sorted(
        ocr_items,
        key=lambda item: (
            float(item.confidence or 0.0),
            item.end_time - item.start_time,
        ),
        reverse=True,
    )
    deduplicated_items: list[OcrItem] = []
    for ocr_item in sorted_items:
        if any(
            _is_duplicate_ocr_item(ocr_item, kept_item)
            for kept_item in deduplicated_items
        ):
            continue

        deduplicated_items.append(ocr_item)

    return sorted(
        deduplicated_items,
        key=lambda item: (item.start_time, item.end_time, item.bounding_box.y),
    )


def _is_duplicate_ocr_item(
    left_item: OcrItem,
    right_item: OcrItem,
) -> bool:
    text_similarity = _text_similarity(left_item.origin_text, right_item.origin_text)
    is_progressive_text = _is_progressive_text_pair(
        left_item.origin_text,
        right_item.origin_text,
    )
    if text_similarity < 0.9 and not is_progressive_text:
        return False

    if _time_overlap_ratio(left_item, right_item) < 0.5:
        return False

    left_box = left_item.bounding_box
    right_box = right_item.bounding_box
    return (
        _bbox_iou(left_box, right_box) >= DUPLICATE_BBOX_IOU_THRESHOLD
        or _bbox_containment_ratio(left_box, right_box) >= DUPLICATE_CONTAINMENT_RATIO
        or _bbox_coverage_ratio(left_box, right_box) >= DUPLICATE_COVERAGE_RATIO
        or _is_near_bbox_center(left_box, right_box)
    )


def _group_raw_items_by_timestamp(
    raw_items: list[dict[str, Any]],
    frame_timestamps: list[float] | None = None,
) -> list[tuple[float, list[dict[str, Any]]]]:
    grouped_items: dict[float, list[dict[str, Any]]] = {}
    for frame_timestamp in frame_timestamps or []:
        grouped_items.setdefault(round(float(frame_timestamp), 3), [])

    for raw_item in raw_items:
        timestamp = round(float(raw_item["timestamp"]), 3)
        grouped_items.setdefault(timestamp, []).append(raw_item)

    return sorted(grouped_items.items(), key=lambda item: item[0])


def _mark_missing_tracks(
    tracks: list[dict[str, Any]],
    missing_timestamp: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    active_tracks = []
    disappeared_tracks = []
    for track in tracks:
        finalized_track = dict(track)
        finalized_track["endTime"] = round(float(missing_timestamp), 3)
        if finalized_track["endTime"] <= finalized_track["startTime"]:
            finalized_track["endTime"] = track["endTime"]

        disappeared_tracks.append(finalized_track)

    return active_tracks, disappeared_tracks


def _mark_unmatched_tracks(
    tracks: list[dict[str, Any]],
    matched_track_ids: set[int],
    timestamp: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    active_tracks = []
    disappeared_tracks = []
    for track in tracks:
        if id(track) in matched_track_ids or track["lastTimestamp"] == timestamp:
            active_tracks.append(track)
            continue

        finalized_track = dict(track)
        finalized_track["endTime"] = round(float(timestamp), 3)
        if finalized_track["endTime"] <= finalized_track["startTime"]:
            finalized_track["endTime"] = track["endTime"]

        disappeared_tracks.append(finalized_track)

    return active_tracks, disappeared_tracks


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

        track_text = _resolve_track_text(track) or str(track.get("originText", ""))
        raw_text = str(raw_item.get("originText", ""))
        text_similarity = _text_similarity(
            track_text,
            raw_text,
        )
        is_progressive_text = _is_progressive_track_match(track, raw_text)
        if (
            text_similarity < min(text_similarity_threshold, TRACK_TEXT_STABILITY_THRESHOLD)
            and not is_progressive_text
        ):
            continue

        bbox_overlap = _bbox_iou(track["boundingBox"], raw_item["boundingBox"])
        is_stable_scaling = _is_stable_scaling_match(
            track["boundingBox"],
            raw_item["boundingBox"],
        )
        if bbox_overlap <= 0 and not _is_similar_bbox(
            track["boundingBox"],
            raw_item["boundingBox"],
            bbox_tolerance,
        ) and not is_stable_scaling:
            continue

        text_score = max(
            text_similarity,
            PROGRESSIVE_TEXT_SCORE if is_progressive_text else 0.0,
        )
        scaling_score = 0.1 if is_stable_scaling else 0.0
        candidates.append((text_score + bbox_overlap + scaling_score, track))

    if not candidates:
        return None

    return max(candidates, key=lambda candidate: candidate[0])[1]


def _is_progressive_track_match(track: dict[str, Any], raw_text: str) -> bool:
    track_text = _resolve_track_text(track) or str(track.get("originText", ""))
    if _is_progressive_text_pair(track_text, raw_text):
        return True

    return any(
        _is_progressive_text_pair(str(candidate.get("text", "")), raw_text)
        for candidate in track.get("textCandidates", [])
    )


def _is_stable_scaling_match(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    center_x_distance = abs(_bbox_center_x(left) - _bbox_center_x(right))
    center_y_distance = abs(_bbox_center_y(left) - _bbox_center_y(right))
    max_height = max(left.h, right.h)
    max_width = max(left.w, right.w)
    max_center_x_distance = max(
        TRACK_CENTER_DISTANCE_MIN,
        max_width * TRACK_CENTER_DISTANCE_RATIO,
    )
    max_center_y_distance = max(
        TRACK_CENTER_DISTANCE_MIN,
        max_height * TRACK_CENTER_DISTANCE_RATIO,
    )
    if (
        center_x_distance > max_center_x_distance
        or center_y_distance > max_center_y_distance
    ):
        return False

    return (
        _bbox_containment_ratio(left, right) >= 0.35
        or _bbox_coverage_ratio(left, right) >= 0.35
        or _horizontal_overlap_ratio(left, right) >= 0.35
        or _vertical_overlap_ratio(left, right) >= 0.35
    )


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


def _time_overlap_ratio(
    left: OcrItem,
    right: OcrItem,
) -> float:
    overlap = max(
        0.0,
        min(left.end_time, right.end_time) - max(left.start_time, right.start_time),
    )
    shorter_duration = min(
        left.end_time - left.start_time,
        right.end_time - right.start_time,
    )
    if shorter_duration <= 0:
        return 0.0

    return overlap / shorter_duration


def _bbox_intersection_area(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    intersection_w = max(
        0.0,
        min(left.x + left.w, right.x + right.w) - max(left.x, right.x),
    )
    intersection_h = max(
        0.0,
        min(left.y + left.h, right.y + right.h) - max(left.y, right.y),
    )
    return intersection_w * intersection_h


def _bbox_containment_ratio(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    left_area = left.w * left.h
    right_area = right.w * right.h
    smaller_area = min(left_area, right_area)
    if smaller_area <= 0:
        return 0.0

    return _bbox_intersection_area(left, right) / smaller_area


def _bbox_coverage_ratio(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    left_area = left.w * left.h
    right_area = right.w * right.h
    larger_area = max(left_area, right_area)
    if larger_area <= 0:
        return 0.0

    return _bbox_intersection_area(left, right) / larger_area


def _bbox_center_y(bounding_box: BoundingBox) -> float:
    return bounding_box.y + (bounding_box.h / 2)


def _bbox_center_x(bounding_box: BoundingBox) -> float:
    return bounding_box.x + (bounding_box.w / 2)


def _is_near_bbox_center(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    center_x_distance = abs(_bbox_center_x(left) - _bbox_center_x(right))
    center_y_distance = abs(_bbox_center_y(left) - _bbox_center_y(right))
    max_width = max(left.w, right.w)
    max_height = max(left.h, right.h)
    return (
        center_x_distance <= max_width * DUPLICATE_CENTER_DISTANCE_RATIO
        and center_y_distance <= max_height * DUPLICATE_CENTER_DISTANCE_RATIO
    )


def _vertical_overlap_ratio(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    overlap = max(
        0.0,
        min(left.y + left.h, right.y + right.h) - max(left.y, right.y),
    )
    min_height = min(left.h, right.h)
    if min_height <= 0:
        return 0.0

    return overlap / min_height


def _horizontal_overlap_ratio(
    left: BoundingBox,
    right: BoundingBox,
) -> float:
    overlap = max(
        0.0,
        min(left.x + left.w, right.x + right.w) - max(left.x, right.x),
    )
    min_width = min(left.w, right.w)
    if min_width <= 0:
        return 0.0

    return overlap / min_width


def _union_bbox(
    boxes: list[BoundingBox],
) -> BoundingBox:
    if not boxes:
        return BoundingBox(x=0.0, y=0.0, w=0.0, h=0.0)

    x_min = min(box.x for box in boxes)
    y_min = min(box.y for box in boxes)
    x_max = max(box.x + box.w for box in boxes)
    y_max = max(box.y + box.h for box in boxes)
    return BoundingBox(
        x=round(max(0.0, x_min), 6),
        y=round(max(0.0, y_min), 6),
        w=round(min(1.0, x_max) - max(0.0, x_min), 6),
        h=round(min(1.0, y_max) - max(0.0, y_min), 6),
    )


def _coverage_bbox(
    boxes: list[BoundingBox],
    padding_ratio: float = TRACK_COVERAGE_PADDING_RATIO,
) -> BoundingBox:
    union_box = _union_bbox(boxes)
    x = max(0.0, union_box.x - padding_ratio)
    y = max(0.0, union_box.y - padding_ratio)
    right = min(1.0, union_box.x + union_box.w + padding_ratio)
    bottom = min(1.0, union_box.y + union_box.h + padding_ratio)
    return BoundingBox(
        x=round(x, 6),
        y=round(y, 6),
        w=round(max(0.0, right - x), 6),
        h=round(max(0.0, bottom - y), 6),
    )


def _median_bbox(
    boxes: list[BoundingBox],
) -> BoundingBox:
    if not boxes:
        return BoundingBox(x=0.0, y=0.0, w=0.0, h=0.0)

    return BoundingBox(
        x=round(statistics.median(box.x for box in boxes), 6),
        y=round(statistics.median(box.y for box in boxes), 6),
        w=round(statistics.median(box.w for box in boxes), 6),
        h=round(statistics.median(box.h for box in boxes), 6),
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
