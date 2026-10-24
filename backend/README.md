# Bilingual Reader – Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # điền DEEPSEEK_API_KEY
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# Swagger UI: http://127.0.0.1:8000/docs
python -m tests.smoke_test    # chạy thử end-to-end (không gọi DeepSeek thật)
```
