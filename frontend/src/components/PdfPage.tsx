import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { memo, useEffect, useRef, useState } from "react";
import type { Block, PageData } from "../types";
import BlockOverlay from "./BlockOverlay";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  aspect: number; // height / width, dùng cho placeholder trước khi render
  data?: PageData;
  selectedBlockId: number | null;
  onAspect: (page: number, aspect: number) => void;
  onNear: (page: number, near: boolean) => void;
  onCenter: (page: number) => void;
  onSelectBlock: (block: Block, el: HTMLElement) => void;
}

function PdfPage({
  pdf, pageNumber, cssWidth, aspect, data, selectedBlockId,
  onAspect, onNear, onCenter, onSelectBlock,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  // 1) Lazy: chỉ render canvas + tải block khi trang gần vùng nhìn thấy.
  useEffect(() => {
    const el = rootRef.current!;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    onNear(pageNumber, near);
  }, [near, pageNumber, onNear]);

  // 2) Trang đang nằm ở giữa màn hình = "trang hiện tại" (dải rộng 0px ở giữa viewport).
  useEffect(() => {
    const el = rootRef.current!;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && onCenter(pageNumber),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, onCenter]);

  // 3) Render canvas (sắc nét theo devicePixelRatio, render lại khi đổi zoom).
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      onAspect(pageNumber, base.height / base.width);
      const viewport = page.getViewport({
        scale: (cssWidth / base.width) * (window.devicePixelRatio || 1),
      });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch (e) {
        if ((e as Error).name !== "RenderingCancelledException") console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, pdf, pageNumber, cssWidth, onAspect]);

  // 4) Trang ở xa: giải phóng bitmap để tiết kiệm RAM.
  useEffect(() => {
    const c = canvasRef.current;
    if (!near && c) c.width = c.height = 0;
  }, [near]);

  return (
    <div
      ref={rootRef}
      id={`page-${pageNumber}`}
      className="pdf-page"
      style={{ width: cssWidth, aspectRatio: `1 / ${aspect}` }}
    >
      <span className="page-no">{pageNumber}</span>
      <canvas ref={canvasRef} />
      {data && (
        <div className="overlay">
          {data.blocks.map((b) => (
            <BlockOverlay
              key={b.id}
              block={b}
              pageWidth={data.page.width}
              pageHeight={data.page.height}
              selected={b.id === selectedBlockId}
              onSelect={onSelectBlock}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(PdfPage);
