import type { PDFDocumentProxy } from "pdfjs-dist";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import PdfPage from "../components/PdfPage";
import ThemeToggle from "../components/ThemeToggle";
import TranslationPopup from "../components/TranslationPopup";
import { useHighlightStyle } from "../hooks/useHighlightStyle";
import { useProgress } from "../hooks/useProgress";
import { pdfjs } from "../pdf";
import type { Block, Book, PageData } from "../types";

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

  const [zoom, setZoom] = useState(() => Math.min(1, (window.innerWidth - 32) / BASE_WIDTH));
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

  const {
    style: highlightStyle,
    sentenceStyle,
    padding: highlightPadding,
    colorPreset,
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
    [bookId],
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
    [loadPage],
  );

  // Khi progress tăng trang dịch xong -> re-fetch các trang đang nằm trong viewport.
  const prevPagesDone = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!progress) return;
    const cur = progress.pages_done ?? progress.done;
    if (prevPagesDone.current !== undefined && cur > prevPagesDone.current) {
      for (const p of nearPages.current) void loadPage(p, true);
    }
    prevPagesDone.current = cur;
  }, [progress, loadPage]);

  // ---------------------------------------------------------------- tracking trang hiện tại
  const onCenter = useCallback((n: number) => setCurrent(n), []);
  const onAspect = useCallback(
    (n: number, a: number) =>
      setAspects((prev) => (Math.abs((prev[n] ?? 0) - a) < 0.001 ? prev : { ...prev, [n]: a })),
    [],
  );

  // ---------------------------------------------------------------- chọn block & mở popup
  const onSelectBlock = useCallback((block: Block, el: HTMLElement) => {
    setHoveredSentence(null);
    setSelected((prev) =>
      prev?.blockId === block.id
        ? null
        : { page: block.page, blockId: block.id, groupId: block.group_id, el },
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
    [selected],
  );

  // Tự động đóng popup nếu click ra ngoài PDF overlay
  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".popup") || target.closest(".block")) return;
      setSelected(null);
    }
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  // Block được chọn hiện tại (đầy đủ thông tin)
  const selectedBlock = useMemo(() => {
    if (!selected) return null;
    const pageData = pages[selected.page];
    return pageData?.blocks.find((b) => b.id === selected.blockId) ?? null;
  }, [selected, pages]);

  const orderedBlocks = useMemo(
    () =>
      Object.values(pages)
        .sort((a, b) => a.page.number - b.page.number)
        .flatMap((p) => p.blocks),
    [pages],
  );

  const move = useCallback(
    (delta: number) => {
      if (!selected) return;
      const currentGroupId = selected.groupId;
      const currentIndex = orderedBlocks.findIndex((b) => b.id === selected.blockId);
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
            while (firstPiece > 0 && orderedBlocks[firstPiece - 1].group_id === targetGroupId) {
              firstPiece--;
            }
            nextIndex = firstPiece;
            break;
          }
        }
      }

      if (nextIndex === currentIndex) return;
      const next = orderedBlocks[nextIndex];
      const el = document.querySelector<HTMLElement>(`[data-block-id="${next.id}"]`);
      if (!next || !el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHoveredSentence(null);
      setSelected({ page: next.page, blockId: next.id, groupId: next.group_id, el });
    },
    [orderedBlocks, selected],
  );

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") (e.preventDefault(), move(1));
      else if (e.key === "ArrowLeft") (e.preventDefault(), move(-1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, move]);

  // ---------------------------------------------------------------- toolbar actions
  function changeZoom(next: number) {
    const clamped = Math.max(0.4, Math.min(2.5, next));
    const oldWidth = Math.round(BASE_WIDTH * zoom);
    const newWidth = Math.round(BASE_WIDTH * clamped);
    const ratio = newWidth / oldWidth;

    const pageEl = document.getElementById(`page-${current}`);
    const beforeTop = pageEl ? pageEl.getBoundingClientRect().top : 0;
    const scrollY = window.scrollY;

    setZoom(clamped);

    requestAnimationFrame(() => {
      if (pageEl) {
        const afterTop = pageEl.getBoundingClientRect().top;
        window.scrollTo(0, scrollY + (afterTop - beforeTop));
      } else {
        window.scrollTo(0, scrollY * ratio);
      }
    });
  }

  // Khôi phục vị trí trang đã lưu khi PDF load xong lần đầu
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    if (!pdf || restoredRef.current) return;
    restoredRef.current = true;
    if (current > 1) {
      setTimeout(() => {
        document.getElementById(`page-${current}`)?.scrollIntoView({ block: "start" });
      }, 50);
    }
  }, [pdf, current]);

  async function retryErrors() {
    await api.retryBook(bookId);
    restartProgress();
  }

  function goTo(p: number) {
    if (!pdf || p < 1 || p > pdf.numPages) return;
    document.getElementById(`page-${p}`)?.scrollIntoView({ block: "start" });
  }

  // ---------------------------------------------------------------- render
  const cssWidth = Math.round(BASE_WIDTH * zoom);
  const pageNumbers = useMemo(
    () => Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => i + 1),
    [pdf],
  );
  const pagesTotal = progress?.pages_total || book?.page_count || progress?.total || 0;
  const pagesDone = progress
    ? (progress.pages_done ?? (progress.status === "done" ? pagesTotal : progress.done))
    : 0;
  const canRetry = !!progress && (progress.errors > 0 || progress.status === "error");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 h-14 px-3 sm:px-4 flex items-center gap-3 bg-surface/95 backdrop-blur-sm border-b border-border shadow-xs">
        <Link
          to="/"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          ← Thư viện
        </Link>
        <div className="font-semibold text-sm text-foreground max-w-[200px] sm:max-w-[280px] truncate" title={book?.title}>
          {book?.title ?? "…"}
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-muted bg-surface-hover/60 px-2.5 py-1 rounded-lg border border-border">
          {!progress ? null : progress.status === "parsing" ? (
            "Đang phân tích PDF…"
          ) : progress.status === "error" ? (
            <span className="text-danger font-medium">{progress.error_msg}</span>
          ) : (
            <>
              <span>
                {progress.status === "translating" ? "Đang dịch" : "Đã dịch"} {pagesDone}/{pagesTotal}
              </span>
              {progress.errors > 0 && <span className="text-danger font-medium">{progress.errors} lỗi</span>}
            </>
          )}
        </div>

        {canRetry && (
          <button
            type="button"
            className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            onClick={retryErrors}
          >
            Dịch lại lỗi
          </button>
        )}

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 text-xs text-muted font-medium">
          Trang
          <input
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goTo(Number(jump))}
            className="w-14 px-2 py-0.5 text-center text-xs font-medium bg-background border border-border rounded-lg text-foreground focus:outline-hidden focus:border-accent"
          />
          / {pdf?.numPages ?? "…"}
        </label>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            className="px-2 py-1 rounded-lg border border-border bg-surface text-foreground hover:border-accent transition-colors"
            onClick={() => changeZoom(zoom - 0.1)}
            title="Thu nhỏ"
          >
            −
          </button>
          <span className="w-12 text-center text-xs font-medium text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="px-2 py-1 rounded-lg border border-border bg-surface text-foreground hover:border-accent transition-colors"
            onClick={() => changeZoom(zoom + 0.1)}
            title="Phóng to"
          >
            +
          </button>
          <button
            type="button"
            className="hidden sm:inline-flex px-2 py-1 rounded-lg border border-border bg-surface text-foreground hover:border-accent transition-colors"
            onClick={() => changeZoom((window.innerWidth - 32) / BASE_WIDTH)}
            title="Vừa màn hình"
          >
            Vừa
          </button>
        </div>

        <ThemeToggle />
      </header>

      {error && (
        <div className="m-4 p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}
      {!pdf && !error && (
        <div className="m-4 p-4 rounded-xl border border-border bg-surface text-muted text-sm text-center">
          Đang tải dữ liệu PDF…
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

      {selected && selectedBlock && (
        <TranslationPopup
          block={selectedBlock}
          reference={selected.el}
          pageWidth={pages[selected.page]?.page.width}
          onClose={closePopup}
          onHoverSentence={onHoverSentence}
        />
      )}
    </div>
  );
}
