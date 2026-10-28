import type { PDFDocumentProxy } from "pdfjs-dist";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import PdfPage from "../components/PdfPage";
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

  // Khi tiến độ dịch đổi: tải lại các trang đang gần màn hình mà còn block chưa dịch.
  useEffect(() => {
    if (!progress) return;
    const t = setTimeout(() => {
      nearPages.current.forEach((n) => {
        const pd = pagesRef.current[n];
        const unfinished = pd?.blocks.some((b) => b.status === "pending" || b.status === "translating");
        if (!pd || unfinished) void loadPage(n, true);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [progress?.done, progress?.pages_done, progress?.errors, progress?.status, loadPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- chọn block / popup
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

  const selectedBlock = selected
    ? (pages[selected.page]?.blocks.find((b) => b.id === selected.blockId) ?? null)
    : null;

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

  async function retryErrors() {
    await api.retryBook(bookId);
    restartProgress();
  }

  // ---------------------------------------------------------------- zoom / điều hướng trang
  const onAspect = useCallback(
    (n: number, a: number) =>
      setAspects((prev) => (Math.abs((prev[n] ?? 0) - a) < 0.001 ? prev : { ...prev, [n]: a })),
    [],
  );
  const onCenter = useCallback((n: number) => setCurrent(n), []);

  function changeZoom(next: number) {
    zoomRatio.current = window.scrollY / Math.max(1, document.documentElement.scrollHeight);
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
    [pdf],
  );
  const pagesTotal = progress?.pages_total || book?.page_count || progress?.total || 0;
  const pagesDone = progress
    ? (progress.pages_done ?? (progress.status === "done" ? pagesTotal : progress.done))
    : 0;
  const canRetry = !!progress && (progress.errors > 0 || progress.status === "error");

  return (
    <div className="reader">
      <header className="reader-bar">
        <Link to="/" className="btn">← Thư viện</Link>
        <div className="reader-title" title={book?.title}>{book?.title ?? "…"}</div>

        <div className="chip">
          {!progress ? null : progress.status === "parsing" ? (
            "Đang phân tích PDF…"
          ) : progress.status === "error" ? (
            <span className="err">{progress.error_msg}</span>
          ) : (
            <>
              <span>{progress.status === "translating" ? "Đang dịch" : "Đã dịch"} {pagesDone}/{pagesTotal}</span>
              {progress.errors > 0 && <span className="err">{progress.errors} lỗi</span>}
            </>
          )}
        </div>

        {canRetry && (
          <button className="btn btn-primary" onClick={retryErrors}>
            Dịch lại lỗi
          </button>
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
          />
          / {pdf?.numPages ?? "…"}
        </label>
        <div className="zoom">
          <button className="btn" onClick={() => changeZoom(zoom - 0.1)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="btn" onClick={() => changeZoom(zoom + 0.1)}>+</button>
          <button className="btn" onClick={() => changeZoom((window.innerWidth - 32) / BASE_WIDTH)}>Vừa</button>
        </div>
      </header>

      {error && <div className="notice err">{error}</div>}
      {!pdf && !error && <div className="notice">Đang tải PDF…</div>}

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
