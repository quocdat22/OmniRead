"""Client DeepSeek (OpenAI-compatible) cho dịch Anh -> Việt, có retry + phân loại lỗi."""
from __future__ import annotations

import asyncio
import random

from openai import (
    APIConnectionError,
    APIStatusError,
    AsyncOpenAI,
    AuthenticationError,
    InternalServerError,
    PermissionDeniedError,
    RateLimitError,
)

from app.config import settings

SYSTEM_PROMPT = """Bạn là dịch giả chuyên nghiệp, dịch sách từ tiếng Anh sang tiếng Việt.
Quy tắc:
- Dịch đúng nghĩa, văn phong tự nhiên, mạch lạc như sách tiếng Việt đã xuất bản.
- Giữ nguyên tên riêng, thương hiệu, mã code, URL, số liệu.
- Giữ nguyên ký hiệu đầu dòng/đánh số nếu có.
- Nếu đoạn văn chỉ gồm số, ký hiệu hoặc không cần dịch, trả lại nguyên văn.
- CHỈ trả về bản dịch: không giải thích, không ghi chú, không bao quanh bằng dấu ngoặc kép."""


class TranslationError(Exception):
    """Lỗi của riêng một block (block đó -> status=error)."""


class FatalTranslationError(TranslationError):
    """Lỗi làm hỏng cả job (sai key, hết tiền...) -> dừng toàn bộ worker."""


class Translator:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(
            api_key=settings.deepseek_api_key or "missing",
            base_url=settings.deepseek_base_url,
            timeout=settings.request_timeout,
            max_retries=0,  # tự retry bên dưới để kiểm soát backoff
        )

    async def translate(self, text: str) -> str:
        if not settings.deepseek_api_key:
            raise FatalTranslationError("Chưa cấu hình DEEPSEEK_API_KEY trong file .env")

        delay = 1.5
        for attempt in range(1, settings.max_retries + 1):
            try:
                resp = await self._client.chat.completions.create(
                    model=settings.deepseek_model,
                    temperature=settings.deepseek_temperature,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text},
                    ],
                )
                out = (resp.choices[0].message.content or "").strip()
                if not out:
                    raise TranslationError("DeepSeek trả về nội dung rỗng")
                return out
            except (AuthenticationError, PermissionDeniedError) as e:
                raise FatalTranslationError(f"API key sai hoặc không có quyền: {e}") from e
            except (RateLimitError, APIConnectionError, InternalServerError) as e:
                if attempt == settings.max_retries:
                    raise TranslationError(f"Lỗi tạm thời, đã thử {attempt} lần: {e}") from e
                await asyncio.sleep(delay + random.random())
                delay *= 2
            except APIStatusError as e:
                if e.status_code == 402:
                    raise FatalTranslationError("Tài khoản DeepSeek hết số dư (402)") from e
                raise TranslationError(f"API trả lỗi {e.status_code}: {e}") from e
        raise TranslationError("Không dịch được")  # không tới đây, để type-checker yên tâm
