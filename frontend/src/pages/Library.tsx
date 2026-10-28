import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDot,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import ThemeToggle from "../components/ThemeToggle";
import type { Book } from "../types";

function BookStatusIndicator({ book }: { book: Book }) {
  const totalPages = book.pages_total ?? book.page_count;
  const donePages =
    book.pages_done ?? (book.status === "done" ? totalPages : 0);

  switch (book.status) {
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1.5 text-accent">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Đang phân tích PDF…</span>
        </span>
      );
    case "translating":
      return (
        <span className="inline-flex items-center gap-1.5 text-accent">
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
        <span className="inline-flex items-center gap-1.5 text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Lỗi: {book.error_msg ?? "không rõ"}</span>
        </span>
      );
  }
}

export default function Library() {
  const shouldReduceMotion = useReducedMotion();
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

  const triggerFileSelect = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  };

  const cardVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 14, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 350,
        damping: 24,
      },
    },
    exit: shouldReduceMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          scale: 0.92,
          y: -8,
          transition: { duration: 0.2 },
        },
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
              <SimpleTooltip content="Backend FastAPI đang trực tuyến">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  API Online
                </span>
              </SimpleTooltip>
              {health.translator_configured ? (
                <SimpleTooltip content="Mô hình DeepSeek AI đã sẵn sàng dịch thuật ngữ cảnh">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  >
                    <Check className="h-3.5 w-3.5" />
                    DeepSeek OK
                  </span>
                </SimpleTooltip>
              ) : (
                <SimpleTooltip content="Chưa cấu hình DEEPSEEK_API_KEY trong file backend/.env">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Chưa cấu hình DeepSeek
                  </span>
                </SimpleTooltip>
              )}
            </div>
          )}

          <ThemeToggle />

          <SimpleTooltip content="Tùy biến hiển thị highlight, padding, cỡ chữ">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
            >
              <SettingsIcon className="h-4 w-4" />
              <span>Cài đặt</span>
            </Link>
          </SimpleTooltip>
        </div>
      </div>

      {health && !health.translator_configured && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-sm leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <strong>DeepSeek API chưa được cấu hình:</strong> Bạn vẫn có thể tải sách
            và đọc PDF nguyên bản. Để kích hoạt tính năng dịch tự động song ngữ, hãy cấu
            hình <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs">DEEPSEEK_API_KEY</code> trong file <code className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs">backend/.env</code>.
          </div>
        </div>
      )}

      {/* Upload Action / Dropzone Card */}
      <motion.div
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
        animate={{
          scale: dragOver ? 1.01 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`bg-surface border-2 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shrink-0">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Thêm tài liệu hoặc sách mới
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Hỗ trợ định dạng PDF (.pdf). Hệ thống sẽ tự động trích xuất các đoạn và câu để dịch song ngữ. Kéo thả file vào đây hoặc bấm nút chọn file.
            </p>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={triggerFileSelect}
          disabled={uploading}
          whileHover={uploading ? undefined : { scale: 1.02 }}
          whileTap={uploading ? undefined : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-xs shrink-0 select-none ${
            uploading
              ? "bg-accent/70 text-white cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent-hover hover:shadow-md cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span>Đang tải lên…</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              <span>Chọn file PDF</span>
            </>
          )}
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-4 p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm flex items-center gap-2 overflow-hidden"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
            <span>{message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Book cards section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Sách của bạn ({books.length})
          </h2>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          layout
          className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
        >
          <AnimatePresence mode="popLayout">
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
                <motion.div
                  key={b.id}
                  layout="position"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  whileHover={shouldReduceMotion ? undefined : { y: -4, transition: { duration: 0.2 } }}
                  className="flex flex-col gap-2.5 p-4 bg-surface border border-border rounded-xl shadow-xs hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold text-foreground truncate" title={b.filename}>
                    {b.title}
                  </div>
                  <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                    {b.page_count ? <span>{b.page_count} trang ·</span> : null}
                    <BookStatusIndicator book={b} />
                  </div>
                  <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                    {b.status === "parsing" ? (
                      <span className="text-xs text-muted inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Chờ phân tích…</span>
                      </span>
                    ) : (
                      <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                        <Link
                          to={`/read/${b.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Đọc</span>
                        </Link>
                      </motion.div>
                    )}
                    {(b.status === "partial" || b.status === "error") && (
                      <SimpleTooltip content="Thử dịch lại các đoạn văn bản gặp sự cố">
                        <motion.button
                          type="button"
                          onClick={() => retry(b)}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Thử lại</span>
                        </motion.button>
                      </SimpleTooltip>
                    )}
                    <span className="flex-1" />

                    {/* Dropdown Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
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
                </motion.div>
              );
            })}

            {!books.length && !message && (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                className="col-span-full py-16 px-4 text-center border border-border border-dashed rounded-2xl bg-surface/50"
              >
                <div className="text-4xl mb-2">📚</div>
                <h3 className="font-medium text-foreground text-sm">Chưa có cuốn sách nào</h3>
                <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                  Bấm nút &quot;Chọn file PDF&quot; ở trên để thêm tài liệu đầu tiên và trải nghiệm đọc song ngữ!
                </p>
                <motion.button
                  type="button"
                  onClick={triggerFileSelect}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Chọn file PDF ngay</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
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
