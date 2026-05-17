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
                                "maxItems": max_contents,
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
        "Use SUMMARY for one concise video or section summary. "
        "Use EXPRESSION for idioms, natural phrases, repeated sentence patterns, or expressions that need context. "
        "For EXPRESSION content, include literal meaning, actual meaning, natural translation, and usage context when relevant. "
        "Use KEYWORD only for a small number of repeated or theme-critical words, not every vocabulary item. "
        "Set textType to ORIGINAL because the generated learning contents are matched against the original subtitle text. "
        "For KEYWORD and EXPRESSION, set title to the original word or phrase from the source text, "
        "and use startTime and endTime from the most relevant segment. "
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
        if text_type not in {"ORIGINAL", "TRANSLATION"}:
            text_type = "ORIGINAL"
        if not title or not content:
            continue

        contents.append(
            LearningContent(
                content_type=LearningContentType(content_type),
                text_type=text_type,
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


def _build_fallback_summary(subtitles: list[SubtitleSegment]) -> LearningContent:
    preview_text = " ".join(subtitle.translated_text or subtitle.text for subtitle in subtitles[:5])
    if len(preview_text) > 220:
        preview_text = f"{preview_text[:217].rstrip()}..."

    return LearningContent(
        content_type=LearningContentType.SUMMARY,
        text_type="ORIGINAL",
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
                text_type="ORIGINAL",
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
    for subtitle in subtitles:
        text = subtitle.text.strip()
        word_count = len(_extract_words(text))
        if word_count < 4 or len(text) < 16:
            continue

        expressions.append(
            LearningContent(
                content_type=LearningContentType.EXPRESSION,
                text_type="ORIGINAL",
                title=text[:80],
                content=(
                    "Useful sentence-level expression for video study. "
                    "Review the sentence meaning, natural phrasing, and usage context. "
                    f"Translation: {subtitle.translated_text or 'No translation available'}"
                ),
                start_time=subtitle.start_time,
                end_time=subtitle.end_time,
            )
        )
        if len(expressions) >= 3:
            break

    return expressions


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
