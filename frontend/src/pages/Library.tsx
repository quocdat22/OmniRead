import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import type { Book } from "../types";

function statusText(b: Book): string {
  const totalPages = b.pages_total ?? b.page_count;
  const donePages = b.pages_done ?? (b.status === "done" ? totalPages : 0);
  switch (b.status) {
    case "parsing": return "Đang phân tích PDF…";
    case "translating": return `Đang dịch ${donePages}/${totalPages}`;
    case "done": return `Đã dịch xong (${totalPages} trang)`;
    case "partial": return `Xong, ${b.errors} đoạn lỗi`;
    case "error": return `Lỗi: ${b.error_msg ?? "không rõ"}`;
  }
}

export default function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; translator_configured: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [bookList, healthStatus] = await Promise.all([
        api.listBooks(),
        api.health().catch(() => null),
      ]);
      setBooks(bookList);
      if (healthStatus) setHealth(healthStatus);
      setMessage(null);
    } catch (e) {
      setMessage(`Không kết nối được backend: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => void load(), [load]);

  // Poll khi còn sách đang xử lý.
  const active = books.some((b) => b.status === "parsing" || b.status === "translating");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) return setMessage("Chỉ hỗ trợ file PDF.");
    setUploading(true);
    setMessage(null);
    try {
      await api.uploadBook(file);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const id = (e.detail as { book_id?: number })?.book_id;
        if (id) return navigate(`/read/${id}`); // sách đã có -> mở luôn
      }
      setMessage((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(b: Book) {
    if (!confirm(`Xóa "${b.title}" và toàn bộ bản dịch?`)) return;
    await api.deleteBook(b.id);
    await load();
  }

  async function retry(b: Book) {
    await api.retryBook(b.id);
    await load();
  }

  return (
    <div className="library">
      <div className="library-header">
        <h1>Thư viện OmniRead</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {health && (
            <div className="status-indicators">
              <span className="status-badge live" title="Backend đã sẵn sàng">
                ● API Online
              </span>
              {health.translator_configured ? (
                <span className="status-badge success" title="DeepSeek API Key đã cấu hình">
                  ✓ DeepSeek OK
                </span>
              ) : (
                <span className="status-badge warn" title="Chưa có DEEPSEEK_API_KEY trong .env">
                  ⚠️ Chưa cấu hình DeepSeek
                </span>
              )}
            </div>
          )}
          <Link to="/settings" className="btn" title="Cài đặt">
            ⚙️ Cài đặt
          </Link>
        </div>
      </div>

      {health && !health.translator_configured && (
        <div className="notice warn">
          ⚠️ <strong>DeepSeek API chưa được cấu hình:</strong> Bạn vẫn có thể tải sách và đọc PDF nguyên bản. Để kích hoạt tính năng dịch tự động song ngữ, hãy cấu hình <code>DEEPSEEK_API_KEY</code> trong file <code>backend/.env</code>.
        </div>
      )}

      <label
        className={`dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file" accept="application/pdf" hidden
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {uploading ? "Đang tải lên…" : "Kéo thả file PDF vào đây hoặc bấm để chọn (PDF text-based)"}
      </label>

      {message && <div className="notice err">{message}</div>}

      <div className="cards">
        {books.map((b) => {
          const totalPages = b.pages_total ?? b.page_count;
          const donePages = b.pages_done ?? (b.status === "done" ? totalPages : 0);
          const pct = totalPages
            ? Math.round((donePages / totalPages) * 100)
            : b.total
            ? Math.round((b.done / b.total) * 100)
            : 0;
          return (
            <div className="card" key={b.id}>
              <div className="card-title" title={b.filename}>{b.title}</div>
              <div className="muted">{b.page_count ? `${b.page_count} trang · ` : ""}{statusText(b)}</div>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="card-actions">
                {b.status === "parsing" ? (
                  <span className="muted">Chờ phân tích xong…</span>
                ) : (
                  <Link className="btn primary" to={`/read/${b.id}`}>Đọc</Link>
                )}
                {(b.status === "partial" || b.status === "error") && (
                  <button className="btn" onClick={() => retry(b)}>Thử lại</button>
                )}
                <span className="grow" />
                <button className="btn danger" onClick={() => remove(b)}>Xóa</button>
              </div>
            </div>
          );
        })}
        {!books.length && !message && <p className="muted">Chưa có sách nào. Hãy upload một file PDF.</p>}
      </div>
    </div>
  );
}
