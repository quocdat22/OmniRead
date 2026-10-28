import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Keyboard,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Sliders,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { api, ApiError } from "../api";
import PdfPage from "../components/PdfPage";
import TranslationPopup from "../components/TranslationPopup";
import {
  COLOR_PRESETS,
  useHighlightStyle,
} from "../hooks/useHighlightStyle";
import { useProgress } from "../hooks/useProgress";
import { pdfjs } from "../pdf";
import type { Block, Book, HighlightStyle, PageData, SentenceHighlightStyle } from "../types";

const BASE_WIDTH = 820; // px ở zoom 100%
const lastPageKey = (id: number) => `reader:lastPage:${id}`;

function readSavedPage(id: number): number {
  try {
    return Number(localStorage.getItem(lastPageKey(id))) || 1;
  } catch {
    return 1;
  }
}

interface Selection {
  page: number;
  blockId: number;
  groupId: number;
  el: HTMLElement;
}

export default function Reader({ bookId }: { bookId: number }) {
  const [book, setBook] = useState<Book | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(() =>
    Math.min(1, (window.innerWidth - 32) / BASE_WIDTH)
  );
  const [defaultAspect, setDefaultAspect] = useState(1.414);
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const [current, setCurrent] = useState(() => readSavedPage(bookId));
  const [jump, setJump] = useState(String(current));

  const [pages, setPages] = useState<Record<number, PageData>>({});
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hoveredSentence, setHoveredSentence] = useState<{
    page: number;
    rects: [number, number, number, number][];
  } | null>(null);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  const {
    style: highlightStyle,
    setStyle: setHighlightStyle,
    sentenceStyle,
    setSentenceStyle,
    padding: highlightPadding,
    color: highlightColor,
    setColor: setHighlightColor,
    colorPreset,
    fontSize: popupFontSize,
    setFontSize: setPopupFontSize,
  } = useHighlightStyle();
  const [progress, restartProgress] = useProgress(bookId);

  // ---------------------------------------------------------------- tải sách + PDF
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const b = await api.getBook(bookId);
        if (!active) return;
        setBook(b);
        const task = pdfjs.getDocument({
          url: api.fileUrl(bookId),
          cMapUrl: "https://unpkg.com/pdfjs-dist@4.10.38/cmaps/",
          cMapPacked: true,
        });
        const doc = await task.promise;
        if (!active) return;
        setPdf(doc);
        const p1 = await doc.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        setDefaultAspect(v.height / v.width);
      } catch (e) {
        if (!active) return;
        setError(e instanceof ApiError ? e.message : (e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [bookId]);

  // Nhớ trang đã đọc
  useEffect(() => {
    try {
      localStorage.setItem(lastPageKey(bookId), String(current));
    } catch {
      /* ignore */
    }
    setJump(String(current));
  }, [bookId, current]);

  // ---------------------------------------------------------------- tải blocks theo trang
  const loadingPages = useRef<Set<number>>(new Set());
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const loadPage = useCallback(
    async (page: number, force = false) => {
      if (!force && pagesRef.current[page]) return;
      if (loadingPages.current.has(page)) return;
      loadingPages.current.add(page);
      try {
        const data = await api.getBlocks(bookId, page);
        setPages((prev) => ({ ...prev, [page]: data }));
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) console.error(e);
      } finally {
        loadingPages.current.delete(page);
      }
    },
    [bookId]
  );

  const nearPages = useRef<Set<number>>(new Set());
  const onNear = useCallback(
    (n: number, isNear: boolean) => {
      if (isNear) {
        nearPages.current.add(n);
        void loadPage(n);
      } else {
        nearPages.current.delete(n);
      }
    },
    [loadPage]
  );

  // Khi tiến độ dịch đổi: tải lại các trang đang gần màn hình mà còn block chưa dịch.
  useEffect(() => {
    if (!progress) return;
    const t = setTimeout(() => {
      nearPages.current.forEach((n) => {
        const pd = pagesRef.current[n];
        const unfinished = pd?.blocks.some(
          (b) => b.status === "pending" || b.status === "translating"
        );
        if (!pd || unfinished) void loadPage(n, true);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [
    progress?.done,
    progress?.pages_done,
    progress?.errors,
    progress?.status,
    loadPage,
  ]);

  // ---------------------------------------------------------------- chọn block / popup
  const onSelectBlock = useCallback((block: Block, el: HTMLElement) => {
    setHoveredSentence(null);
    setSelected((prev) =>
      prev?.blockId === block.id
        ? null
        : { page: block.page, blockId: block.id, groupId: block.group_id, el }
    );
  }, []);

  const closePopup = useCallback(() => {
    setSelected(null);
    setHoveredSentence(null);
  }, []);

  useEffect(() => {
    if (!selected) setHoveredSentence(null);
  }, [selected]);

  const onHoverSentence = useCallback(
    (rects: [number, number, number, number][] | null) => {
      if (!rects || !selected) {
        setHoveredSentence(null);
      } else {
        setHoveredSentence({ page: selected.page, rects });
      }
    },
    [selected]
  );

  const selectedBlock = selected
    ? pages[selected.page]?.blocks.find((b) => b.id === selected.blockId) ??
      null
    : null;

  const orderedBlocks = useMemo(
    () =>
      Object.values(pages)
        .sort((a, b) => a.page.number - b.page.number)
        .flatMap((p) => p.blocks),
    [pages]
  );

  const move = useCallback(
    (delta: number) => {
      if (!selected) return;
      const currentGroupId = selected.groupId;
      const currentIndex = orderedBlocks.findIndex(
        (b) => b.id === selected.blockId
      );
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      if (delta > 0) {
        for (let i = currentIndex + 1; i < orderedBlocks.length; i++) {
          if (orderedBlocks[i].group_id !== currentGroupId) {
            nextIndex = i;
            break;
          }
        }
      } else {
        for (let i = currentIndex - 1; i >= 0; i--) {
          if (orderedBlocks[i].group_id !== currentGroupId) {
            const targetGroupId = orderedBlocks[i].group_id;
            let firstPiece = i;
            while (
              firstPiece > 0 &&
              orderedBlocks[firstPiece - 1].group_id === targetGroupId
            ) {
              firstPiece--;
            }
            nextIndex = firstPiece;
            break;
          }
        }
      }

      if (nextIndex === currentIndex) return;
      const next = orderedBlocks[nextIndex];
      const el = document.querySelector<HTMLElement>(
        `[data-block-id="${next.id}"]`
      );
      if (!next || !el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHoveredSentence(null);
      setSelected({
        page: next.page,
        blockId: next.id,
        groupId: next.group_id,
        el,
      });
    },
    [orderedBlocks, selected]
  );

  // Phím tắt bàn phím
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" && selected) {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowLeft" && selected) {
        e.preventDefault();
        move(-1);
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsDialog(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, move]);

  async function retryErrors() {
    await api.retryBook(bookId);
    restartProgress();
  }

  // ---------------------------------------------------------------- zoom / điều hướng trang
  const onAspect = useCallback(
    (n: number, a: number) =>
      setAspects((prev) =>
        Math.abs((prev[n] ?? 0) - a) < 0.001 ? prev : { ...prev, [n]: a }
      ),
    []
  );
  const onCenter = useCallback((n: number) => setCurrent(n), []);

  function changeZoom(next: number) {
    zoomRatio.current =
      window.scrollY / Math.max(1, document.documentElement.scrollHeight);
    setZoom(Math.min(2.5, Math.max(0.5, Math.round(next * 100) / 100)));
  }
  // Giữ nguyên vị trí đọc (theo tỉ lệ) sau khi đổi zoom.
  const zoomRatio = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (zoomRatio.current == null) return;
    window.scrollTo(0, zoomRatio.current * document.documentElement.scrollHeight);
    zoomRatio.current = null;
  }, [zoom]);

  function goTo(n: number) {
    if (!pdf || !Number.isFinite(n)) return;
    const p = Math.min(Math.max(1, Math.round(n)), pdf.numPages);
    document.getElementById(`page-${p}`)?.scrollIntoView({ block: "start" });
  }

  // ---------------------------------------------------------------- render
  const cssWidth = Math.round(BASE_WIDTH * zoom);
  const pageNumbers = useMemo(
    () => Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => i + 1),
    [pdf]
  );
  const pagesTotal =
    progress?.pages_total || book?.page_count || progress?.total || 0;
  const pagesDone = progress
    ? progress.pages_done ??
      (progress.status === "done" ? pagesTotal : progress.done)
    : 0;
  const canRetry =
    !!progress && (progress.errors > 0 || progress.status === "error");

  return (
    <div className="reader">
      <header className="reader-bar">
        <SimpleTooltip content="Quay về danh sách sách">
          <Link to="/" className="btn inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span>Thư viện</span>
          </Link>
        </SimpleTooltip>

        <div className="reader-title" title={book?.title}>
          {book?.title ?? "…"}
        </div>

        <div className="chip inline-flex items-center gap-1.5">
          {!progress ? null : progress.status === "parsing" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)] shrink-0" />
              <span>Đang phân tích PDF…</span>
            </>
          ) : progress.status === "error" ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <span className="err">{progress.error_msg}</span>
            </>
          ) : (
            <>
              {progress.status === "translating" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)] shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              <span>
                {progress.status === "translating" ? "Đang dịch" : "Đã dịch"}{" "}
                {pagesDone}/{pagesTotal}
              </span>
              {progress.errors > 0 && (
                <span className="err inline-flex items-center gap-1 ml-1 text-red-500">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{progress.errors} lỗi</span>
                </span>
              )}
            </>
          )}
        </div>

        {canRetry && (
          <SimpleTooltip content="Thử dịch lại các câu hoặc trang bị lỗi">
            <button
              className="btn btn-primary inline-flex items-center gap-1"
              onClick={retryErrors}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Dịch lại lỗi</span>
            </button>
          </SimpleTooltip>
        )}

        <div className="filler" />

        <label className="page-nav">
          Trang
          <input
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goTo(Number(jump))}
            aria-label="Số trang hiện tại"
          />
          / {pdf?.numPages ?? "…"}
        </label>

        {/* Zoom controls with Tooltips */}
        <div className="zoom">
          <SimpleTooltip content="Thu nhỏ tỉ lệ">
            <button
              className="btn h-7 w-7 p-0 flex items-center justify-center"
              onClick={() => changeZoom(zoom - 0.1)}
              aria-label="Thu nhỏ"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>

          <span>{Math.round(zoom * 100)}%</span>

          <SimpleTooltip content="Phóng to tỉ lệ">
            <button
              className="btn h-7 w-7 p-0 flex items-center justify-center"
              onClick={() => changeZoom(zoom + 0.1)}
              aria-label="Phóng to"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>

          <SimpleTooltip content="Vừa chiều rộng màn hình">
            <button
              className="btn h-7 w-7 p-0 flex items-center justify-center"
              onClick={() =>
                changeZoom((window.innerWidth - 32) / BASE_WIDTH)
              }
              aria-label="Vừa chiều rộng"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
        </div>

        {/* Quick Settings Popover */}
        <Popover>
          <SimpleTooltip content="Cài đặt hiển thị nhanh">
            <PopoverTrigger asChild>
              <button
                className="btn h-7 w-7 p-0 flex items-center justify-center ml-1 text-[var(--muted)] hover:text-[var(--fg)]"
                aria-label="Cài đặt nhanh"
              >
                <Sliders className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
          </SimpleTooltip>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="font-semibold text-sm">Cài đặt nhanh</span>
                <Link
                  to="/settings"
                  className="text-xs text-[var(--accent)] hover:underline inline-flex items-center"
                >
                  <span>Nâng cao</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Link>
              </div>

              {/* Kiểu highlight */}
              <div>
                <div className="text-xs text-[var(--muted)] mb-1.5 font-medium">
                  Kiểu đánh dấu khối:
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    { id: "bar", label: "Vạch sáng" },
                    { id: "background", label: "Tô nền" },
                    { id: "border", label: "Khung" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-2 py-1.5 rounded border text-center transition-colors cursor-pointer ${
                        highlightStyle === item.id
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white font-medium"
                          : "border-[var(--border)] hover:bg-[var(--border)]"
                      }`}
                      onClick={() => setHighlightStyle(item.id as HighlightStyle)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kiểu câu đối chiếu */}
              <div>
                <div className="text-xs text-[var(--muted)] mb-1.5 font-medium">
                  Sáng câu đối chiếu:
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { id: "bracket", label: "Dấu ngoặc 「」" },
                    { id: "block", label: "Khối phủ" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-2 py-1.5 rounded border text-center transition-colors cursor-pointer ${
                        sentenceStyle === item.id
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white font-medium"
                          : "border-[var(--border)] hover:bg-[var(--border)]"
                      }`}
                      onClick={() =>
                        setSentenceStyle(item.id as SentenceHighlightStyle)
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bảng màu */}
              <div>
                <div className="text-xs text-[var(--muted)] mb-2 font-medium">
                  Màu sắc: <strong className="text-[var(--fg)]">{colorPreset.name}</strong>
                </div>
                <div className="flex items-center gap-2.5">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${
                        highlightColor === c.id
                          ? "border-[var(--fg)] scale-110 shadow-sm ring-2 ring-[var(--accent)]/30"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      onClick={() => setHighlightColor(c.id)}
                      title={c.name}
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Slider cỡ chữ popup */}
              <div className="pt-1">
                <div className="flex justify-between text-xs text-[var(--muted)] mb-2">
                  <span className="font-medium">Cỡ chữ popup:</span>
                  <span className="font-semibold text-[var(--fg)]">
                    {popupFontSize}px
                  </span>
                </div>
                <Slider
                  min={12}
                  max={24}
                  step={1}
                  value={[popupFontSize]}
                  onValueChange={(val) => setPopupFontSize(val[0])}
                  aria-label="Cỡ chữ popup"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Shortcuts Help button */}
        <SimpleTooltip content="Phím tắt & Hướng dẫn (?)">
          <button
            className="btn h-7 w-7 p-0 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)]"
            onClick={() => setShowShortcutsDialog(true)}
            aria-label="Phím tắt trợ năng"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </SimpleTooltip>
      </header>

      {error && (
        <div className="notice err flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}
      {!pdf && !error && (
        <div className="notice flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-[var(--accent)]" />
          <span>Đang tải PDF…</span>
        </div>
      )}

      <main
        className="pages"
        data-highlight-style={highlightStyle}
        style={
          {
            "--highlight-padding": `${highlightPadding}px`,
            "--highlight-color": colorPreset.hex,
            "--highlight-color-rgb": colorPreset.rgb,
            "--sentence-highlight-color": colorPreset.sentenceHex,
            "--sentence-highlight-color-rgb": colorPreset.sentenceRgb,
          } as React.CSSProperties
        }
      >
        {pdf &&
          pageNumbers.map((n) => (
            <PdfPage
              key={n}
              pdf={pdf}
              pageNumber={n}
              cssWidth={cssWidth}
              aspect={aspects[n] ?? defaultAspect}
              data={pages[n]}
              selectedGroupId={selected?.groupId ?? null}
              activeSentenceHighlight={
                hoveredSentence?.page === n ? hoveredSentence.rects : null
              }
              sentenceHighlightStyle={sentenceStyle}
              onAspect={onAspect}
              onNear={onNear}
              onCenter={onCenter}
              onSelectBlock={onSelectBlock}
            />
          ))}
      </main>

      {/* Popup dịch chuyên biệt với @floating-ui/react */}
      {selected && selectedBlock && (
        <TranslationPopup
          block={selectedBlock}
          reference={selected.el}
          pageWidth={pages[selected.page]?.page.width}
          onClose={closePopup}
          onHoverSentence={onHoverSentence}
        />
      )}

      {/* Dialog bảng phím tắt trợ năng */}
      <Dialog
        open={showShortcutsDialog}
        onOpenChange={setShowShortcutsDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-[var(--accent)] shrink-0" />
              <span>Bảng phím tắt & Hướng dẫn đọc</span>
            </DialogTitle>
            <DialogDescription>
              Tối ưu thao tác đọc song ngữ bằng bàn phím theo chuẩn WAI-ARIA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <span>Đoạn tiếp theo / Trước đó</span>
              <div className="flex gap-1">
                <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">
                  ←
                </kbd>
                <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">
                  →
                </kbd>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <span>Đóng popup dịch hoặc hộp thoại</span>
              <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">
                Esc
              </kbd>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <span>Mở bảng trợ giúp này</span>
              <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">
                ?
              </kbd>
            </div>

            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <span>Xem dịch thuật câu ngữ cảnh</span>
              <span className="text-xs text-[var(--muted)]">Nhấp chuột vào khối văn bản</span>
            </div>

            <div className="flex items-center justify-between pb-1.5">
              <span>Chiếu sáng câu đối chiếu gốc</span>
              <span className="text-xs text-[var(--muted)]">Rê chuột vào câu trong popup</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
