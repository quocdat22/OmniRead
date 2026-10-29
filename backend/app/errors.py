from __future__ import annotations

from enum import Enum
from typing import Any
from fastapi import HTTPException


class ErrorCode(str, Enum):
    # File & upload errors
    INVALID_FILE_TYPE = "INVALID_FILE_TYPE"
    INVALID_PDF_FORMAT = "INVALID_PDF_FORMAT"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_EMPTY = "FILE_EMPTY"
    BOOK_ALREADY_EXISTS = "BOOK_ALREADY_EXISTS"
    BOOK_NOT_FOUND = "BOOK_NOT_FOUND"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    BOOK_PARSING = "BOOK_PARSING"
    PAGE_NOT_FOUND = "PAGE_NOT_FOUND"

    # PDF parsing errors
    PDF_NO_TEXT_LAYER = "PDF_NO_TEXT_LAYER"
    PDF_OPEN_ERROR = "PDF_OPEN_ERROR"
    PDF_PASSWORD_PROTECTED = "PDF_PASSWORD_PROTECTED"
    PDF_EMPTY = "PDF_EMPTY"
    NO_PARAGRAPHS_FOUND = "NO_PARAGRAPHS_FOUND"

    # Translation errors
    DEEPSEEK_KEY_MISSING = "DEEPSEEK_KEY_MISSING"
    DEEPSEEK_QUOTA_EXCEEDED = "DEEPSEEK_QUOTA_EXCEEDED"
    DEEPSEEK_AUTH_ERROR = "DEEPSEEK_AUTH_ERROR"
    TRANSLATION_EMPTY = "TRANSLATION_EMPTY"
    TRANSLATION_FAILED = "TRANSLATION_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


def api_error(
    status_code: int,
    code: ErrorCode | str,
    message: str,
    **extra: Any,
) -> HTTPException:
    """Helper creating standardized HTTPException response with code and message."""
    detail = {
        "code": str(code.value if isinstance(code, ErrorCode) else code),
        "message": message,
        **extra,
    }
    return HTTPException(status_code=status_code, detail=detail)
