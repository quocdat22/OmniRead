# OmniRead 📖

> **Trình đọc sách PDF song ngữ Anh - Việt thông minh với AI DeepSeek**
> Tự động phân tích bố cục, trích xuất đoạn văn bản, dịch ngầm theo tiêu điểm đọc và hiển thị bản dịch tương tác ngay trên trang sách.

---

## 🌟 Điểm nổi bật & Tính năng

- 📄 **Phân tích PDF chuyên sâu (PyMuPDF / fitz)**:
  - Tự động trích xuất các khối văn bản (blocks) kèm tọa độ pixel thực (`bbox`).
  - Thuật toán thông minh lọc bỏ nhiễu biên (Header, Footer, số trang).
  - Nối dòng gãy và giải quyết từ có dấu gạch nối cuối dòng (`hyphenation`).
- 🤖 **Dịch thuật song ngữ tự động qua DeepSeek AI**:
  - Dịch theo từng đoạn văn bản giữ trọn ngữ cảnh, định dạng chuyên nghiệp.
  - Hàng đợi worker bất đồng bộ song song (`concurrency`), không làm treo UI khi tải sách dài hàng trăm trang.
  - **Dynamic Viewport Focus Priority**: Hàng đợi ưu tiên dịch trước các trang người dùng đang cuộn tới (`ORDER BY ABS(page - focus_page)`).
  - Tự động thử lại khi gặp giới hạn tốc độ (Rate Limit / 429) với Exponential Backoff.
- ⚡ **Tiến độ thời gian thực (Server-Sent Events - SSE)**:
  - Cập nhật số đoạn đã dịch, tỉ lệ phần trăm và thông báo lỗi qua stream `/api/books/{id}/progress`.
- 🔍 **Giao diện đọc sách tương tác mượt mà**:
  - Render PDF độ nét cao theo `devicePixelRatio` bằng PDF.js (chỉ render trang trong viewport để tối ưu RAM).
  - Highlight trực quan các đoạn text trên nền tài liệu gốc.
  - Popup nổi tối giản bám sát tọa độ khối văn bản (`@floating-ui/react`).
  - Phím tắt tiện lợi: `ArrowRight` (đoạn tiếp), `ArrowLeft` (đoạn trước), `Escape` (đóng popup).
  - Tự động lưu trang đọc dở vào `localStorage`.
- 🛡️ **Tích hợp toàn diện & Sẵn sàng triển khai**:
  - **Single-port SPA Mode**: Backend FastAPI có thể phục vụ toàn bộ ứng dụng (cả Web UI và REST API) trên một cổng duy nhất (8000).
  - **Dual Dev Mode**: Hỗ trợ Vite Dev Server (port 5173) với proxy mượt mà và Hot Module Replacement (HMR).
  - Hỗ trợ Docker & Docker Compose đa tầng (multi-stage build) nhỏ gọn.
  - Trạng thái kiểm tra sức khỏe (Health Check) thông minh cảnh báo trực quan trên giao diện nếu chưa cấu hình `DEEPSEEK_API_KEY`.

---

## 📁 Cấu trúc thư mục

```text
OmniRead/
├── backend/                  # FastAPI Backend & SQLite
│   ├── app/
│   │   ├── api/              # REST & SSE endpoints (/api/books, /api/health)
│   │   ├── services/         # Trích xuất PDF, Worker dịch & DeepSeek client
│   │   ├── config.py         # Cấu hình Pydantic & Biến môi trường
│   │   ├── db.py             # SQLite DDL & Queries (aiosqlite)
│   │   └── main.py           # FastAPI app & Static SPA serving
│   ├── data/                 # Thư mục lưu trữ SQLite (.db) và file PDF
│   ├── tests/                # Smoke tests kiểm tra toàn bộ luồng
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Mẫu cấu hình môi trường backend
├── frontend/                 # React 19 + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── components/       # PdfPage, BlockOverlay, TranslationPopup
│   │   ├── pages/            # Library (Thư viện) & Reader (Trình đọc)
│   │   ├── hooks/            # useProgress (SSE client)
│   │   ├── api.ts            # API client giao tiếp backend
│   │   ├── pdf.ts            # PDF.js worker setup
│   │   └── styles.css        # Giao diện responsive & Dark/Light mode
│   ├── package.json          # Frontend dependencies & scripts
│   └── vite.config.ts        # Cấu hình Vite & Proxy
├── dev.sh                    # Script khởi chạy môi trường phát triển (1 lệnh)
├── start.sh                  # Script khởi chạy bản phát hành độc lập (1 lệnh)
├── Dockerfile                # Multi-stage production container
├── docker-compose.yml        # Orchestration cho Docker deployment
├── package.json              # Root package script runner
└── README.md                 # Tài liệu hướng dẫn
```

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Yêu cầu hệ thống

- **Node.js** >= 18
- **Python** >= 3.10 (khuyến nghị dùng `uv` hoặc `venv`)
- (Tùy chọn) **Docker** & **Docker Compose** nếu muốn chạy container hóa.

### 2. Cấu hình biến môi trường

Sao chép file `.env.example` thành `.env` trong thư mục `backend/` (hoặc thư mục gốc):

```bash
cp .env.example backend/.env
```

Mở file `backend/.env` và điền khóa API DeepSeek:

```env
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_TEMPERATURE=1.3
CONCURRENCY=6
```

> **Ghi chú**: Nếu chưa có API Key, hệ thống vẫn cho phép tải sách và đọc PDF nguyên bản. Một huy hiệu cảnh báo vàng sẽ hiển thị trên giao diện thông báo cần cấu hình Key để bắt đầu dịch.

---

### 3. Cách chạy 1: Môi trường phát triển (Hot-Reload)

Cài đặt dependencies và khởi chạy đồng thời cả Backend và Frontend:

```bash
# Cài đặt root dependencies (cho lệnh chạy song song)
npm install

# Khởi chạy cả Backend (8000) và Frontend (5173) bằng 1 lệnh:
./dev.sh
# hoặc: npm run dev
```

- **Giao diện Web (Vite HMR)**: [http://localhost:5173](http://localhost:5173)
- **API Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 4. Cách chạy 2: Chạy độc lập toàn bộ dự án trên 1 Port (Production / Single Port)

Khởi chạy cả Frontend và Backend gộp chung trên port `8000`:

```bash
./start.sh
# hoặc: npm run build && npm run start
```

Mở trình duyệt tại [http://localhost:8000](http://localhost:8000) để sử dụng toàn bộ ứng dụng.

---

### 5. Cách chạy 3: Chạy bằng Docker Compose

```bash
docker compose up --build -d
```

Ứng dụng sẽ được đóng gói đa tầng tự động và lắng nghe tại [http://localhost:8000](http://localhost:8000). Dữ liệu sách và bản dịch được duy trì bền vững trong Docker volume `omniread_data`.

---

## 🧪 Kiểm thử (Testing)

OmniRead cung cấp bộ smoke test tự động bao quát:
- Parse PDF trích xuất blocks.
- Khởi tạo SQLite và thêm sách.
- Hàng đợi worker dịch bất đồng bộ.
- Truyền phát SSE `/api/books/{id}/progress`.
- Dọn dẹp cascade xóa sách và xóa file PDF tương ứng.

Chạy toàn bộ bài kiểm tra (cả Backend và Frontend typecheck):

```bash
npm test
```

---

## 📖 Hướng dẫn sử dụng

1. **Tải sách**: Kéo thả file PDF (dạng text-based) vào vùng tải lên tại trang Thư viện.
2. **Theo dõi tiến độ**: Thanh tiến trình hiển thị phần trăm đoạn văn bản đã được dịch theo thời gian thực.
3. **Đọc sách**:
   - Bấm vào nút **"Đọc"** để mở sách.
   - Nhấp chuột vào bất kỳ đoạn văn bản nào trên trang PDF để hiển thị popup bản dịch tiếng Việt.
   - Dùng phím `←` / `→` trên bàn phím để đọc tiếp các đoạn liền kề.
   - Nhấn phím `Esc` hoặc nhấp chuột ra ngoài để đóng popup.
