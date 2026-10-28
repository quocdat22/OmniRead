import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDot,
  Loader2,
  MoreVertical,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { api, ApiError } from "../api";
import type { Book } from "../types";

function BookStatusIndicator({ book }: { book: Book }) {
  const totalPages = book.pages_total ?? book.page_count;
  const donePages =
    book.pages_done ?? (book.status === "done" ? totalPages : 0);

  switch (book.status) {
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--accent)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Đang phân tích PDF…</span>
        </span>
      );
    case "translating":
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--accent)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Đang dịch {donePages}/{totalPages}</span>
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Đã dịch xong ({totalPages} trang)</span>
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Xong, {book.errors} đoạn lỗi</span>
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 text-red-500">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Lỗi: {book.error_msg ?? "không rõ"}</span>
        </span>
      );
  }
}

export default function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    ok: boolean;
    translator_configured: boolean;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const active = books.some(
    (b) => b.status === "parsing" || b.status === "translating"
  );
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf"))
      return setMessage("Chỉ hỗ trợ file PDF.");
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

  async function confirmDelete() {
    if (!bookToDelete) return;
    setDeleting(true);
    try {
      await api.deleteBook(bookToDelete.id);
      setBookToDelete(null);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setDeleting(false);
    }
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
              <SimpleTooltip content="Backend FastAPI đang trực tuyến">
                <span className="status-badge live">
                  <CircleDot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>API Online</span>
                </span>
              </SimpleTooltip>
              {health.translator_configured ? (
                <SimpleTooltip content="Mô hình DeepSeek AI đã sẵn sàng dịch thuật ngữ cảnh">
                  <span className="status-badge success">
                    <Check className="h-3.5 w-3.5" />
                    <span>DeepSeek OK</span>
                  </span>
                </SimpleTooltip>
              ) : (
                <SimpleTooltip content="Chưa cấu hình DEEPSEEK_API_KEY trong file backend/.env">
                  <span className="status-badge warn">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Chưa cấu hình DeepSeek</span>
                  </span>
                </SimpleTooltip>
              )}
            </div>
          )}
          <SimpleTooltip content="Tùy biến hiển thị highlight, padding, cỡ chữ">
            <Link to="/settings" className="btn inline-flex items-center gap-1.5">
              <SettingsIcon className="h-4 w-4" />
              <span>Cài đặt</span>
            </Link>
          </SimpleTooltip>
        </div>
      </div>

      {health && !health.translator_configured && (
        <div className="notice warn flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <strong>DeepSeek API chưa được cấu hình:</strong> Bạn vẫn có thể tải sách
            và đọc PDF nguyên bản. Để kích hoạt tính năng dịch tự động song ngữ, hãy cấu
            hình <code>DEEPSEEK_API_KEY</code> trong file <code>backend/.env</code>.
          </div>
        </div>
      )}

      <label
        className={`dropzone${dragOver ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center justify-center gap-2 py-1">
          {uploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
              <span>Đang tải lên…</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-7 w-7 text-[var(--muted)]" />
              <span>Kéo thả file PDF vào đây hoặc bấm để chọn (PDF text-based)</span>
            </>
          )}
        </div>
      </label>

      {message && (
        <div className="notice err flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{message}</span>
        </div>
      )}

      <div className="cards">
        {books.map((b) => {
          const totalPages = b.pages_total ?? b.page_count;
          const donePages =
            b.pages_done ?? (b.status === "done" ? totalPages : 0);
          const pct = totalPages
            ? Math.round((donePages / totalPages) * 100)
            : b.total
            ? Math.round((b.done / b.total) * 100)
            : 0;

          return (
            <div className="card" key={b.id}>
              <div className="card-title" title={b.filename}>
                {b.title}
              </div>
              <div className="muted flex items-center gap-1.5 flex-wrap">
                {b.page_count ? <span>{b.page_count} trang ·</span> : null}
                <BookStatusIndicator book={b} />
              </div>
              <div className="bar">
                <i style={{ width: `${pct}%` }} />
              </div>

              <div className="card-actions items-center">
                {b.status === "parsing" ? (
                  <span className="muted inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Chờ phân tích xong…</span>
                  </span>
                ) : (
                  <Link
                    className="btn primary inline-flex items-center gap-1.5"
                    to={`/read/${b.id}`}
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Đọc</span>
                  </Link>
                )}

                {(b.status === "partial" || b.status === "error") && (
                  <SimpleTooltip content="Thử dịch lại các đoạn văn bản gặp sự cố">
                    <button
                      className="btn inline-flex items-center gap-1"
                      onClick={() => retry(b)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Thử lại</span>
                    </button>
                  </SimpleTooltip>
                )}

                <span className="grow" />

                {/* Dropdown Menu thao tác nâng cao */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="btn p-1.5 h-8 w-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)]"
                      aria-label="Thao tác khác"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/read/${b.id}`)}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span>Mở sách</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => retry(b)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      <span>Dịch lại các đoạn lỗi</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setBookToDelete(b)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Xóa sách & bản dịch</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
        {!books.length && !message && (
          <p className="muted">Chưa có sách nào. Hãy upload một file PDF.</p>
        )}
      </div>

      {/* Dialog xác nhận xóa sách (Thay thế window.confirm hoàn toàn) */}
      <Dialog
        open={!!bookToDelete}
        onOpenChange={(open) => !open && setBookToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa tài liệu</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa &quot;{bookToDelete?.title}&quot; cùng
              toàn bộ dữ liệu bản dịch và cấu trúc đoạn câu không? Hành động này
              không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Hủy
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Đang xóa…" : "Xóa tài liệu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
