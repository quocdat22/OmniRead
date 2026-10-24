import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import { useEffect, useState } from "react";
import type { Block } from "../types";

interface Props {
  block: Block;
  reference: HTMLElement;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRetranslate: () => void;
}

export default function TranslationPopup({
  block, reference, busy, error, onClose, onPrev, onNext, onRetranslate,
}: Props) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => !open && onClose(),
    elements: { reference },
    placement: "bottom",
    whileElementsMounted: autoUpdate, // bám theo block khi cuộn / zoom
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ["top", "bottom"] }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(140, availableHeight)}px`;
        },
      }),
    ],
  });
  // Esc + click ra ngoài để đóng.
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => setShowOriginal(false), [block.id]);

  const ready = block.status === "done" && !!block.translation;

  async function copy() {
    if (!block.translation) return;
    await navigator.clipboard.writeText(block.translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="popup" {...getFloatingProps()}>
        <div className="popup-body">
          {ready ? (
            <p className={busy ? "dim" : undefined}>{block.translation}</p>
          ) : block.status === "error" ? (
            <p className="err">Dịch lỗi: {block.error_msg ?? "không rõ nguyên nhân"}</p>
          ) : (
            <p className="muted">Đang dịch… bản dịch sẽ tự hiện khi xong.</p>
          )}
          {busy && <p className="muted">Đang dịch lại…</p>}
          {error && <p className="err">{error}</p>}
          {showOriginal && <p className="original">{block.text}</p>}
        </div>

        <div className="popup-actions">
          <button onClick={onPrev} title="Đoạn trước (←)">‹</button>
          <button onClick={onNext} title="Đoạn sau (→)">›</button>
          <span className="grow" />
          <button onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? "Ẩn gốc" : "Bản gốc"}</button>
          <button onClick={copy} disabled={!ready}>{copied ? "Đã chép" : "Chép"}</button>
          <button onClick={onRetranslate} disabled={busy}>Dịch lại</button>
          <button onClick={onClose} title="Đóng (Esc)">✕</button>
        </div>
      </div>
    </FloatingPortal>
  );
}
