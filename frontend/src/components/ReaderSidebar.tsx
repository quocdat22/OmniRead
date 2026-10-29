import { BookOpen, FileText, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Book, Progress } from "../types";

interface ReaderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book | null;
  numPages?: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  progress: Progress | null;
}

export default function ReaderSidebar({
  isOpen,
  onClose,
  book,
  numPages = 0,
  currentPage,
  onSelectPage,
  progress,
}: ReaderSidebarProps) {
  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-40 md:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar drawer */}
      <aside
        className={cn(
          "fixed top-14 bottom-0 left-0 w-72 sm:w-80 bg-surface/95 backdrop-blur-md border-r border-border z-40 flex flex-col shadow-xl transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Thanh bên mục lục và trang"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <span className="font-semibold text-sm text-foreground">
              Mục lục & Danh sách trang
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Đóng thanh bên"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thông tin tài liệu */}
        {book && (
          <div className="p-3 bg-surface-hover/40 border-b border-border text-xs space-y-1">
            <div className="font-medium text-foreground truncate" title={book.title}>
              {book.title}
            </div>
            <div className="text-muted flex items-center justify-between">
              <span>Tổng số trang:</span>
              <span className="font-semibold text-foreground">{numPages}</span>
            </div>
            {progress && (
              <div className="text-muted flex items-center justify-between">
                <span>Trạng thái dịch:</span>
                <span className="font-semibold text-accent">
                  {progress.status === "translating"
                    ? `Đang dịch (${progress.pages_done ?? 0}/${progress.pages_total ?? numPages})`
                    : progress.status === "done"
                    ? "Hoàn tất"
                    : progress.status}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Danh sách trang */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
            Các trang tài liệu
          </div>
          {pages.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">
              Đang tải danh sách trang…
            </div>
          ) : (
            pages.map((p) => {
              const isCurrent = p === currentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onSelectPage(p);
                    // On small screens, close sidebar when page is selected
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left",
                    isCurrent
                      ? "bg-accent text-white font-semibold shadow-xs"
                      : "text-foreground hover:bg-surface-hover border border-transparent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <FileText className={cn("h-3.5 w-3.5", isCurrent ? "text-white" : "text-muted")} />
                    <span>Trang {p}</span>
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-sm">
                      Đang xem
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
