from __future__ import annotations

import json
import os
from typing import Protocol
import urllib.error
import urllib.request

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-5.2"
DEFAULT_BATCH_SIZE = 20
DEFAULT_REQUEST_TIMEOUT_SECONDS = 180


class TranslationService(Protocol):
    def translate_batch(
        self,
        texts: list[str],
        source_language: str | None,
        target_language: str,
    ) -> list[str]:
        ...


class DevelopmentTranslationService:
    def translate_batch(
        self,
        texts: list[str],
        source_language: str | None,
        target_language: str,
    ) -> list[str]:
        return [
            _build_development_translation(text, source_language, target_language)
            for text in texts
        ]


class OpenAiTranslationService:
    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_OPENAI_MODEL,
        batch_size: int = DEFAULT_BATCH_SIZE,
        request_timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.batch_size = batch_size
        self.request_timeout_seconds = request_timeout_seconds

    def translate_batch(
        self,
        texts: list[str],
        source_language: str | None,
        target_language: str,
    ) -> list[str]:
        translations: list[str] = []
        for chunk in _chunk_texts(texts, self.batch_size):
            translations.extend(
                self._translate_chunk(chunk, source_language, target_language)
            )

        return translations

    def _translate_chunk(
        self,
        texts: list[str],
        source_language: str | None,
        target_language: str,
    ) -> list[str]:
        if not texts:
            return []

        response_data = _post_openai_response(
            self.api_key,
            {
                "model": self.model,
                "instructions": _build_translation_instructions(
                    source_language,
                    target_language,
                ),
                "input": json.dumps(
                    {"texts": texts},
                    ensure_ascii=False,
                ),
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "translation_batch",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "translations": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "minItems": len(texts),
                                    "maxItems": len(texts),
                                }
                            },
                            "required": ["translations"],
                        },
                    }
                },
            },
            timeout_seconds=self.request_timeout_seconds,
        )
        output_text = _extract_response_text(response_data)

        try:
            parsed_output = json.loads(output_text)
        except json.JSONDecodeError as error:
            raise RuntimeError("OpenAI translation response is not valid JSON") from error

        translations = parsed_output.get("translations")
        if not isinstance(translations, list) or len(translations) != len(texts):
            raise RuntimeError("OpenAI translation response count does not match input")

        return [str(translation) for translation in translations]


def create_translation_service(
    provider: object,
) -> TranslationService:
    provider_value = getattr(provider, "value", provider)

    if provider_value == "DEFAULT":
        return DevelopmentTranslationService()

    if provider_value == "OPENAI":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for OPENAI translation")

        model = os.getenv("OPENAI_TRANSLATION_MODEL", DEFAULT_OPENAI_MODEL)
        batch_size = int(os.getenv("OPENAI_TRANSLATION_BATCH_SIZE", DEFAULT_BATCH_SIZE))
        request_timeout_seconds = int(
            os.getenv(
                "OPENAI_REQUEST_TIMEOUT_SECONDS",
                DEFAULT_REQUEST_TIMEOUT_SECONDS,
            )
        )
        return OpenAiTranslationService(
            api_key=api_key,
            model=model,
            batch_size=batch_size,
            request_timeout_seconds=request_timeout_seconds,
        )

    raise NotImplementedError(f"{provider_value} translation provider is not implemented")


def _build_development_translation(
    text: str,
    source_language: str | None,
    target_language: str,
) -> str:
    source = source_language or "auto"
    return f"[{source}->{target_language}] {text}"


def _build_translation_instructions(
    source_language: str | None,
    target_language: str,
) -> str:
    source = _language_name(source_language) if source_language else "the detected language"
    target = _language_name(target_language)
    target_native_name = _language_native_name(target_language)
    return (
        "You are a translation engine for a video language learning service. "
        f"Translate each input text from {source} to {target}. "
        f"Every translation must be written only in {target} ({target_native_name}). "
        "Do not mix in any other language unless the input contains an untranslatable "
        "proper noun, brand name, title, or technical term. "
        "If a word can be naturally translated, translate it instead of preserving "
        "the source-language word. "
        "For subtitles, prefer short, natural, spoken-language phrasing that is easy "
        "to read on screen. "
        "For OCR text, preserve the meaning and concise label-like form of the source. "
        "Preserve numbers, symbols, product names, person names, and URLs as needed. "
        "Translate idioms by meaning rather than word-for-word. "
        "If the input is empty or whitespace, return an empty string for that item. "
        "Preserve the number and order of input texts exactly. "
        "Return only JSON that matches the provided schema. "
        "Do not add explanations, numbering, markdown, or extra fields."
    )


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


def _language_native_name(language_code: str | None) -> str:
    names = {
        "ko": "한국어",
        "en": "English",
        "zh": "中文",
        "ja": "日本語",
        "es": "español",
        "fr": "français",
    }
    return names.get(language_code or "", language_code or "unknown language")


def _post_openai_response(
    api_key: str,
    payload: dict,
    timeout_seconds: int,
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
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI translation request failed: {error_body}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"OpenAI translation request failed: {error}") from error
    except TimeoutError as error:
        raise RuntimeError(
            f"OpenAI translation request timed out after {timeout_seconds}s"
        ) from error


def _extract_response_text(response_data: dict) -> str:
    if isinstance(response_data.get("output_text"), str):
        return response_data["output_text"]

    for output_item in response_data.get("output", []):
        if output_item.get("type") != "message":
            continue

        for content_item in output_item.get("content", []):
            if content_item.get("type") == "output_text":
                return str(content_item.get("text", ""))

    raise RuntimeError("OpenAI translation response did not include output text")


def _chunk_texts(
    texts: list[str],
    batch_size: int,
) -> list[list[str]]:
    normalized_batch_size = max(batch_size, 1)
    return [
        texts[index : index + normalized_batch_size]
        for index in range(0, len(texts), normalized_batch_size)
    ]
