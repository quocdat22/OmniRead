import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import ThemeToggle from "../components/ThemeToggle";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return setMessage("Chỉ hỗ trợ file định dạng PDF (.pdf).");
    }
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

  const triggerFileSelect = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
        disabled={uploading}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Thư viện OmniRead</h1>
          <p className="text-sm text-muted mt-0.5">Trình đọc PDF song ngữ Anh - Việt với DeepSeek AI</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {health && (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                title="Backend đã sẵn sàng"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                API Online
              </span>
              {health.translator_configured ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  title="DeepSeek API Key đã cấu hình"
                >
                  ✓ DeepSeek OK
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  title="Chưa có DEEPSEEK_API_KEY trong .env"
                >
                  ⚠️ Chưa cấu hình DeepSeek
                </span>
              )}
            </div>
          )}

          <ThemeToggle />

          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
            title="Cài đặt hiển thị & giao diện"
          >
            ⚙️ Cài đặt
          </Link>
        </div>
      </div>

      {health && !health.translator_configured && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-sm leading-relaxed">
          ⚠️ <strong>DeepSeek API chưa được cấu hình:</strong> Bạn vẫn có thể tải sách và đọc PDF nguyên bản. Để kích hoạt tính năng dịch tự động song ngữ, hãy cấu hình <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs">DEEPSEEK_API_KEY</code> trong file <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs">backend/.env</code>.
        </div>
      )}

      {/* Upload Action Card */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center text-2xl shrink-0">
            📑
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Thêm tài liệu hoặc sách mới
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Hỗ trợ định dạng PDF (.pdf). Hệ thống sẽ tự động trích xuất các đoạn và câu để dịch song ngữ.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={triggerFileSelect}
          disabled={uploading}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-xs shrink-0 select-none ${
            uploading
              ? "bg-accent/70 text-white cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent-hover hover:shadow-md active:scale-98 cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-1 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <span>Đang tải lên…</span>
            </>
          ) : (
            <>
              <span className="text-base leading-none">➕</span>
              <span>Chọn file PDF</span>
            </>
          )}
        </button>
      </div>

      {message && (
        <div className="mt-4 p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm">
          {message}
        </div>
      )}

      {/* Book cards section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Sách của bạn ({books.length})
          </h2>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {books.map((b) => {
            const totalPages = b.pages_total ?? b.page_count;
            const donePages = b.pages_done ?? (b.status === "done" ? totalPages : 0);
            const pct = totalPages
              ? Math.round((donePages / totalPages) * 100)
              : b.total
              ? Math.round((b.done / b.total) * 100)
              : 0;
            return (
              <div
                key={b.id}
                className="flex flex-col gap-2.5 p-4 bg-surface border border-border rounded-xl shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="font-semibold text-foreground truncate" title={b.filename}>
                  {b.title}
                </div>
                <div className="text-xs text-muted">
                  {b.page_count ? `${b.page_count} trang · ` : ""}
                  {statusText(b)}
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                  {b.status === "parsing" ? (
                    <span className="text-xs text-muted">Chờ phân tích xong…</span>
                  ) : (
                    <Link
                      to={`/read/${b.id}`}
                      className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                    >
                      Đọc sách
                    </Link>
                  )}
                  {(b.status === "partial" || b.status === "error") && (
                    <button
                      type="button"
                      onClick={() => retry(b)}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
                    >
                      Thử lại
                    </button>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => remove(b)}
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg text-danger hover:bg-danger/10 border border-transparent hover:border-danger/30 transition-colors"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {!books.length && !message && (
            <div className="col-span-full py-16 px-4 text-center border border-border border-dashed rounded-2xl bg-surface/50">
              <div className="text-4xl mb-2">📚</div>
              <h3 className="font-medium text-foreground text-sm">Chưa có cuốn sách nào</h3>
              <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                Bấm nút "Chọn file PDF" ở trên để thêm tài liệu đầu tiên và trải nghiệm đọc song ngữ!
              </p>
              <button
                type="button"
                onClick={triggerFileSelect}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                <span>➕</span>
                <span>Chọn file PDF ngay</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
