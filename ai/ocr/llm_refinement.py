from __future__ import annotations

import json
import os
from typing import Any

from ai.api.schemas import OcrItem, OcrLine
from ai.translation.service import (
    DEFAULT_REQUEST_TIMEOUT_SECONDS,
    OPENAI_RESPONSES_URL,
    _extract_response_text,
    _post_openai_response,
)

DEFAULT_OCR_REFINEMENT_MODEL = "gpt-5.2"
DEFAULT_OCR_REFINEMENT_MAX_ITEMS = 80


def refine_ocr_items_with_llm(
    ocr_items: list[OcrItem],
    *,
    source_language: str | None,
) -> list[OcrItem]:
    if not _is_enabled() or not ocr_items:
        return ocr_items

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return ocr_items

    refined_items: list[OcrItem] = []
    max_items = _max_items()
    for offset in range(0, len(ocr_items), max_items):
        chunk = ocr_items[offset : offset + max_items]
        refined_items.extend(
            _refine_ocr_chunk(
                api_key,
                chunk,
                source_language=source_language,
                index_offset=offset,
            )
        )

    return refined_items


def _refine_ocr_chunk(
    api_key: str,
    ocr_items: list[OcrItem],
    *,
    source_language: str | None,
    index_offset: int,
) -> list[OcrItem]:
    response_data = _post_openai_response(
        api_key,
        {
            "model": _model(),
            "instructions": _build_instructions(source_language),
            "input": json.dumps(
                {
                    "items": [
                        _serialize_ocr_item(index_offset + index, item)
                        for index, item in enumerate(ocr_items)
                    ],
                },
                ensure_ascii=False,
            ),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "ocr_refinement",
                    "strict": True,
                    "schema": _response_schema(),
                }
            },
        },
        timeout_seconds=_request_timeout_seconds(),
    )
    output_text = _extract_response_text(response_data)
    try:
        parsed_output = json.loads(output_text)
    except json.JSONDecodeError as error:
        raise RuntimeError("OpenAI OCR refinement response is not valid JSON") from error

    decisions = parsed_output.get("items")
    if not isinstance(decisions, list):
        raise RuntimeError("OpenAI OCR refinement response did not include items")

    decision_by_index = {
        int(decision["index"]): decision
        for decision in decisions
        if isinstance(decision, dict) and "index" in decision
    }
    refined_items: list[OcrItem] = []
    for index, item in enumerate(ocr_items):
        absolute_index = index_offset + index
        decision = decision_by_index.get(absolute_index)
        if decision is None:
            refined_items.append(item)
            continue

        if not bool(decision.get("keep", True)):
            continue

        refined_text = str(decision.get("originText") or item.origin_text).strip()
        if refined_text:
            item.origin_text = refined_text
            item.lines = _resolve_refined_lines(item, refined_text)

        refined_items.append(item)

    return refined_items


def _serialize_ocr_item(index: int, item: OcrItem) -> dict[str, Any]:
    return {
        "index": index,
        "originText": item.origin_text,
        "confidence": item.confidence,
        "startTime": item.start_time,
        "endTime": item.end_time,
        "boundingBox": item.bounding_box.model_dump(by_alias=True),
    }


def _resolve_refined_lines(item: OcrItem, refined_text: str) -> list[OcrLine]:
    refined_lines = [line.strip() for line in refined_text.splitlines() if line.strip()]
    if not refined_lines:
        return item.lines

    if item.lines and len(item.lines) == len(refined_lines):
        return [
            OcrLine(origin_text=line_text, bounding_box=line.bounding_box)
            for line_text, line in zip(refined_lines, item.lines)
        ]

    return [OcrLine(origin_text=refined_text, bounding_box=item.bounding_box)]


def _build_instructions(source_language: str | None) -> str:
    source = source_language or "unknown"
    return (
        "You clean OCR outputs for a video translation and learning service. "
        f"The source language hint is {source}. "
        "Return one decision for every input item using the same index. "
        "Drop only OCR noise, UI promotion text, channel subscribe prompts, random "
        "symbols, broken gibberish, repeated duplicate fragments, or text that is "
        "clearly not meaningful screen content. "
        "Keep meaningful titles, captions, labels, names, numbers with context, and "
        "short intentional UI words such as OK, No, Yes, MIN when they are meaningful. "
        "For kept items, clean only obvious OCR spacing, punctuation, or duplicated "
        "token errors. Do not translate. Do not invent missing text. "
        "Return only JSON matching the schema."
    )


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "index": {"type": "integer"},
                        "keep": {"type": "boolean"},
                        "originText": {"type": "string"},
                    },
                    "required": ["index", "keep", "originText"],
                },
            }
        },
        "required": ["items"],
    }


def _is_enabled() -> bool:
    return str(os.getenv("AI_OCR_LLM_REFINEMENT_ENABLED", "false")).lower() in {
        "1",
        "true",
        "yes",
        "y",
        "on",
    }


def _model() -> str:
    return os.getenv("OPENAI_OCR_REFINEMENT_MODEL", DEFAULT_OCR_REFINEMENT_MODEL)


def _max_items() -> int:
    try:
        return max(
            1,
            int(
                os.getenv(
                    "OPENAI_OCR_REFINEMENT_MAX_ITEMS",
                    DEFAULT_OCR_REFINEMENT_MAX_ITEMS,
                )
            ),
        )
    except ValueError:
        return DEFAULT_OCR_REFINEMENT_MAX_ITEMS


def _request_timeout_seconds() -> int:
    try:
        return int(
            os.getenv(
                "OPENAI_REQUEST_TIMEOUT_SECONDS",
                str(DEFAULT_REQUEST_TIMEOUT_SECONDS),
            )
        )
    except ValueError:
        return DEFAULT_REQUEST_TIMEOUT_SECONDS
