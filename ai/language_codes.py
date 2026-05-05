from __future__ import annotations


LANGUAGE_CODE_MAP = {
    "KO": "ko",
    "EN": "en",
    "ZH": "zh",
    "JA": "ja",
    "ES": "es",
    "FR": "fr",
}


def normalize_language_code(language_code: str | None) -> str | None:
    if language_code is None:
        return None

    normalized_key = language_code.strip()
    if not normalized_key:
        return None

    return LANGUAGE_CODE_MAP.get(normalized_key.upper(), normalized_key.lower())
