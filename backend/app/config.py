from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # --- DeepSeek (tương thích OpenAI API) ---
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_temperature: float = 1.3
    request_timeout: float = 90.0

    # --- Job dịch ---
    concurrency: int = 6  # số request song song tới DeepSeek
    max_retries: int = 4  # retry khi 429/5xx/mất kết nối

    # --- Lưu trữ / upload ---
    data_dir: Path = BASE_DIR / "data"
    max_upload_mb: int = 200

    # --- Parser ---
    # False = giữ thứ tự content stream của PDF (thường đúng thứ tự đọc, kể cả 2 cột).
    # True  = sắp xếp trên->dưới, trái->phải (sẽ xen kẽ các cột -> chỉ dùng cho PDF 1 cột lộn xộn).
    sort_blocks: bool = False
    margin_ratio: float = 0.09  # vùng đầu/cuối trang để dò header/footer/số trang

    cors_origins: str | list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("cors_origins")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            if v.strip() == "*":
                return ["*"]
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @property
    def pdf_dir(self) -> Path:
        return self.data_dir / "pdfs"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "reader.db"


settings = Settings()
