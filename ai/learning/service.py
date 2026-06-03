from __future__ import annotations

import json
import os
import re
from collections import Counter
import urllib.error
import urllib.request

from ai.api.schemas import (
    LearningContent,
    LearningContentType,
    LearningData,
    SelectedTextType,
    SubtitleSegment,
)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.2"
DEFAULT_MAX_SEGMENTS = 40
DEFAULT_MAX_CONTENTS = 10

_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "has",
    "have",
    "he",
    "her",
    "his",
    "i",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "she",
    "that",
    "the",
    "their",
    "they",
    "this",
    "to",
    "was",
    "we",
    "were",
    "with",
    "you",
    "your",
}

_COMMON_WORDS = {
    "again",
    "better",
    "come",
    "could",
    "every",
    "first",
    "good",
    "great",
    "just",
    "know",
    "like",
    "look",
    "make",
    "many",
    "more",
    "much",
    "need",
    "only",
    "really",
    "right",
    "same",
    "some",
    "take",
    "than",
    "then",
    "thing",
    "think",
    "time",
    "very",
    "want",
    "well",
    "what",
    "when",
    "where",
    "will",
    "would",
}

EXPRESSION_CONTENT_LABELS = (
    "직역",
    "실제 의미",
    "자연스러운 번역",
    "사용 상황",
    "원문 표현",
)
EXPRESSION_CONTENT_LABEL_ALIASES = {
    "literal": "직역",
    "literal meaning": "직역",
    "direct translation": "직역",
    "직역": "직역",
    "actual meaning": "실제 의미",
    "real meaning": "실제 의미",
    "meaning": "실제 의미",
    "의미": "실제 의미",
    "실제 의미": "실제 의미",
    "natural translation": "자연스러운 번역",
    "natural meaning": "자연스러운 번역",
    "translation": "자연스러운 번역",
    "자연스러운 번역": "자연스러운 번역",
    "usage": "사용 상황",
    "usage context": "사용 상황",
    "context": "사용 상황",
    "문맥": "사용 상황",
    "사용 상황": "사용 상황",
    "source expression": "원문 표현",
    "original expression": "원문 표현",
    "original phrase": "원문 표현",
    "원문 표현": "원문 표현",
}


def generate_learning_data(
    subtitles: list[SubtitleSegment],
    source_language: str | None,
    target_language: str | None,
) -> LearningData | None:
    source_subtitles = [subtitle for subtitle in subtitles if subtitle.text.strip()]
    if not source_subtitles:
        return None

    if os.getenv("OPENAI_API_KEY"):
        return _generate_with_openai(
            source_subtitles,
            source_language=source_language,
            target_language=target_language,
        )

    return _generate_fallback(source_subtitles)


def _generate_with_openai(
    subtitles: list[SubtitleSegment],
    source_language: str | None,
    target_language: str | None,
) -> LearningData:
    max_segments = int(os.getenv("OPENAI_LEARNING_MAX_SEGMENTS", DEFAULT_MAX_SEGMENTS))
    max_contents = int(os.getenv("OPENAI_LEARNING_MAX_CONTENTS", DEFAULT_MAX_CONTENTS))
    schema_max_contents = max(max_contents, 8)
    model = os.getenv("OPENAI_LEARNING_MODEL", DEFAULT_OPENAI_MODEL)
    api_key = os.environ["OPENAI_API_KEY"]

    selected_subtitles = subtitles[: max(max_segments, 1)]
    response_data = _post_openai_response(
        api_key,
        {
            "model": model,
            "instructions": _build_learning_instructions(
                source_language,
                target_language,
                max_contents=max_contents,
            ),
            "input": json.dumps(
                {
                    "segments": [
                        {
                            "seq": subtitle.seq,
                            "startTime": subtitle.start_time,
                            "endTime": subtitle.end_time,
                            "text": subtitle.text,
                            "translatedText": subtitle.translated_text,
                            "languageCode": subtitle.language_code,
                        }
                        for subtitle in selected_subtitles
                    ]
                },
                ensure_ascii=False,
            ),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "learning_contents",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "contents": {
                                "type": "array",
                                "maxItems": schema_max_contents,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "contentType": {
                                            "type": "string",
                                            "enum": [
                                                "KEYWORD",
                                                "SUMMARY",
                                                "EXPRESSION",
                                            ],
                                        },
                                        "textType": {
                                            "type": "string",
                                            "enum": [
                                                "ORIGINAL",
                                                "TRANSLATION",
                                            ],
                                        },
                                        "title": {"type": "string"},
                                        "content": {"type": "string"},
                                        "startTime": {
                                            "type": ["number", "null"],
                                        },
                                        "endTime": {
                                            "type": ["number", "null"],
                                        },
                                    },
                                    "required": [
                                        "contentType",
                                        "textType",
                                        "title",
                                        "content",
                                        "startTime",
                                        "endTime",
                                    ],
                                },
                            }
                        },
                        "required": ["contents"],
                    },
                }
            },
        },
    )
    output_text = _extract_response_text(response_data)

    try:
        parsed_output = json.loads(output_text)
    except json.JSONDecodeError as error:
        raise RuntimeError("OpenAI learning response is not valid JSON") from error

    return _parse_learning_data(parsed_output)


def _build_learning_instructions(
    source_language: str | None,
    target_language: str | None,
    max_contents: int,
) -> str:
    source = _language_name(source_language) if source_language else "the source language"
    target = _language_name(target_language) if target_language else "Korean"
    return (
        "You generate learning helper data for a video language learning service. "
        f"The learner studies {source}, and explanations should be written in {target}. "
        "Create only precomputed video-level learning contents. "
        "Do not create on-click word explanations, pronunciation, related words, or example sentences. "
        "Those are generated later by an on-demand word explanation API. "
        "Use SUMMARY for one concise video or section summary and set textType to ORIGINAL. "
        "Use EXPRESSION for idioms, natural phrases, repeated sentence patterns, or expressions that need context. "
        "For every EXPRESSION content, use this exact newline-separated format with Korean bracket labels and no extra labels: "
        "'[직역] ...\\n[실제 의미] ...\\n[자연스러운 번역] ...\\n[사용 상황] ...\\n[원문 표현] ...'. "
        "The labels must be written in Korean exactly as [직역], [실제 의미], [자연스러운 번역], [사용 상황], [원문 표현]. "
        "Do not use English labels such as [literal meaning], [actual meaning], [usage], or colon labels. "
        "If a field is not applicable, write '해당 없음' after the Korean bracket label. "
        "Create ORIGINAL EXPRESSION items from the source text. "
        "When translatedText is present, you must create at least two EXPRESSION items with textType TRANSLATION using translated phrases from translatedText as title. "
        "TRANSLATION items are required so learners can select translated sentence words and still receive expression guidance. "
        "For TRANSLATION EXPRESSION items, the 원문 표현 field must contain the matching original source expression. "
        "Use KEYWORD only for a small number of repeated or theme-critical source words, not every vocabulary item, and set textType to ORIGINAL. "
        "For KEYWORD and EXPRESSION, set title to the original word or phrase from the source text, "
        "except TRANSLATION items must set title to the translated phrase from translatedText. "
        "Use startTime and endTime from the most relevant segment. "
        "For SUMMARY, use title 'Summary' and set startTime and endTime to null. "
        f"Return at most {max_contents} contents. "
        "Return only JSON that matches the schema. Do not include markdown or extra fields."
    )


def _parse_learning_data(data: dict) -> LearningData:
    raw_contents = data.get("contents", [])
    if not isinstance(raw_contents, list):
        raise RuntimeError("OpenAI learning response contents must be a list")

    contents: list[LearningContent] = []
    for item in raw_contents:
        if not isinstance(item, dict):
            continue

        content_type = item.get("contentType")
        text_type = item.get("textType") or "ORIGINAL"
        title = str(item.get("title", "")).strip()
        content = str(item.get("content", "")).strip()
        if content_type not in {content_type.value for content_type in LearningContentType}:
            continue
        valid_text_types = {selected_type.value for selected_type in SelectedTextType}
        if text_type not in valid_text_types:
            text_type = SelectedTextType.ORIGINAL.value
        if not title or not content:
            continue
        if content_type == LearningContentType.EXPRESSION.value:
            content = _normalize_expression_content(
                content,
                title=title,
                text_type=SelectedTextType(text_type),
            )

        contents.append(
            LearningContent(
                content_type=LearningContentType(content_type),
                text_type=SelectedTextType(text_type),
                title=title,
                content=content,
                start_time=_optional_round_time(item.get("startTime")),
                end_time=_optional_round_time(item.get("endTime")),
            )
        )

    return LearningData(contents=contents)


def _generate_fallback(subtitles: list[SubtitleSegment]) -> LearningData:
    contents = [_build_fallback_summary(subtitles)]
    contents.extend(_build_fallback_expressions(subtitles))
    contents.extend(_build_fallback_keywords(subtitles))
    return LearningData(contents=contents)


def _normalize_expression_content(
    content: str,
    title: str,
    text_type: SelectedTextType,
) -> str:
    values = _parse_labeled_expression_content(content)
    if values:
        return _format_expression_content(
            literal_meaning=values.get("직역") or "해당 없음",
            actual_meaning=values.get("실제 의미") or values.get("의미") or content,
            natural_translation=values.get("자연스러운 번역") or title,
            usage_context=values.get("사용 상황") or values.get("문맥") or content,
            original_expression=values.get("원문 표현")
            or ("해당 없음" if text_type == SelectedTextType.ORIGINAL else content),
        )

    return _format_expression_content(
        literal_meaning="해당 없음",
        actual_meaning=content,
        natural_translation=title,
        usage_context=content,
        original_expression="해당 없음"
        if text_type == SelectedTextType.ORIGINAL
        else content,
    )


def _parse_labeled_expression_content(content: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        bracket_match = re.match(r"^\[(?P<label>[^\]]+)\]\s*(?P<value>.*)$", line)
        if bracket_match:
            normalized_label = bracket_match.group("label").strip()
            value = bracket_match.group("value").strip()
        elif ":" in line:
            label, value = line.split(":", 1)
            normalized_label = label.strip()
            value = value.strip()
        else:
            continue

        korean_label = _normalize_expression_label(normalized_label)
        if korean_label in EXPRESSION_CONTENT_LABELS:
            values[korean_label] = value

    return values


def _normalize_expression_label(label: str) -> str:
    normalized_label = " ".join(label.strip().lower().split())
    return EXPRESSION_CONTENT_LABEL_ALIASES.get(normalized_label, label.strip())


def _format_expression_content(
    literal_meaning: str,
    actual_meaning: str,
    natural_translation: str,
    usage_context: str,
    original_expression: str,
) -> str:
    return "\n".join(
        [
            f"[직역] {_normalize_expression_field(literal_meaning)}",
            f"[실제 의미] {_normalize_expression_field(actual_meaning)}",
            f"[자연스러운 번역] {_normalize_expression_field(natural_translation)}",
            f"[사용 상황] {_normalize_expression_field(usage_context)}",
            f"[원문 표현] {_normalize_expression_field(original_expression)}",
        ]
    )


def _normalize_expression_field(value: str | None) -> str:
    normalized_value = " ".join(str(value or "").split())
    return normalized_value or "해당 없음"


def _build_fallback_summary(subtitles: list[SubtitleSegment]) -> LearningContent:
    preview_text = " ".join(subtitle.translated_text or subtitle.text for subtitle in subtitles[:5])
    if len(preview_text) > 220:
        preview_text = f"{preview_text[:217].rstrip()}..."

    return LearningContent(
        content_type=LearningContentType.SUMMARY,
        text_type=SelectedTextType.ORIGINAL,
        title="Summary",
        content=preview_text or "Generated a learning summary from the video subtitles.",
        start_time=None,
        end_time=None,
    )


def _build_fallback_keywords(subtitles: list[SubtitleSegment]) -> list[LearningContent]:
    word_counts: Counter[str] = Counter()
    first_seen: dict[str, SubtitleSegment] = {}
    first_seen_index: dict[str, int] = {}
    occurrence_indices: dict[str, set[int]] = {}
    original_text: dict[str, str] = {}
    for subtitle_index, subtitle in enumerate(subtitles):
        for word in _extract_words(subtitle.text):
            normalized_word = word.lower()
            if normalized_word in _STOPWORDS or len(normalized_word) < 4:
                continue

            word_counts[normalized_word] += 1
            first_seen.setdefault(normalized_word, subtitle)
            first_seen_index.setdefault(normalized_word, subtitle_index)
            occurrence_indices.setdefault(normalized_word, set()).add(subtitle_index)
            original_text.setdefault(normalized_word, word)

    keywords = []
    for word, score in _rank_keyword_candidates(
        word_counts,
        first_seen_index,
        occurrence_indices,
    ):
        subtitle = first_seen[word]
        count = word_counts[word]
        keywords.append(
            LearningContent(
                content_type=LearningContentType.KEYWORD,
                text_type=SelectedTextType.ORIGINAL,
                title=original_text[word],
                content=(
                    "Core video keyword selected from repetition and learning relevance. "
                    f"Appears {count} time(s), relevance score {score:.1f}. "
                    f"Context: {subtitle.text}"
                ),
                start_time=subtitle.start_time,
                end_time=subtitle.end_time,
            )
        )
        if len(keywords) >= 5:
            break

    return keywords


def _rank_keyword_candidates(
    word_counts: Counter[str],
    first_seen_index: dict[str, int],
    occurrence_indices: dict[str, set[int]],
) -> list[tuple[str, float]]:
    ranked_words = []
    for word, count in word_counts.items():
        if count == 1 and len(word) < 7:
            continue

        frequency_score = min(count, 4) * 2.5
        difficulty_score = _difficulty_score(word)
        distribution_score = min(len(occurrence_indices.get(word, set())), 3) * 1.5
        early_context_score = 1.5 if first_seen_index.get(word, 999) <= 3 else 0.0
        common_word_penalty = 2.5 if word in _COMMON_WORDS else 0.0
        score = (
            frequency_score
            + difficulty_score
            + distribution_score
            + early_context_score
            - common_word_penalty
        )

        if score < 6.0:
            continue

        ranked_words.append((word, score))

    return sorted(
        ranked_words,
        key=lambda item: (item[1], word_counts[item[0]], len(item[0])),
        reverse=True,
    )


def _difficulty_score(word: str) -> float:
    length_score = min(max(len(word) - 4, 0) * 0.4, 3.0)
    morphology_score = 0.0
    if any(
        word.endswith(suffix)
        for suffix in (
            "tion",
            "sion",
            "ment",
            "ness",
            "able",
            "ible",
            "ally",
            "ing",
            "ed",
        )
    ):
        morphology_score += 1.0

    return length_score + morphology_score


def _build_fallback_expressions(subtitles: list[SubtitleSegment]) -> list[LearningContent]:
    expressions = []
    original_count = 0
    translation_count = 0
    for subtitle in subtitles:
        text = subtitle.text.strip()
        word_count = len(_extract_words(text))
        if word_count >= 4 and len(text) >= 16 and original_count < 3:
            expressions.append(
                LearningContent(
                    content_type=LearningContentType.EXPRESSION,
                    text_type=SelectedTextType.ORIGINAL,
                    title=text[:80],
                    content=_format_expression_content(
                        literal_meaning="해당 없음",
                        actual_meaning=(
                            "영상 문맥에서 통째로 이해하면 좋은 문장 단위 표현입니다."
                        ),
                        natural_translation=(
                            subtitle.translated_text or "No translation available"
                        ),
                        usage_context=(
                            "영상에서 실제로 사용된 문장 흐름과 함께 복습하기 적합합니다."
                        ),
                        original_expression=subtitle.text,
                    ),
                    start_time=subtitle.start_time,
                    end_time=subtitle.end_time,
                )
            )
            original_count += 1

        translated_text = (subtitle.translated_text or "").strip()
        if (
            translated_text
            and _is_useful_translated_expression(translated_text)
            and translation_count < 3
        ):
            expressions.append(
                LearningContent(
                    content_type=LearningContentType.EXPRESSION,
                    text_type=SelectedTextType.TRANSLATION,
                    title=translated_text[:80],
                    content=_format_expression_content(
                        literal_meaning="해당 없음",
                        actual_meaning=(
                            "번역문에서 자연스럽게 쓰인 표현으로 원문 의미를 학습할 수 있습니다."
                        ),
                        natural_translation=translated_text,
                        usage_context=(
                            "번역문을 선택했을 때 원문 표현과 연결해 설명하기 위한 학습 항목입니다."
                        ),
                        original_expression=subtitle.text,
                    ),
                    start_time=subtitle.start_time,
                    end_time=subtitle.end_time,
                )
            )
            translation_count += 1

        if original_count >= 3 and translation_count >= 3:
            break

    return expressions


def _is_useful_translated_expression(text: str) -> bool:
    compact_text = text.strip()
    if len(compact_text) < 8:
        return False

    if len(_extract_words(compact_text)) >= 3:
        return True

    # CJK translations often do not split by spaces, so use character length as a fallback.
    return len(compact_text) >= 12


def _extract_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z'-]*", text)


def _post_openai_response(
    api_key: str,
    payload: dict,
) -> dict:
    request = urllib.request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI learning request failed: {error_body}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"OpenAI learning request failed: {error}") from error


def _extract_response_text(response_data: dict) -> str:
    if isinstance(response_data.get("output_text"), str):
        return response_data["output_text"]

    for output_item in response_data.get("output", []):
        if output_item.get("type") != "message":
            continue

        for content_item in output_item.get("content", []):
            if content_item.get("type") == "output_text":
                return str(content_item.get("text", ""))

    raise RuntimeError("OpenAI learning response did not include output text")


def _language_name(language_code: str | None) -> str:
    names = {
        "ko": "Korean",
        "en": "English",
        "zh": "Chinese",
        "ja": "Japanese",
        "es": "Spanish",
        "fr": "French",
    }
    return names.get(language_code or "", language_code or "unknown language")


def _optional_round_time(value: object) -> float | None:
    if value is None:
        return None

    return round(float(value), 3)
