from __future__ import annotations


SUPPORTED_LANGUAGE_CODES = {
    "KO": "ko",
    "EN": "en",
    "ZH": "zh",
    "JA": "ja",
    "ES": "es",
    "FR": "fr",
}


def normalize_language_code(language_code: str) -> str:
    normalized_code = language_code.strip()
    if not normalized_code:
        raise ValueError("Language code must not be empty")

    upper_code = normalized_code.upper()
    if upper_code in SUPPORTED_LANGUAGE_CODES:
        return SUPPORTED_LANGUAGE_CODES[upper_code]

    lower_code = normalized_code.lower()
    if lower_code in SUPPORTED_LANGUAGE_CODES.values():
        return lower_code

    supported_codes = ", ".join(SUPPORTED_LANGUAGE_CODES.keys())
    raise ValueError(
        f"Unsupported language code: {language_code}. "
        f"Supported values are: {supported_codes}"
    )


def normalize_optional_language_code(language_code: str | None) -> str | None:
    if language_code is None:
        return None

    return normalize_language_code(language_code)
