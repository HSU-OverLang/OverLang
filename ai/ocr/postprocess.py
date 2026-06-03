from __future__ import annotations

import os
import re
import statistics
from typing import Any

from ai.api.schemas import BoundingBox, OcrAnimation, OcrItem, OcrLine
from ai.ocr.overlay_style import build_ocr_style

LINE_VERTICAL_OVERLAP_THRESHOLD = 0.45
LINE_CENTER_DISTANCE_RATIO = 0.75
LINE_HORIZONTAL_GAP_RATIO = 1.6
LINE_HORIZONTAL_GAP_MIN = 0.035
BLOCK_HORIZONTAL_OVERLAP_THRESHOLD = 0.55
BLOCK_VERTICAL_GAP_RATIO = 1.1
BLOCK_VERTICAL_GAP_MIN = 0.025
BLOCK_X_ALIGNMENT_TOLERANCE = 0.075
BLOCK_WIDTH_RATIO_THRESHOLD = 0.55
BLOCK_MAX_LINE_COUNT = 3
TRACK_COVERAGE_PADDING_RATIO = 0.012
TRACK_MULTILINE_COVERAGE_PADDING_RATIO = 0.018
TRACK_START_DELAY_SECONDS = 0.15
TRACK_END_TRIM_SECONDS = 0.05
TRACK_MISSING_TOLERANCE_SECONDS = 0.8
TRACK_MAX_MISSING_EXTENSION_SECONDS = 0.45
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
TRACK_STABLE_CENTER_DISTANCE_RATIO = 1.15
TRACK_STABLE_CENTER_DISTANCE_MIN = 0.045
TRACK_STABLE_SIZE_CHANGE_RATIO = 0.65
TRACK_STRONG_BBOX_IOU_THRESHOLD = 0.62
TRACK_STRONG_BBOX_CONTAINMENT_THRESHOLD = 0.72
TRACK_RELATED_TEXT_THRESHOLD = 0.72
TRACK_TOKEN_OVERLAP_THRESHOLD = 0.7
TEXT_VOTE_SIMILARITY_THRESHOLD = 0.88
STABLE_MIN_DETECTIONS = 3
STABLE_MIN_AVG_CONFIDENCE = 0.6
STABLE_HIGH_CONFIDENCE_MIN_DETECTIONS = 2
STABLE_HIGH_CONFIDENCE = 0.75
PROGRESSIVE_TEXT_MIN_LENGTH = 2
PROGRESSIVE_TEXT_MIN_LENGTH_RATIO = 0.35
PROGRESSIVE_TEXT_MAX_LENGTH_RATIO = 0.85
PROGRESSIVE_TEXT_SCORE = 0.88
TYPEWRITER_ANIMATION_ENABLED = False
SHORT_TEXT_CONFIDENCE_THRESHOLD = 0.45
SHORT_TEXT_MAX_LENGTH = 3
LOW_IMPORTANCE_TEXT_CONFIDENCE_THRESHOLD = 0.0
LOW_IMPORTANCE_TEXT_MAX_LENGTH = 0
MAX_REPEATED_CHAR_RATIO = 0.75
MAX_CONSECUTIVE_DUPLICATE_TOKENS = 0
SINGLE_LETTER_TOKEN_RATIO_THRESHOLD = 0.8
MIN_BBOX_WIDTH = 0.025
MIN_BBOX_HEIGHT = 0.015
MAX_BBOX_WIDTH = 0.82
MAX_BBOX_HEIGHT = 0.55
MAX_BBOX_AREA = 0.32
GIBBERISH_ALPHA_MIN_LENGTH = 4
GIBBERISH_ALPHA_VOWEL_RATIO_THRESHOLD = 0.15
TRANSLATION_MIN_CONFIDENCE = 0.6
LOW_PRIORITY_VARIANT_MIN_CONFIDENCE = 0.7
MAX_TEXT_GROWTH_RATIO = 1.65
DEFAULT_LOW_PRIORITY_OCR_VARIANTS = {
    "invert_threshold",
    "threshold",
}
DEFAULT_ALLOWED_SHORT_TEXTS = {
    "am",
    "bye",
    "hi",
    "min",
    "no",
    "ok",
    "pm",
    "yes",
}
DEFAULT_BLOCKED_OCR_TEXTS = {
    "blah",
    "dictp",
    "fndilg",
    "howz",
    "nol",
    "okl",
    "speok",
    "w",
    "wowl",
}
DEFAULT_EXCLUDED_TEXT_PATTERNS = {
    "abonnez-vous",
    "please subscribe",
    "subscribe",
    "subscribed",
    "suscribete",
    "suscríbete",
    "チャンネル登録",
    "구독",
    "구독하기",
    "알림 설정",
    "좋아요와 구독",
    "订阅",
}
DEFAULT_PRESERVE_TRANSLATION_TEXTS = {
    "finding nemo",
    "frozen",
    "marvel",
    "peppa pig",
    "pixar",
    "spider-man",
    "spiderman",
}


def build_ocr_items(
    raw_items: list[dict[str, Any]],
    frame_interval_seconds: float,
    frame_timestamps: list[float] | None = None,
    text_similarity_threshold: float = 0.9,
    bbox_tolerance: float = 0.04,
    min_confidence: float = 0.45,
    min_text_length: int = 2,
    max_special_char_ratio: float = 0.6,
    edge_margin: float = 0.0,
) -> list[OcrItem]:
    active_tracks: list[dict[str, Any]] = []
    finalized_tracks: list[dict[str, Any]] = []
    max_tracking_gap_seconds = _track_missing_tolerance_seconds(
        frame_interval_seconds
    )

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
                max_tracking_gap_seconds=max_tracking_gap_seconds,
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
            max_tracking_gap_seconds,
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
    is_carried_forward = bool(raw_item.get("carriedForward"))
    real_confidence_values = []
    if not is_carried_forward and raw_item.get("confidence") is not None:
        real_confidence_values.append(raw_item.get("confidence"))

    return {
        "startTime": float(raw_item["timestamp"]),
        "endTime": round(float(raw_item["timestamp"]) + frame_interval_seconds, 3),
        "originText": raw_item["originText"],
        "textCandidates": [_build_text_candidate(raw_item)],
        "boundingBox": raw_item["boundingBox"],
        "boundingBoxValues": [] if is_carried_forward else [raw_item["boundingBox"]],
        "confidenceValues": [raw_item.get("confidence")],
        "realConfidenceValues": real_confidence_values,
        "realDetectionCount": 0 if is_carried_forward else 1,
        "mergedItemCountValues": [int(raw_item.get("mergedItemCount", 1))],
        "frameIntervalSeconds": frame_interval_seconds,
        "lastTimestamp": float(raw_item["timestamp"]),
        "missingFrameCount": 0,
        "styleFramePath": raw_item.get("framePath"),
        "carriedFrameCount": 1 if is_carried_forward else 0,
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
        track["realDetectionCount"] = int(track.get("realDetectionCount", 0)) + 1
        if raw_item.get("confidence") is not None:
            track.setdefault("realConfidenceValues", []).append(
                raw_item.get("confidence")
            )
    if track["boundingBoxValues"]:
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
    text = _clean_ocr_text(str(raw_item.get("originText", "")))
    if len(text.replace(" ", "")) < min_text_length:
        return False

    confidence = raw_item.get("confidence")
    if confidence is not None and float(confidence) < min_confidence:
        return False

    if _is_low_priority_variant_below_threshold(raw_item, confidence):
        return False

    if _is_low_value_text(text, confidence):
        return False

    if _special_char_ratio(text) > max_special_char_ratio:
        return False

    if _is_edge_noise(raw_item["boundingBox"], edge_margin):
        return False

    if _is_too_small_bbox(raw_item["boundingBox"]):
        return False

    if _is_too_large_bbox(raw_item["boundingBox"]):
        return False

    raw_item["originText"] = text
    return True


def should_keep_ocr_text_for_translation(text: str, confidence: Any | None) -> bool:
    if _is_below_translation_confidence(confidence):
        return False

    return not _is_low_value_text(text, confidence)


def should_preserve_ocr_translation(text: str) -> bool:
    normalized_text = _normalize_text(text)
    if not normalized_text:
        return False

    return normalized_text in _preserve_translation_texts()


def _special_char_ratio(text: str) -> float:
    visible_chars = [char for char in text if not char.isspace()]
    if not visible_chars:
        return 1.0

    special_chars = [char for char in visible_chars if not char.isalnum()]
    return len(special_chars) / len(visible_chars)


def _clean_ocr_text(text: str) -> str:
    if not text.strip():
        return ""

    lines = []
    previous_normalized_line = ""
    for raw_line in text.strip().splitlines():
        line = " ".join(raw_line.strip().split())
        if not line:
            continue

        line = _collapse_repeated_text_pattern(
            _collapse_consecutive_duplicate_phrases(
                _collapse_consecutive_duplicate_tokens(line)
            )
        )
        normalized_line = _normalize_text(line)
        if normalized_line and normalized_line == previous_normalized_line:
            continue

        lines.append(line)
        previous_normalized_line = normalized_line

    return "\n".join(line for line in lines if line).strip()


def _collapse_consecutive_duplicate_tokens(text: str) -> str:
    tokens = text.split()
    if len(tokens) <= 1:
        return text

    collapsed_tokens: list[str] = []
    duplicate_count = 0
    previous_normalized_token = ""
    for token in tokens:
        normalized_token = _normalize_token(token)
        if normalized_token and normalized_token == previous_normalized_token:
            duplicate_count += 1
            if duplicate_count > _max_consecutive_duplicate_tokens():
                continue
        else:
            duplicate_count = 0

        collapsed_tokens.append(token)
        previous_normalized_token = normalized_token

    return " ".join(collapsed_tokens)


def _collapse_consecutive_duplicate_phrases(text: str) -> str:
    tokens = text.split()
    if len(tokens) < 4:
        return text

    normalized_tokens = [_normalize_token(token) for token in tokens]
    max_phrase_length = min(4, len(tokens) // 2)
    phrase_length = max_phrase_length
    while phrase_length >= 2:
        collapsed_tokens: list[str] = []
        index = 0
        while index < len(tokens):
            current_phrase = normalized_tokens[index : index + phrase_length]
            next_phrase = normalized_tokens[
                index + phrase_length : index + phrase_length * 2
            ]
            if (
                len(current_phrase) == phrase_length
                and current_phrase == next_phrase
                and any(current_phrase)
            ):
                collapsed_tokens.extend(tokens[index : index + phrase_length])
                index += phrase_length * 2
                while (
                    normalized_tokens[index : index + phrase_length]
                    == current_phrase
                ):
                    index += phrase_length
                continue

            collapsed_tokens.append(tokens[index])
            index += 1

        if len(collapsed_tokens) < len(tokens):
            tokens = collapsed_tokens
            normalized_tokens = [_normalize_token(token) for token in tokens]

        phrase_length -= 1

    return " ".join(tokens)


def _collapse_repeated_text_pattern(text: str) -> str:
    compact_text = _compact_text(text)
    if len(compact_text) < 8 or len(compact_text) % 2 != 0:
        return text

    half_index = len(compact_text) // 2
    first_half = compact_text[:half_index]
    second_half = compact_text[half_index:]
    if first_half and first_half == second_half:
        return text[: max(1, len(text) // 2)].strip()

    tokens = text.split()
    if len(tokens) >= 4 and len(tokens) % 2 == 0:
        middle = len(tokens) // 2
        first_tokens = [_normalize_token(token) for token in tokens[:middle]]
        second_tokens = [_normalize_token(token) for token in tokens[middle:]]
        if first_tokens == second_tokens:
            return " ".join(tokens[:middle])

    return text


def _is_low_value_text(text: str, confidence: Any | None) -> bool:
    cleaned_text = _clean_ocr_text(text)
    compact_text = _compact_text(cleaned_text)
    if not compact_text:
        return True

    normalized_text = _normalize_text(cleaned_text)
    if normalized_text in _allowed_short_texts():
        return False

    if normalized_text in _blocked_ocr_texts():
        return True

    if _matches_excluded_text_pattern(cleaned_text):
        return True

    if not any(char.isalnum() for char in compact_text):
        return True

    if _is_short_numeric_noise(compact_text):
        return True

    if _is_single_letter_alphabet_noise(cleaned_text):
        return True

    if _is_short_mixed_noise(cleaned_text):
        return True

    if _is_gibberish_alpha_text(cleaned_text):
        return True

    if _repeated_char_ratio(compact_text) >= _max_repeated_char_ratio():
        return True

    if _is_low_confidence_short_text(compact_text, confidence):
        return True

    return False


def _is_short_numeric_noise(compact_text: str) -> bool:
    return compact_text.isdigit() and len(compact_text) <= 2


def _allowed_short_texts() -> set[str]:
    return DEFAULT_ALLOWED_SHORT_TEXTS | _env_text_set("AI_OCR_ALLOWED_SHORT_TEXTS")


def _blocked_ocr_texts() -> set[str]:
    return DEFAULT_BLOCKED_OCR_TEXTS | _env_text_set("AI_OCR_BLOCKED_TEXTS")


def _excluded_text_patterns() -> set[str]:
    return DEFAULT_EXCLUDED_TEXT_PATTERNS | _env_text_set(
        "AI_OCR_EXCLUDED_TEXT_PATTERNS",
    )


def _preserve_translation_texts() -> set[str]:
    return DEFAULT_PRESERVE_TRANSLATION_TEXTS | _env_text_set(
        "AI_OCR_PRESERVE_TRANSLATION_TEXTS",
    )


def _env_text_set(env_name: str) -> set[str]:
    raw_value = os.getenv(env_name, "")
    return {
        _normalize_text(value)
        for value in raw_value.split(",")
        if _normalize_text(value)
    }


def _matches_excluded_text_pattern(text: str) -> bool:
    normalized_text = _normalize_text(text)
    if not normalized_text:
        return False

    return any(
        pattern in normalized_text
        for pattern in _excluded_text_patterns()
    )


def _is_single_letter_alphabet_noise(text: str) -> bool:
    tokens = [token for token in text.replace("\n", " ").split() if token]
    if not tokens:
        return True

    alphabet_tokens = [
        token
        for token in tokens
        if len(_normalize_token(token)) == 1 and _normalize_token(token).isalpha()
    ]
    if not alphabet_tokens:
        return False

    return len(alphabet_tokens) / len(tokens) >= _single_letter_token_ratio_threshold()


def _is_short_mixed_noise(text: str) -> bool:
    compact_text = _compact_text(text)
    if len(compact_text) > 6:
        return False

    has_alpha = any(char.isalpha() for char in compact_text)
    has_digit = any(char.isdigit() for char in compact_text)
    has_special = any(not char.isalnum() for char in compact_text)
    if has_alpha and has_digit:
        return True

    return has_alpha and has_special


def _is_gibberish_alpha_text(text: str) -> bool:
    tokens = [
        _normalize_token(token)
        for token in re.split(r"\s+", text)
        if _normalize_token(token)
    ]
    if not tokens:
        return True

    alphabet_tokens = [token for token in tokens if token.isascii() and token.isalpha()]
    if not alphabet_tokens or len(alphabet_tokens) != len(tokens):
        return False

    return all(_is_gibberish_alpha_token(token) for token in alphabet_tokens)


def _is_gibberish_alpha_token(token: str) -> bool:
    if len(token) < _gibberish_alpha_min_length():
        return False

    vowel_count = sum(1 for char in token.lower() if char in "aeiou")
    return vowel_count / len(token) < _gibberish_alpha_vowel_ratio_threshold()


def _is_low_importance_single_word(text: str, confidence: Any | None) -> bool:
    normalized_text = _normalize_text(text)
    if (
        normalized_text in _allowed_short_texts()
        or normalized_text in _preserve_translation_texts()
    ):
        return False

    tokens = normalized_text.split()
    if len(tokens) != 1:
        return False

    compact_text = _compact_text(normalized_text)
    if len(compact_text) > _low_importance_text_max_length():
        return False

    if confidence is None:
        return False

    return float(confidence) < _low_importance_text_confidence_threshold()


def _repeated_char_ratio(compact_text: str) -> float:
    if not compact_text:
        return 1.0

    most_common_count = max(compact_text.count(char) for char in set(compact_text))
    return most_common_count / len(compact_text)


def _is_low_confidence_short_text(
    compact_text: str,
    confidence: Any | None,
) -> bool:
    if len(compact_text) > _short_text_max_length():
        return False

    if confidence is None:
        return False

    return float(confidence) < _short_text_confidence_threshold()


def _normalize_token(token: str) -> str:
    return "".join(char.lower() for char in token if char.isalnum())


def _short_text_confidence_threshold() -> float:
    return _float_env(
        "AI_OCR_SHORT_TEXT_CONFIDENCE_THRESHOLD",
        SHORT_TEXT_CONFIDENCE_THRESHOLD,
    )


def _short_text_max_length() -> int:
    return _int_env("AI_OCR_SHORT_TEXT_MAX_LENGTH", SHORT_TEXT_MAX_LENGTH)


def _low_importance_text_confidence_threshold() -> float:
    return _float_env(
        "AI_OCR_LOW_IMPORTANCE_TEXT_CONFIDENCE_THRESHOLD",
        LOW_IMPORTANCE_TEXT_CONFIDENCE_THRESHOLD,
    )


def _low_importance_text_max_length() -> int:
    return _int_env(
        "AI_OCR_LOW_IMPORTANCE_TEXT_MAX_LENGTH",
        LOW_IMPORTANCE_TEXT_MAX_LENGTH,
    )


def _max_repeated_char_ratio() -> float:
    return _float_env("AI_OCR_MAX_REPEATED_CHAR_RATIO", MAX_REPEATED_CHAR_RATIO)


def _single_letter_token_ratio_threshold() -> float:
    return _float_env(
        "AI_OCR_SINGLE_LETTER_TOKEN_RATIO_THRESHOLD",
        SINGLE_LETTER_TOKEN_RATIO_THRESHOLD,
    )


def _gibberish_alpha_min_length() -> int:
    return _int_env("AI_OCR_GIBBERISH_ALPHA_MIN_LENGTH", GIBBERISH_ALPHA_MIN_LENGTH)


def _gibberish_alpha_vowel_ratio_threshold() -> float:
    return _float_env(
        "AI_OCR_GIBBERISH_ALPHA_VOWEL_RATIO_THRESHOLD",
        GIBBERISH_ALPHA_VOWEL_RATIO_THRESHOLD,
    )


def _translation_min_confidence() -> float:
    return _float_env(
        "AI_OCR_TRANSLATION_MIN_CONFIDENCE",
        TRANSLATION_MIN_CONFIDENCE,
    )


def _is_below_translation_confidence(confidence: Any | None) -> bool:
    if confidence is None:
        return False

    return float(confidence) < _translation_min_confidence()


def _min_bbox_width() -> float:
    return _float_env("AI_OCR_MIN_BBOX_WIDTH", MIN_BBOX_WIDTH)


def _min_bbox_height() -> float:
    return _float_env("AI_OCR_MIN_BBOX_HEIGHT", MIN_BBOX_HEIGHT)


def _max_bbox_width() -> float:
    return _float_env("AI_OCR_MAX_BBOX_WIDTH", MAX_BBOX_WIDTH)


def _max_bbox_height() -> float:
    return _float_env("AI_OCR_MAX_BBOX_HEIGHT", MAX_BBOX_HEIGHT)


def _max_bbox_area() -> float:
    return _float_env("AI_OCR_MAX_BBOX_AREA", MAX_BBOX_AREA)


def _max_text_growth_ratio() -> float:
    return _float_env("AI_OCR_MAX_TEXT_GROWTH_RATIO", MAX_TEXT_GROWTH_RATIO)


def _max_consecutive_duplicate_tokens() -> int:
    return _int_env(
        "AI_OCR_MAX_CONSECUTIVE_DUPLICATE_TOKENS",
        MAX_CONSECUTIVE_DUPLICATE_TOKENS,
    )


def _float_env(env_name: str, default_value: float) -> float:
    try:
        return float(os.getenv(env_name, str(default_value)))
    except ValueError:
        return default_value


def _int_env(env_name: str, default_value: int) -> int:
    try:
        return int(os.getenv(env_name, str(default_value)))
    except ValueError:
        return default_value


def _bool_env(env_name: str, default_value: bool) -> bool:
    raw_value = os.getenv(env_name)
    if raw_value is None:
        return default_value

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _track_missing_tolerance_seconds(frame_interval_seconds: float) -> float:
    return max(
        frame_interval_seconds * 2.5,
        _float_env(
            "AI_OCR_TRACK_MISSING_TOLERANCE_SECONDS",
            TRACK_MISSING_TOLERANCE_SECONDS,
        ),
    )


def _track_start_delay_seconds() -> float:
    return _float_env("AI_OCR_TRACK_START_DELAY_SECONDS", TRACK_START_DELAY_SECONDS)


def _track_end_trim_seconds() -> float:
    return _float_env("AI_OCR_TRACK_END_TRIM_SECONDS", TRACK_END_TRIM_SECONDS)


def _track_coverage_padding_ratio() -> float:
    return _float_env(
        "AI_OCR_TRACK_COVERAGE_PADDING_RATIO",
        TRACK_COVERAGE_PADDING_RATIO,
    )


def _track_multiline_coverage_padding_ratio() -> float:
    return _float_env(
        "AI_OCR_TRACK_MULTILINE_COVERAGE_PADDING_RATIO",
        TRACK_MULTILINE_COVERAGE_PADDING_RATIO,
    )


def _duplicate_text_similarity_threshold() -> float:
    return _float_env(
        "AI_OCR_DUPLICATE_TEXT_SIMILARITY_THRESHOLD",
        DUPLICATE_TEXT_SIMILARITY_THRESHOLD,
    )


def _duplicate_bbox_iou_threshold() -> float:
    return _float_env("AI_OCR_DUPLICATE_BBOX_IOU_THRESHOLD", DUPLICATE_BBOX_IOU_THRESHOLD)


def _duplicate_center_distance_ratio() -> float:
    return _float_env(
        "AI_OCR_DUPLICATE_CENTER_DISTANCE_RATIO",
        DUPLICATE_CENTER_DISTANCE_RATIO,
    )


def _duplicate_containment_ratio() -> float:
    return _float_env(
        "AI_OCR_DUPLICATE_CONTAINMENT_RATIO",
        DUPLICATE_CONTAINMENT_RATIO,
    )


def _duplicate_coverage_ratio() -> float:
    return _float_env("AI_OCR_DUPLICATE_COVERAGE_RATIO", DUPLICATE_COVERAGE_RATIO)


def _duplicate_normalized_text_threshold() -> float:
    return _float_env(
        "AI_OCR_DUPLICATE_NORMALIZED_TEXT_THRESHOLD",
        DUPLICATE_NORMALIZED_TEXT_THRESHOLD,
    )


def _track_text_stability_threshold() -> float:
    return _float_env(
        "AI_OCR_TRACK_TEXT_STABILITY_THRESHOLD",
        TRACK_TEXT_STABILITY_THRESHOLD,
    )


def _track_center_distance_ratio() -> float:
    return _float_env("AI_OCR_TRACK_CENTER_DISTANCE_RATIO", TRACK_CENTER_DISTANCE_RATIO)


def _track_center_distance_min() -> float:
    return _float_env("AI_OCR_TRACK_CENTER_DISTANCE_MIN", TRACK_CENTER_DISTANCE_MIN)


def _track_stable_center_distance_ratio() -> float:
    return _float_env(
        "AI_OCR_TRACK_STABLE_CENTER_DISTANCE_RATIO",
        TRACK_STABLE_CENTER_DISTANCE_RATIO,
    )


def _track_stable_center_distance_min() -> float:
    return _float_env(
        "AI_OCR_TRACK_STABLE_CENTER_DISTANCE_MIN",
        TRACK_STABLE_CENTER_DISTANCE_MIN,
    )


def _track_stable_size_change_ratio() -> float:
    return _float_env(
        "AI_OCR_TRACK_STABLE_SIZE_CHANGE_RATIO",
        TRACK_STABLE_SIZE_CHANGE_RATIO,
    )


def _track_strong_bbox_iou_threshold() -> float:
    return _float_env(
        "AI_OCR_TRACK_STRONG_BBOX_IOU_THRESHOLD",
        TRACK_STRONG_BBOX_IOU_THRESHOLD,
    )


def _track_strong_bbox_containment_threshold() -> float:
    return _float_env(
        "AI_OCR_TRACK_STRONG_BBOX_CONTAINMENT_THRESHOLD",
        TRACK_STRONG_BBOX_CONTAINMENT_THRESHOLD,
    )


def _track_related_text_threshold() -> float:
    return _float_env("AI_OCR_TRACK_RELATED_TEXT_THRESHOLD", TRACK_RELATED_TEXT_THRESHOLD)


def _track_token_overlap_threshold() -> float:
    return _float_env("AI_OCR_TRACK_TOKEN_OVERLAP_THRESHOLD", TRACK_TOKEN_OVERLAP_THRESHOLD)


def _progressive_text_min_length() -> int:
    return _int_env("AI_OCR_PROGRESSIVE_TEXT_MIN_LENGTH", PROGRESSIVE_TEXT_MIN_LENGTH)


def _progressive_text_min_length_ratio() -> float:
    return _float_env(
        "AI_OCR_PROGRESSIVE_TEXT_MIN_LENGTH_RATIO",
        PROGRESSIVE_TEXT_MIN_LENGTH_RATIO,
    )


def _progressive_text_max_length_ratio() -> float:
    return _float_env(
        "AI_OCR_PROGRESSIVE_TEXT_MAX_LENGTH_RATIO",
        PROGRESSIVE_TEXT_MAX_LENGTH_RATIO,
    )


def _progressive_text_score() -> float:
    return _float_env("AI_OCR_PROGRESSIVE_TEXT_SCORE", PROGRESSIVE_TEXT_SCORE)


def _typewriter_animation_enabled() -> bool:
    return _bool_env(
        "AI_OCR_TYPEWRITER_ANIMATION_ENABLED",
        TYPEWRITER_ANIMATION_ENABLED,
    )


def _line_vertical_overlap_threshold() -> float:
    return _float_env(
        "AI_OCR_LINE_VERTICAL_OVERLAP_THRESHOLD",
        LINE_VERTICAL_OVERLAP_THRESHOLD,
    )


def _line_center_distance_ratio() -> float:
    return _float_env("AI_OCR_LINE_CENTER_DISTANCE_RATIO", LINE_CENTER_DISTANCE_RATIO)


def _line_horizontal_gap_ratio() -> float:
    return _float_env("AI_OCR_LINE_HORIZONTAL_GAP_RATIO", LINE_HORIZONTAL_GAP_RATIO)


def _line_horizontal_gap_min() -> float:
    return _float_env("AI_OCR_LINE_HORIZONTAL_GAP_MIN", LINE_HORIZONTAL_GAP_MIN)


def _block_horizontal_overlap_threshold() -> float:
    return _float_env(
        "AI_OCR_BLOCK_HORIZONTAL_OVERLAP_THRESHOLD",
        BLOCK_HORIZONTAL_OVERLAP_THRESHOLD,
    )


def _block_vertical_gap_ratio() -> float:
    return _float_env("AI_OCR_BLOCK_VERTICAL_GAP_RATIO", BLOCK_VERTICAL_GAP_RATIO)


def _block_vertical_gap_min() -> float:
    return _float_env("AI_OCR_BLOCK_VERTICAL_GAP_MIN", BLOCK_VERTICAL_GAP_MIN)


def _block_x_alignment_tolerance() -> float:
    return _float_env(
        "AI_OCR_BLOCK_X_ALIGNMENT_TOLERANCE",
        BLOCK_X_ALIGNMENT_TOLERANCE,
    )


def _block_width_ratio_threshold() -> float:
    return _float_env(
        "AI_OCR_BLOCK_WIDTH_RATIO_THRESHOLD",
        BLOCK_WIDTH_RATIO_THRESHOLD,
    )


def _block_max_line_count() -> int:
    return _int_env("AI_OCR_BLOCK_MAX_LINE_COUNT", BLOCK_MAX_LINE_COUNT)


def _track_max_missing_extension_seconds() -> float:
    return _float_env(
        "AI_OCR_TRACK_MAX_MISSING_EXTENSION_SECONDS",
        TRACK_MAX_MISSING_EXTENSION_SECONDS,
    )


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


def _is_too_small_bbox(bounding_box: BoundingBox) -> bool:
    return (
        bounding_box.w < _min_bbox_width()
        or bounding_box.h < _min_bbox_height()
    )


def _is_too_large_bbox(bounding_box: BoundingBox) -> bool:
    return (
        bounding_box.w > _max_bbox_width()
        or bounding_box.h > _max_bbox_height()
        or bounding_box.w * bounding_box.h > _max_bbox_area()
    )


def _is_low_priority_variant_below_threshold(
    raw_item: dict[str, Any],
    confidence: Any | None,
) -> bool:
    if confidence is None:
        return False

    variant_name = _ocr_variant_name(raw_item)
    if variant_name not in _low_priority_ocr_variants():
        return False

    return float(confidence) < _low_priority_variant_min_confidence()


def _ocr_variant_name(raw_item: dict[str, Any]) -> str:
    if raw_item.get("refined"):
        return "refined"

    return str(raw_item.get("ocrVariant") or "original").strip().lower()


def _ocr_variant_priority(raw_item: dict[str, Any]) -> int:
    variant_name = _ocr_variant_name(raw_item)
    if variant_name == "refined":
        return 4

    if variant_name == "original":
        return 3

    if variant_name == "contrast":
        return 2

    if variant_name in _low_priority_ocr_variants():
        return 1

    return 0


def _low_priority_ocr_variants() -> set[str]:
    return DEFAULT_LOW_PRIORITY_OCR_VARIANTS | _env_text_set(
        "AI_OCR_LOW_PRIORITY_VARIANTS",
    )


def _low_priority_variant_min_confidence() -> float:
    return _float_env(
        "AI_OCR_LOW_PRIORITY_VARIANT_MIN_CONFIDENCE",
        LOW_PRIORITY_VARIANT_MIN_CONFIDENCE,
    )


def _track_to_ocr_item(track: dict[str, Any]) -> OcrItem:
    confidence_values = [
        float(confidence)
        for confidence in _track_real_confidence_values(track)
        if confidence is not None
    ]
    confidence = None
    if confidence_values:
        confidence = round(sum(confidence_values) / len(confidence_values), 4)

    coverage_box = _track_coverage_bbox(track)
    lines = _build_ocr_item_lines(track, coverage_box)
    style = build_ocr_style(
        track.get("styleFramePath"),
        coverage_box,
        line_count=len(lines),
    )
    if style is not None:
        style.animation = _build_track_animation(track)

    return OcrItem(
        start_time=_resolve_track_start_time(track),
        end_time=_resolve_track_end_time(track),
        origin_text=_resolve_track_text(track),
        translated_text=None,
        bounding_box=coverage_box,
        confidence=confidence,
        lines=lines,
        style=style,
    )


def _build_ocr_item_lines(
    track: dict[str, Any],
    coverage_box: BoundingBox,
) -> list[OcrLine]:
    line_texts = [
        line.strip()
        for line in _resolve_track_text(track).splitlines()
        if line.strip()
    ]
    if not line_texts:
        return []

    line_count = len(line_texts)
    if line_count == 1:
        return [OcrLine(origin_text=line_texts[0], bounding_box=coverage_box)]

    line_height = coverage_box.h / line_count
    return [
        OcrLine(
            origin_text=line_text,
            bounding_box=BoundingBox(
                x=coverage_box.x,
                y=round(coverage_box.y + line_height * index, 6),
                w=coverage_box.w,
                h=round(line_height, 6),
            ),
        )
        for index, line_text in enumerate(line_texts)
    ]


def _should_keep_track(track: dict[str, Any]) -> bool:
    resolved_text = _resolve_track_text(track)
    real_detection_count = _track_real_detection_count(track)
    confidence_values = _track_real_confidence_values(track)
    max_confidence = max(confidence_values, default=0.0)
    if _is_low_value_text(resolved_text, max_confidence):
        return False

    if _is_too_large_bbox(_track_coverage_bbox(track)):
        return False

    if _is_text_accumulation_track(track):
        return False

    if real_detection_count <= 0:
        return False

    avg_confidence = (
        sum(confidence_values) / len(confidence_values)
        if confidence_values
        else 0.0
    )
    return _is_stable_track(
        real_detection_count,
        avg_confidence,
        max_confidence,
    )


def _is_text_accumulation_track(track: dict[str, Any]) -> bool:
    candidates = [
        str(candidate.get("text", "")).strip()
        for candidate in track.get("textCandidates", [])
        if str(candidate.get("text", "")).strip()
    ]
    compact_lengths = [
        len(_compact_text(candidate))
        for candidate in candidates
        if _compact_text(candidate)
    ]
    if len(compact_lengths) < 4:
        return False

    median_length = statistics.median(compact_lengths)
    resolved_length = len(_compact_text(_resolve_track_text(track)))
    if median_length <= 0 or resolved_length <= median_length * _max_text_growth_ratio():
        return False

    distinct_vote_keys = {
        _text_vote_key(candidate) or _normalize_text(candidate)
        for candidate in candidates
    }
    return len(distinct_vote_keys) >= 3


def _track_real_detection_count(track: dict[str, Any]) -> int:
    return int(
        track.get(
            "realDetectionCount",
            len(track.get("boundingBoxValues", [])),
        )
    )


def _track_real_confidence_values(track: dict[str, Any]) -> list[float]:
    confidence_values = track.get("realConfidenceValues")
    if confidence_values is None:
        confidence_values = track.get("confidenceValues", [])

    return [
        float(confidence)
        for confidence in confidence_values
        if confidence is not None
    ]


def _is_stable_track(
    real_detection_count: int,
    avg_confidence: float,
    max_confidence: float,
) -> bool:
    if (
        real_detection_count >= _stable_min_detections()
        and avg_confidence >= _stable_min_avg_confidence()
    ):
        return True

    return (
        real_detection_count >= _stable_high_confidence_min_detections()
        and max_confidence >= _stable_high_confidence()
    )


def _stable_min_detections() -> int:
    return _int_env("AI_OCR_STABLE_MIN_DETECTIONS", STABLE_MIN_DETECTIONS)


def _stable_min_avg_confidence() -> float:
    return _float_env(
        "AI_OCR_STABLE_MIN_AVG_CONFIDENCE",
        STABLE_MIN_AVG_CONFIDENCE,
    )


def _stable_high_confidence_min_detections() -> int:
    return _int_env(
        "AI_OCR_STABLE_HIGH_CONFIDENCE_MIN_DETECTIONS",
        STABLE_HIGH_CONFIDENCE_MIN_DETECTIONS,
    )


def _stable_high_confidence() -> float:
    return _float_env("AI_OCR_STABLE_HIGH_CONFIDENCE", STABLE_HIGH_CONFIDENCE)


def _resolve_track_start_time(track: dict[str, Any]) -> float:
    start_time = float(track["startTime"])
    end_time = float(track["endTime"])
    if _has_progressive_text_candidates(track):
        progressive_timing = _resolve_progressive_text_timing(track)
        if progressive_timing is not None:
            start_time = max(start_time, progressive_timing[0])
            return round(start_time, 3)

    duration = max(0.0, end_time - start_time)
    start_delay = min(_track_start_delay_seconds(), duration * 0.25)
    delayed_start_time = start_time + start_delay
    if delayed_start_time >= end_time:
        return round(start_time, 3)

    return round(delayed_start_time, 3)


def _resolve_track_end_time(track: dict[str, Any]) -> float:
    start_time = _resolve_track_start_time(track)
    end_time = float(track["endTime"])
    frame_interval_seconds = float(track.get("frameIntervalSeconds") or 0.0)
    if int(track.get("missingFrameCount", 0)) > 0:
        max_missing_extension = min(
            _track_max_missing_extension_seconds(),
            max(frame_interval_seconds, 0.0),
        )
        end_time = min(
            end_time,
            float(track.get("lastTimestamp", end_time)) + max_missing_extension,
        )

    end_trim_seconds = min(_track_end_trim_seconds(), frame_interval_seconds * 0.25)
    trimmed_end_time = end_time - end_trim_seconds
    if trimmed_end_time <= start_time:
        return round(end_time, 3)

    return round(trimmed_end_time, 3)


def _build_track_animation(track: dict[str, Any]) -> OcrAnimation | None:
    if not _typewriter_animation_enabled():
        return None

    progressive_timing = _resolve_progressive_text_timing(track)
    if progressive_timing is None:
        return None

    return OcrAnimation(
        type="TYPEWRITER",
        start_time=round(progressive_timing[0], 3),
        end_time=round(progressive_timing[1], 3),
    )


def _resolve_progressive_text_timing(track: dict[str, Any]) -> tuple[float, float] | None:
    if not _has_progressive_text_candidates(track):
        return None

    timestamps = [
        float(candidate.get("timestamp") or 0.0)
        for candidate in track.get("textCandidates", [])
        if str(candidate.get("text", "")).strip()
    ]
    if len(timestamps) < 2:
        return None

    start_time = min(timestamps)
    end_time = max(timestamps)
    if end_time <= start_time:
        return None

    return start_time, end_time


def _track_coverage_bbox(track: dict[str, Any]) -> BoundingBox:
    merged_item_count = max(track.get("mergedItemCountValues", [1]), default=1)
    resolved_text = _resolve_track_text(track)
    padding_ratio = _track_coverage_padding_ratio()
    if "\n" in resolved_text or merged_item_count > 1:
        padding_ratio = _track_multiline_coverage_padding_ratio()

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
            _ocr_variant_priority(item),
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
        text_similarity < _duplicate_text_similarity_threshold()
        and not is_progressive_text
    ):
        return False

    left_box = left_item["boundingBox"]
    right_box = right_item["boundingBox"]
    if _bbox_iou(left_box, right_box) >= _duplicate_bbox_iou_threshold():
        return True

    if _bbox_containment_ratio(left_box, right_box) >= _duplicate_containment_ratio():
        return True

    if _bbox_coverage_ratio(left_box, right_box) >= _duplicate_coverage_ratio():
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

    grouped_candidates: list[dict[str, Any]] = []
    for candidate in candidates:
        text = str(candidate["text"]).strip()
        normalized_text = _normalize_text(text)
        if not normalized_text:
            continue

        timestamp = float(candidate.get("timestamp") or 0.0)
        group = _find_matching_text_vote_group(grouped_candidates, text)
        if group is None:
            group = {
                "text": text,
                "normalizedText": normalized_text,
                "count": 0,
                "confidence": 0.0,
                "firstTimestamp": timestamp,
                "lastTimestamp": timestamp,
                "variants": {},
            }
            grouped_candidates.append(group)

        _add_text_candidate_to_vote_group(group, text, candidate, timestamp)

    if not grouped_candidates:
        return {
            "text": str(track.get("originText", "")).strip(),
            "count": 0,
            "confidence": 0.0,
            "firstTimestamp": float(track.get("startTime", 0.0)),
            "lastTimestamp": float(track.get("startTime", 0.0)),
        }

    groups = [_finalize_text_vote_group(group) for group in grouped_candidates]
    if _has_progressive_text_candidates(track):
        return max(
            groups,
            key=lambda group: (
                int(group.get("selectedVariantCount") or group["count"]),
                int(group["count"]),
                float(group.get("selectedVariantConfidence") or 0.0),
                float(group["confidence"]),
                float(group["lastTimestamp"]),
                len(_compact_text(str(group["text"]))),
            ),
        )

    return max(
        groups,
        key=lambda group: (
            int(group.get("selectedVariantCount") or group["count"]),
            int(group["count"]),
            float(group.get("selectedVariantConfidence") or 0.0),
            float(group["confidence"]),
            float(group["lastTimestamp"]),
            len(str(group["text"])),
        ),
        )


def _find_matching_text_vote_group(
    groups: list[dict[str, Any]],
    text: str,
) -> dict[str, Any] | None:
    text_vote_key = _text_vote_key(text)
    normalized_text = _normalize_text(text)
    if not text_vote_key and not normalized_text:
        return None

    candidates = []
    for group in groups:
        group_vote_key = str(group.get("voteKey", ""))
        group_text = str(group.get("normalizedText", ""))
        if text_vote_key and text_vote_key == group_vote_key:
            return group

        similarity = _similarity(normalized_text, group_text)
        if similarity >= _text_vote_similarity_threshold():
            candidates.append((similarity, group))

    if not candidates:
        return None

    return max(candidates, key=lambda candidate: candidate[0])[1]


def _add_text_candidate_to_vote_group(
    group: dict[str, Any],
    text: str,
    candidate: dict[str, Any],
    timestamp: float,
) -> None:
    confidence = float(candidate.get("confidence") or 0.0)
    group["count"] += 1
    group["confidence"] += confidence
    group["firstTimestamp"] = min(float(group["firstTimestamp"]), timestamp)
    group["lastTimestamp"] = max(float(group["lastTimestamp"]), timestamp)
    group["voteKey"] = group.get("voteKey") or _text_vote_key(text)

    variant_key = _text_vote_key(text) or _normalize_text(text)
    variants = group.setdefault("variants", {})
    variant = variants.setdefault(
        variant_key,
        {
            "text": text,
            "count": 0,
            "confidence": 0.0,
            "maxConfidence": 0.0,
            "firstTimestamp": timestamp,
            "lastTimestamp": timestamp,
        },
    )
    variant["count"] += 1
    variant["confidence"] += confidence
    previous_max_confidence = float(variant.get("maxConfidence") or 0.0)
    variant["maxConfidence"] = max(previous_max_confidence, confidence)
    variant["firstTimestamp"] = min(float(variant["firstTimestamp"]), timestamp)
    variant["lastTimestamp"] = max(float(variant["lastTimestamp"]), timestamp)
    if confidence >= previous_max_confidence:
        variant["text"] = text


def _finalize_text_vote_group(group: dict[str, Any]) -> dict[str, Any]:
    variants = list(group.get("variants", {}).values())
    if not variants:
        return group

    selected_variant = max(
        variants,
        key=lambda variant: (
            int(variant["count"]),
            _safe_average_confidence(variant),
            _script_quality_score(str(variant["text"])),
            -_duplicate_text_penalty(str(variant["text"])),
            -_accumulated_text_penalty(str(variant["text"]), variants),
            float(variant["lastTimestamp"]),
            -len(_compact_text(str(variant["text"]))),
        ),
    )
    finalized_group = dict(group)
    finalized_group["text"] = str(selected_variant["text"])
    finalized_group["selectedVariantCount"] = int(selected_variant["count"])
    finalized_group["selectedVariantConfidence"] = _safe_average_confidence(
        selected_variant,
    )
    return finalized_group


def _safe_average_confidence(group: dict[str, Any]) -> float:
    count = int(group.get("count") or 0)
    if count <= 0:
        return 0.0

    return float(group.get("confidence") or 0.0) / count


def _duplicate_text_penalty(text: str) -> int:
    cleaned_text = _clean_ocr_text(text)
    compact_cleaned_text = _compact_text(cleaned_text)
    compact_text = _compact_text(text)
    return max(0, len(compact_text) - len(compact_cleaned_text))


def _accumulated_text_penalty(
    text: str,
    variants: list[dict[str, Any]],
) -> int:
    compact_text = _compact_text(text)
    if not compact_text:
        return 0

    shorter_variant_lengths = [
        len(_compact_text(str(variant.get("text", ""))))
        for variant in variants
        if 0 < len(_compact_text(str(variant.get("text", "")))) < len(compact_text)
        and compact_text.startswith(_compact_text(str(variant.get("text", ""))))
    ]
    if not shorter_variant_lengths:
        return 0

    longest_stable_prefix = max(shorter_variant_lengths)
    return max(0, len(compact_text) - longest_stable_prefix)


def _script_quality_score(text: str) -> int:
    compact_text = _compact_text(text)
    if not compact_text:
        return 0

    cjk_count = sum(1 for char in compact_text if _is_cjk_text_char(char))
    latin_count = sum(1 for char in compact_text if char.isascii() and char.isalpha())
    if cjk_count and latin_count:
        return cjk_count - (latin_count * 2)

    if cjk_count:
        return cjk_count

    if _is_gibberish_alpha_text(text):
        return -len(compact_text)

    return 0


def _is_cjk_text_char(char: str) -> bool:
    return (
        "\u3040" <= char <= "\u30ff"
        or "\u3400" <= char <= "\u9fff"
        or "\uf900" <= char <= "\ufaff"
    )


def _text_vote_key(text: str) -> str:
    return "".join(_normalize_token(token) for token in _normalize_text(text).split())


def _text_vote_similarity_threshold() -> float:
    return _float_env(
        "AI_OCR_TEXT_VOTE_SIMILARITY_THRESHOLD",
        TEXT_VOTE_SIMILARITY_THRESHOLD,
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
    if shorter_length < _progressive_text_min_length():
        return False

    if shorter_length / longer_length < _progressive_text_min_length_ratio():
        return False

    if shorter_length / longer_length >= _progressive_text_max_length_ratio():
        return False

    longer_text = left_compact if len(left_compact) >= len(right_compact) else right_compact
    shorter_text = right_compact if longer_text == left_compact else left_compact
    return longer_text.startswith(shorter_text)


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

        if _is_too_large_bbox(_union_bbox([line_box, item_box])):
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
        overlap >= _line_vertical_overlap_threshold()
        or center_distance <= max_height * _line_center_distance_ratio()
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
        _line_horizontal_gap_min(),
        max(left.h, right.h) * _line_horizontal_gap_ratio(),
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
        if len(block) >= _block_max_line_count():
            continue

        block_box = _union_bbox([item["boundingBox"] for item in block])
        if _horizontal_overlap_ratio(block_box, line_box) < _block_horizontal_overlap_threshold():
            continue

        if not _is_aligned_text_block(block_box, line_box):
            continue

        gap = max(0.0, line_box.y - (block_box.y + block_box.h))
        max_gap = max(
            _block_vertical_gap_min(),
            max(block_box.h / max(len(block), 1), line_box.h) * _block_vertical_gap_ratio(),
        )
        if gap > max_gap:
            continue

        if _is_too_large_bbox(_union_bbox([block_box, line_box])):
            continue

        candidates.append((gap, block))

    if not candidates:
        return None

    return min(candidates, key=lambda candidate: candidate[0])[1]


def _is_aligned_text_block(
    block_box: BoundingBox,
    line_box: BoundingBox,
) -> bool:
    x_distance = abs(block_box.x - line_box.x)
    width_ratio = _bbox_size_ratio(block_box.w, line_box.w)
    return (
        x_distance <= _block_x_alignment_tolerance()
        and width_ratio >= _block_width_ratio_threshold()
    )


def _merge_raw_items(
    raw_items: list[dict[str, Any]],
    separator: str = " ",
) -> dict[str, Any]:
    merged_item = dict(raw_items[0])
    merge_items = _deduplicate_merge_items(raw_items)
    merged_item["originText"] = _clean_ocr_text(
        separator.join(
            str(item["originText"]).strip()
            for item in merge_items
            if str(item.get("originText", "")).strip()
        )
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
    if text_similarity < _duplicate_normalized_text_threshold() and not is_progressive_text:
        return False

    left_box = left_item["boundingBox"]
    right_box = right_item["boundingBox"]
    return (
        _bbox_iou(left_box, right_box) >= _duplicate_bbox_iou_threshold()
        or _bbox_containment_ratio(left_box, right_box) >= _duplicate_containment_ratio()
        or _bbox_coverage_ratio(left_box, right_box) >= _duplicate_coverage_ratio()
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
    if text_similarity < _duplicate_normalized_text_threshold() and not is_progressive_text:
        return False

    if _time_overlap_ratio(left_item, right_item) < 0.5:
        return False

    left_box = left_item.bounding_box
    right_box = right_item.bounding_box
    return (
        _bbox_iou(left_box, right_box) >= _duplicate_bbox_iou_threshold()
        or _bbox_containment_ratio(left_box, right_box) >= _duplicate_containment_ratio()
        or _bbox_coverage_ratio(left_box, right_box) >= _duplicate_coverage_ratio()
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
    max_tracking_gap_seconds: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    active_tracks = []
    disappeared_tracks = []
    for track in tracks:
        if _should_keep_missing_track(
            track,
            missing_timestamp,
            max_tracking_gap_seconds,
        ):
            _extend_missing_track(track, missing_timestamp)
            active_tracks.append(track)
            continue

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
    max_tracking_gap_seconds: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    active_tracks = []
    disappeared_tracks = []
    for track in tracks:
        if id(track) in matched_track_ids or track["lastTimestamp"] == timestamp:
            active_tracks.append(track)
            continue

        if _should_keep_missing_track(track, timestamp, max_tracking_gap_seconds):
            _extend_missing_track(track, timestamp)
            active_tracks.append(track)
            continue

        finalized_track = dict(track)
        finalized_track["endTime"] = round(float(timestamp), 3)
        if finalized_track["endTime"] <= finalized_track["startTime"]:
            finalized_track["endTime"] = track["endTime"]

        disappeared_tracks.append(finalized_track)

    return active_tracks, disappeared_tracks


def _should_keep_missing_track(
    track: dict[str, Any],
    timestamp: float,
    max_tracking_gap_seconds: float,
) -> bool:
    return timestamp - float(track["lastTimestamp"]) <= max_tracking_gap_seconds


def _extend_missing_track(track: dict[str, Any], timestamp: float) -> None:
    frame_interval_seconds = float(track.get("frameIntervalSeconds") or 0.0)
    track["endTime"] = round(float(timestamp) + frame_interval_seconds, 3)
    track["missingFrameCount"] = int(track.get("missingFrameCount", 0)) + 1


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
        is_related_text = _is_related_ocr_text_pair(track_text, raw_text)
        if _is_accumulative_track_text_change(
            track_text,
            raw_text,
            is_progressive_text=is_progressive_text,
        ):
            continue

        bbox_overlap = _bbox_iou(track["boundingBox"], raw_item["boundingBox"])
        bbox_containment = _bbox_containment_ratio(
            track["boundingBox"],
            raw_item["boundingBox"],
        )
        is_strong_bbox_match = _is_strong_bbox_track_match(
            bbox_overlap,
            bbox_containment,
        )
        if (
            text_similarity < min(text_similarity_threshold, _track_text_stability_threshold())
            and not is_progressive_text
            and not is_related_text
            and not is_strong_bbox_match
        ):
            continue

        is_stable_scaling = _is_stable_scaling_match(
            track["boundingBox"],
            raw_item["boundingBox"],
        )
        if is_related_text and not is_progressive_text:
            if bbox_overlap < 0.25 and bbox_containment < 0.55:
                continue

        if not is_stable_scaling and not _is_stable_bbox_track_match(
            track["boundingBox"],
            raw_item["boundingBox"],
        ):
            continue

        if bbox_overlap <= 0 and not _is_similar_bbox(
            track["boundingBox"],
            raw_item["boundingBox"],
            bbox_tolerance,
        ) and not is_stable_scaling:
            continue

        text_score = max(
            text_similarity,
            _progressive_text_score() if is_progressive_text else 0.0,
            _track_related_text_threshold() if is_related_text else 0.0,
            0.7 if is_strong_bbox_match else 0.0,
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


def _is_accumulative_track_text_change(
    track_text: str,
    raw_text: str,
    *,
    is_progressive_text: bool,
) -> bool:
    if is_progressive_text:
        return False

    track_compact = _compact_text(track_text)
    raw_compact = _compact_text(raw_text)
    if not track_compact or not raw_compact:
        return False

    shorter_length = min(len(track_compact), len(raw_compact))
    longer_length = max(len(track_compact), len(raw_compact))
    if shorter_length < 8:
        return False

    if longer_length <= shorter_length * _max_text_growth_ratio():
        return False

    return _text_similarity(track_text, raw_text) < _track_text_stability_threshold()


def _is_strong_bbox_track_match(
    bbox_overlap: float,
    bbox_containment: float,
) -> bool:
    return (
        bbox_overlap >= _track_strong_bbox_iou_threshold()
        or bbox_containment >= _track_strong_bbox_containment_threshold()
    )


def _is_related_ocr_text_pair(left: str, right: str) -> bool:
    left_normalized = _normalize_text(left)
    right_normalized = _normalize_text(right)
    if not left_normalized or not right_normalized:
        return False

    if _is_progressive_text_pair(left_normalized, right_normalized):
        return True

    if _similarity(left_normalized, right_normalized) >= _track_related_text_threshold():
        return True

    left_tokens = _meaningful_text_tokens(left_normalized)
    right_tokens = _meaningful_text_tokens(right_normalized)
    if not left_tokens or not right_tokens:
        return False

    overlap_count = len(left_tokens & right_tokens)
    shorter_token_count = min(len(left_tokens), len(right_tokens))
    return overlap_count / shorter_token_count >= _track_token_overlap_threshold()


def _meaningful_text_tokens(text: str) -> set[str]:
    return {
        _normalize_token(token)
        for token in text.replace("\n", " ").split()
        if len(_normalize_token(token)) >= 2
    }


def _is_stable_bbox_track_match(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    return (
        _is_stable_bbox_center_match(left, right)
        and _is_stable_bbox_size_match(left, right)
    )


def _is_stable_bbox_center_match(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    center_x_distance = abs(_bbox_center_x(left) - _bbox_center_x(right))
    center_y_distance = abs(_bbox_center_y(left) - _bbox_center_y(right))
    max_width = max(left.w, right.w)
    max_height = max(left.h, right.h)
    return (
        center_x_distance
        <= max(_track_stable_center_distance_min(), max_width * _track_stable_center_distance_ratio())
        and center_y_distance
        <= max(_track_stable_center_distance_min(), max_height * _track_stable_center_distance_ratio())
    )


def _is_stable_bbox_size_match(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    width_ratio = _bbox_size_ratio(left.w, right.w)
    height_ratio = _bbox_size_ratio(left.h, right.h)
    return (
        width_ratio >= _track_stable_size_change_ratio()
        and height_ratio >= _track_stable_size_change_ratio()
    )


def _bbox_size_ratio(left_size: float, right_size: float) -> float:
    larger_size = max(left_size, right_size)
    if larger_size <= 0:
        return 0.0

    return min(left_size, right_size) / larger_size


def _is_stable_scaling_match(
    left: BoundingBox,
    right: BoundingBox,
) -> bool:
    center_x_distance = abs(_bbox_center_x(left) - _bbox_center_x(right))
    center_y_distance = abs(_bbox_center_y(left) - _bbox_center_y(right))
    max_height = max(left.h, right.h)
    max_width = max(left.w, right.w)
    max_center_x_distance = max(
        _track_center_distance_min(),
        max_width * _track_center_distance_ratio(),
    )
    max_center_y_distance = max(
        _track_center_distance_min(),
        max_height * _track_center_distance_ratio(),
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
        center_x_distance <= max_width * _duplicate_center_distance_ratio()
        and center_y_distance <= max_height * _duplicate_center_distance_ratio()
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
