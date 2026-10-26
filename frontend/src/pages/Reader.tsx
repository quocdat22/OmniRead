import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import PdfPage from "../components/PdfPage";
import TranslationPopup from "../components/TranslationPopup";
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

  const [progress, restartProgress] = useProgress(bookId);

  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const inflight = useRef(new Set<number>());
  const nearPages = useRef(new Set<number>());
  const canSave = useRef(false);
  const zoomRatio = useRef<number | null>(null);

  // ---------------------------------------------------------------- tải sách + PDF
  useEffect(() => {
    let cancelled = false;
    setError(null);

    api.getBook(bookId)
      .then((b) => {
        if (!cancelled) setBook(b);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    const task = pdfjs.getDocument({ url: api.fileUrl(bookId) });
    task.promise
      .then(async (doc) => {
        if (cancelled) return;
        const page1 = await doc.getPage(1);
        if (cancelled) return;
        const v = page1.getViewport({ scale: 1 });
        setDefaultAspect(v.height / v.width);
        setPdf(doc);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.name === "AbortException" || e.message?.toLowerCase().includes("abort")) return;
        setError(`Không mở được PDF: ${e.message}`);
      });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bookId]);

  // Khôi phục trang đọc dở.
  useEffect(() => {
    if (!pdf) return;
    const saved = readSavedPage(bookId);
    requestAnimationFrame(() => {
      if (saved > 1) document.getElementById(`page-${saved}`)?.scrollIntoView();
      setTimeout(() => (canSave.current = true), 400);
    });
  }, [pdf, bookId]);

  useEffect(() => {
    setJump(String(current));
    if (!canSave.current) return;
    try {
      localStorage.setItem(lastPageKey(bookId), String(current));
    } catch {
      /* bỏ qua */
    }
  }, [current, bookId]);

  // ---------------------------------------------------------------- tải block theo trang
  const loadPage = useCallback(
    async (n: number, force = false) => {
      if (inflight.current.has(n) || (!force && pagesRef.current[n])) return;
      inflight.current.add(n);
      try {
        const data = await api.getBlocks(bookId, n);
        setPages((p) => ({ ...p, [n]: data }));
      } catch (e) {
        // 409 = sách đang parse: sẽ thử lại khi tiến độ đổi trạng thái.
        if (!(e instanceof ApiError && e.status === 409)) console.error(e);
      } finally {
        inflight.current.delete(n);
      }
    },
    [bookId],
  );

  const onNear = useCallback(
    (n: number, near: boolean) => {
      if (near) {
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
  }, [progress?.done, progress?.errors, progress?.status, loadPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- chọn block / popup
  const onSelectBlock = useCallback((block: Block, el: HTMLElement) => {
    setSelected((prev) =>
      prev?.blockId === block.id
        ? null
        : { page: block.page, blockId: block.id, groupId: block.group_id, el },
    );
  }, []);

  const closePopup = useCallback(() => setSelected(null), []);

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
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
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
              <span>{progress.status === "translating" ? "Đang dịch" : "Đã dịch"} {progress.done}/{progress.total}</span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              {progress.errors > 0 && <span className="err">{progress.errors} lỗi</span>}
            </>
          )}
          {canRetry && <button className="btn" onClick={retryErrors}>Thử lại</button>}
        </div>

        <span className="grow" />
        <label className="page-jump">
          Trang
          <input
            type="number" min={1} max={pdf?.numPages} value={jump}
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

      <main className="pages">
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
        />
      )}
    </div>
  );
}
