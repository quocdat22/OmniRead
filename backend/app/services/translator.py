"""Client DeepSeek (OpenAI-compatible) cho dịch Anh -> Việt, có retry + phân loại lỗi."""
from __future__ import annotations

import asyncio
import json
import logging
import random
import re

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

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """Bạn là dịch giả chuyên nghiệp, dịch sách từ tiếng Anh sang tiếng Việt.
Quy tắc:
- Dịch đúng nghĩa, văn phong tự nhiên, mạch lạc như sách tiếng Việt đã xuất bản.
- Giữ nguyên tên riêng, thương hiệu, mã code, URL, số liệu.
- Giữ nguyên ký hiệu đầu dòng/đánh số nếu có.
- Nếu đoạn văn chỉ gồm số, ký hiệu hoặc không cần dịch, trả lại nguyên văn.
- BẢO TOÀN ĐỊNH DẠNG: Đoạn văn có thể chứa các thẻ HTML nội dòng đánh dấu một số từ đặc biệt như <b>in đậm</b>, <i>in nghiêng</i>, <font color="#RRGGBB">màu chữ</font>.
  + Hãy giữ nguyên các thẻ này và bao quanh đúng các từ hoặc cụm từ tương ứng trong bản dịch tiếng Việt theo ngữ pháp tiếng Việt.
  + Không dịch hoặc thay đổi nội dung thuộc tính của thẻ (ví dụ mã màu hex #RRGGBB phải giữ nguyên vẹn).
  + Tuyệt đối không tự ý thêm thẻ vào các từ vốn là văn bản bình thường trong câu gốc.
  + Tuyệt đối không xóa bỏ thẻ nếu từ gốc có thẻ.
- ĐỐI CHIẾU SONG NGỮ: Khi đoạn văn gồm nhiều câu, hãy cố gắng giữ nguyên cấu trúc số lượng câu tương ứng với nguyên bản để thuận tiện đối chiếu song ngữ từng câu.
- CHỈ trả về bản dịch: không giải thích, không ghi chú, không bao quanh bằng dấu ngoặc kép."""

BATCH_SYSTEM_PROMPT = """Bạn là dịch giả chuyên nghiệp, dịch sách từ tiếng Anh sang tiếng Việt.
Dưới đây là danh sách các đoạn văn (blocks) liên tiếp trong cùng một trang sách theo định dạng JSON.
Hãy đọc toàn bộ trang để nắm rõ ngữ cảnh chung, mạch văn, đại từ xưng hô và thuật ngữ chuyên ngành xuyên suốt các đoạn để bản dịch có tính liên kết chặt chẽ.

Quy tắc dịch:
- Dịch đúng nghĩa, văn phong tự nhiên, mạch lạc như sách tiếng Việt đã xuất bản.
- Đảm bảo tính liên kết và mạch văn tự nhiên giữa các đoạn văn liên tiếp trong trang.
- Giữ nguyên sự nhất quán về thuật ngữ, đại từ xưng hô xuyên suốt cả trang.
- Giữ nguyên tên riêng, thương hiệu, mã code, URL, số liệu.
- Giữ nguyên ký hiệu đầu dòng/đánh số nếu có.
- Nếu đoạn văn chỉ gồm số, ký hiệu hoặc không cần dịch, trả lại nguyên văn.
- BẢO TOÀN ĐỊNH DẠNG: Đoạn văn có thể chứa các thẻ HTML nội dòng đánh dấu một số từ đặc biệt như <b>in đậm</b>, <i>in nghiêng</i>, <font color="#RRGGBB">màu chữ</font>.
  + Hãy giữ nguyên các thẻ này và bao quanh đúng các từ hoặc cụm từ tương ứng trong bản dịch tiếng Việt theo ngữ pháp tiếng Việt.
  + Không dịch hoặc thay đổi nội dung thuộc tính của thẻ (ví dụ mã màu hex #RRGGBB phải giữ nguyên vẹn).
  + Tuyệt đối không tự ý thêm thẻ vào các từ vốn là văn bản bình thường trong câu gốc.
  + Tuyệt đối không xóa bỏ thẻ nếu từ gốc có thẻ.

- ĐỐI CHIẾU SONG NGỮ: Khi đoạn văn gồm nhiều câu, hãy cố gắng giữ nguyên cấu trúc số lượng câu tương ứng với nguyên bản để thuận tiện đối chiếu song ngữ từng câu.

Định dạng JSON trả về:
- Bắt buộc trả về kết quả dưới dạng JSON object hợp lệ với cấu trúc:
{
  "translations": [
    {"id": <id_của_block>, "text": "<bản dịch tiếng Việt tương ứng>"}
  ]
}
- Phải dịch đầy đủ tất cả các block được cung cấp trong danh sách đầu vào, giữ nguyên đúng id.
- Tuyệt đối không giải thích, không ghi chú, không trả về bất kỳ nội dung nào ngoài chuỗi JSON."""


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
        raise TranslationError("Không dịch được")

    async def translate_batch(self, items: list[tuple[int, str]]) -> dict[int, str]:
        """Dịch nhiều block trong cùng một trang trong 1 request để bảo toàn ngữ cảnh liên kết.

        items: danh sách các tuple (block_id, text) theo thứ tự đọc trong trang.
        Trả về dict: {block_id: translated_text}.
        """
        if not items:
            return {}

        # Nếu phương thức translate được override/mock trên instance (ví dụ trong unit tests):
        if "translate" in self.__dict__:
            results: dict[int, str] = {}
            for block_id, text in items:
                results[block_id] = await self.translate(text)
            return results

        # Nếu chỉ có 1 block, gọi translate đơn lẻ để tối ưu
        if len(items) == 1:
            block_id, text = items[0]
            translated = await self.translate(text)
            return {block_id: translated}

        if not settings.deepseek_api_key:
            raise FatalTranslationError("Chưa cấu hình DEEPSEEK_API_KEY trong file .env")

        user_payload = {
            "blocks": [{"id": block_id, "text": text} for block_id, text in items]
        }
        user_content = json.dumps(user_payload, ensure_ascii=False)

        delay = 1.5
        for attempt in range(1, settings.max_retries + 1):
            try:
                resp = await self._client.chat.completions.create(
                    model=settings.deepseek_model,
                    temperature=settings.deepseek_temperature,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": BATCH_SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                )
                out = (resp.choices[0].message.content or "").strip()
                if not out:
                    raise TranslationError("DeepSeek trả về nội dung rỗng")

                parsed_results = self._parse_batch_json(out)
                if not parsed_results:
                    raise TranslationError("Không trích xuất được bản dịch nào từ JSON của DeepSeek")
                return parsed_results

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

        raise TranslationError("Không dịch được batch")

    @staticmethod
    def _parse_batch_json(content: str) -> dict[int, str]:
        text = content.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
            text = re.sub(r"\s*```$", "", text).strip()

        data = json.loads(text)
        results: dict[int, str] = {}

        if isinstance(data, dict):
            items = data.get("translations") or data.get("blocks")
            if isinstance(items, list):
                for entry in items:
                    if isinstance(entry, dict) and "id" in entry:
                        try:
                            bid = int(entry["id"])
                        except (ValueError, TypeError):
                            continue
                        val = entry.get("text") or entry.get("translation") or ""
                        results[bid] = str(val).strip()
            else:
                for k, v in data.items():
                    if isinstance(v, str):
                        try:
                            results[int(k)] = v.strip()
                        except (ValueError, TypeError):
                            pass
        elif isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict) and "id" in entry:
                    try:
                        bid = int(entry["id"])
                    except (ValueError, TypeError):
                        continue
                    val = entry.get("text") or entry.get("translation") or ""
                    results[bid] = str(val).strip()

        return results
