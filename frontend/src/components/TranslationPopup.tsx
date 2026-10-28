import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHighlightStyle } from "../hooks/useHighlightStyle";
import type { Block } from "../types";
import { splitSentencesHtml } from "../utils/sentenceSplitter";
import FormattedText from "./FormattedText";

interface Props {
  block: Block;
  reference: HTMLElement;
  pageWidth?: number;
  onClose: () => void;
  onHoverSentence?: (rects: [number, number, number, number][] | null) => void;
}

export default function TranslationPopup({
  block, reference, pageWidth, onClose, onHoverSentence,
}: Props) {
  const { fontSize: popupFontSize } = useHighlightStyle();
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null);

  const onHoverSentenceRef = useRef(onHoverSentence);
  onHoverSentenceRef.current = onHoverSentence;

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => !open && onClose(),
    elements: { reference },
    placement: "bottom",
    whileElementsMounted: autoUpdate, // bám theo block khi cuộn / zoom
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ["top", "bottom"] }),
      size({
        padding: 12,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.width = `${Math.round(rects.reference.width)}px`;
          elements.floating.style.maxHeight = `${Math.max(140, availableHeight)}px`;
        },
      }),
      shift({ padding: 12 }),
    ],
  });
  // Esc + click ra ngoài để đóng.
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  const ready = block.status === "done" && !!block.translation;

  // Tách các câu trong bản dịch
  const sentences = useMemo(() => {
    if (!ready || !block.translation) return [];
    return splitSentencesHtml(block.translation);
  }, [ready, block.translation]);

  // Danh sách câu gốc từ backend
  const origSentences = useMemo(() => {
    if (block.sentences && block.sentences.length > 0) {
      return block.sentences;
    }
    return [{ text: block.text, rects: [block.bbox] }];
  }, [block.sentences, block.text, block.bbox]);

  // Reset highlight khi block thay đổi hoặc unmount
  useEffect(() => {
    setActiveSentenceIdx(null);
    onHoverSentenceRef.current?.(null);
    return () => {
      onHoverSentenceRef.current?.(null);
    };
  }, [block.id]);

  const handleSentenceMouseEnter = (sIdx: number) => {
    setActiveSentenceIdx(sIdx);
    if (!origSentences.length) {
      onHoverSentenceRef.current?.([block.bbox]);
      return;
    }

    // Ánh xạ câu dịch sIdx -> câu gốc origIdx
    let origIdx = sIdx;
    if (sentences.length !== origSentences.length) {
      origIdx = Math.min(
        origSentences.length - 1,
        Math.max(
          0,
          Math.round(
            (sIdx / Math.max(1, sentences.length - 1)) * (origSentences.length - 1)
          )
        )
      );
    }
    const target = origSentences[origIdx];
    onHoverSentenceRef.current?.(target?.rects || [block.bbox]);
  };

  const handleSentenceMouseLeave = () => {
    setActiveSentenceIdx(null);
    onHoverSentenceRef.current?.(null);
  };

  // Tính scale factor dựa theo tỷ lệ giữa kích thước hiển thị trên màn hình và PDF point gốc
  const pageEl = reference.closest(".pdf-page") as HTMLElement | null;
  const scale =
    pageEl && pageWidth
      ? pageEl.clientWidth / pageWidth
      : reference.parentElement && pageWidth
        ? reference.parentElement.clientWidth / pageWidth
        : 1;

  // Cỡ chữ theo CSS px:
  const baseSize = popupFontSize ?? 15;
  const computedFontSize = block.font_size
    ? Math.max(12, Math.round(block.font_size * scale * (baseSize / 15) * 10) / 10)
    : baseSize;

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="popup" {...getFloatingProps()}>
        <div className="popup-body" style={{ fontSize: `${computedFontSize}px` }}>
          {block.group_size > 1 && (
            <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "4px" }}>
              Đoạn nối qua trang (mảnh {block.part_no + 1}/{block.group_size})
            </div>
          )}
          {ready ? (
            <p>
              {sentences.map((sentText, idx) => (
                <span
                  key={idx}
                  className={`popup-sentence ${activeSentenceIdx === idx ? "active" : ""}`}
                  onMouseEnter={() => handleSentenceMouseEnter(idx)}
                  onMouseLeave={handleSentenceMouseLeave}
                >
                  <FormattedText text={sentText} />{" "}
                </span>
              ))}
            </p>
          ) : block.status === "error" ? (
            <p className="err">Dịch lỗi: {block.error_msg ?? "không rõ nguyên nhân"}</p>
          ) : (
            <p className="muted">Đang dịch… bản dịch sẽ tự hiện khi xong.</p>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
