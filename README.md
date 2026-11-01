# OmniRead

Trình đọc sách PDF song ngữ Anh - Việt thông minh sử dụng AI (DeepSeek / OpenAI-compatible). Ứng dụng tự động phân tích bố cục PDF, trích xuất đoạn văn, dịch nền theo tiêu điểm đọc và hiển thị bản dịch tương tác ngay trên trang sách.

---

## Tính năng chính

- Phân tích PDF chuyên sâu (PyMuPDF): Trích xuất khối văn bản kèm tọa độ thực, lọc bỏ nhiễu biên (Header, Footer, số trang), xử lý nối dòng gãy và từ có dấu gạch nối, hỗ trợ ghép nối đoạn văn xuyên trang (continuation merge).
- Dịch thuật AI tối ưu (DeepSeek): Dịch từng đoạn giữ trọn ngữ cảnh; hàng đợi bất đồng bộ ưu tiên dịch các trang đang hiển thị (Dynamic Viewport Focus Priority); tự động thử lại khi gặp giới hạn tốc độ (Rate Limit).
- Trải nghiệm đọc trực quan: Hiển thị PDF sắc nét theo viewport bằng PDF.js, highlight khối văn bản và hiển thị popup bản dịch mượt mà. Thanh công cụ tinh gọn tự ẩn khi cuộn và sidebar điều hướng trang nhanh chóng.
- Đa ngôn ngữ và giao diện linh hoạt: Hỗ trợ chuyển đổi ngôn ngữ giao diện (Tiếng Việt / English), chế độ Sáng / Tối (Dark / Light mode), cùng trang Cài đặt tùy chỉnh cấu hình API và tham số dịch trực tiếp.
- Triển khai linh hoạt: Hỗ trợ chế độ Single-port SPA (FastAPI phục vụ cả Web và API trên cổng 8000), chế độ Dual-port cho lập trình viên (Vite HMR + FastAPI), và Docker Compose sẵn sàng cho production.

---

## Cấu trúc dự án

```text
OmniRead/
├── backend/                  # FastAPI Backend & SQLite
│   ├── app/
│   │   ├── api/              # REST endpoints và SSE progress
│   │   ├── services/         # Trích xuất PDF, Worker dịch thuật
│   │   ├── config.py         # Cấu hình hệ thống và biến môi trường
│   │   ├── db.py             # Cơ sở dữ liệu SQLite
│   │   └── main.py           # Khởi tạo FastAPI và phục vụ giao diện tĩnh
│   ├── data/                 # Thư mục lưu trữ cơ sở dữ liệu và file PDF
│   └── tests/                # Bộ kiểm thử tự động
├── frontend/                 # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/       # PdfPage, TranslationPopup, ReaderToolbar, v.v.
│   │   ├── pages/            # Library, Reader, Settings
│   │   ├── locales/          # Tệp dịch đa ngôn ngữ (vi, en)
│   │   └── hooks/            # Custom hooks (SSE progress, highlight style, v.v.)
│   └── package.json          # Cấu hình frontend dependencies
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Cấu hình Docker Compose
├── setup.sh                  # Script cài đặt môi trường tự động
├── dev.sh                    # Script chạy môi trường phát triển (Hot-reload)
├── start.sh                  # Script chạy bản hoàn chỉnh trên 1 cổng
└── package.json              # Quản lý script chung của toàn bộ dự án
```

---

## Cài đặt và Khởi chạy

### 1. Yêu cầu hệ thống

- Node.js >= 18
- Python >= 3.10 (khuyến nghị dùng uv hoặc venv)
- Docker và Docker Compose (tùy chọn)

### 2. Thiết lập môi trường nhanh

Chạy script cài đặt tự động (tạo môi trường ảo Python, cài đặt thư viện và build frontend):

```bash
./setup.sh
```

Cấu hình API Key trong file `backend/.env`:

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_TEMPERATURE=1.3
CONCURRENCY=6
```

Lưu ý: Nếu chưa cấu hình API Key, bạn vẫn có thể tải sách và đọc nội dung PDF gốc. Bạn cũng có thể cập nhật API Key trực tiếp trong trang Cài đặt trên giao diện web.

### 3. Chế độ phát triển (Development)

Khởi chạy đồng thời Backend (cổng 8000) và Frontend (cổng 5173 với hot-reload):

```bash
./dev.sh
```

- Giao diện người dùng: http://localhost:5173
- Tài liệu API (Swagger Docs): http://localhost:8000/docs

### 4. Chế độ sản xuất (Production / Single Port)

Khởi chạy toàn bộ ứng dụng trên một cổng duy nhất (cổng 8000):

```bash
./start.sh
```

Truy cập ứng dụng tại: http://localhost:8000

### 5. Chạy với Docker

```bash
docker compose up --build -d
```

Ứng dụng sẽ hoạt động tại http://localhost:8000. Dữ liệu sách và bản dịch được lưu trữ bền vững trong Docker volume.

---

## Hướng dẫn sử dụng & Phím tắt

- Tải sách: Kéo thả file PDF vào khu vực tải lên tại trang Thư viện.
- Tiến độ dịch: Hệ thống tự động dịch nền theo thứ tự ưu tiên trang đang xem; tiến độ hiển thị theo thời gian thực.
- Xem bản dịch: Nhấp vào đoạn văn bản bất kỳ để mở popup bản dịch tiếng Việt tương ứng.
- Phím tắt điều hướng:
  - Phím mũi tên Phải: Chuyển sang đoạn tiếp theo.
  - Phím mũi tên Trái: Quay lại đoạn trước đó.
  - Phím Escape: Đóng popup bản dịch.
- Tự động lưu tiến độ: Vị trí trang đọc gần nhất được lưu tự động cho lần truy cập sau.

---

## Kiểm thử

Chạy toàn bộ bài kiểm tra smoke test backend và typecheck frontend:

```bash
npm test
```
