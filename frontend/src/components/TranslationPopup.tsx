import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHighlightStyle } from "../hooks/useHighlightStyle";
import type { Block, SentenceInfo } from "../types";
import { splitSentencesHtml } from "../utils/sentenceSplitter";
import FormattedText from "./FormattedText";

interface Props {
  block: Block;
  reference: HTMLElement;
  pageWidth?: number;
  onClose: () => void;
  onHoverSentence?: (rects: [number, number, number, number][] | null) => void;
}

/**
 * Ánh xạ câu dịch thứ sIdx sang các bounding rects của câu gốc tương ứng.
 * - Khi số câu dịch == số câu gốc: khớp 1-1 chính xác tuyệt đối.
 * - Khi số câu khác nhau (do LLM ghép/tách câu): tính theo phạm vi tiến trình độ dài văn bản tích lũy
 *   để bao trọn mọi phần tương ứng trong bản gốc mà không bỏ sót câu nào.
 */
function getCorrespondingOrigRects(
  sIdx: number,
  sentences: string[],
  origSentences: SentenceInfo[],
  fallbackBbox: [number, number, number, number]
): [number, number, number, number][] {
  if (!origSentences.length) return [fallbackBbox];
  if (sentences.length === origSentences.length) {
    const target = origSentences[sIdx];
    return target && target.rects && target.rects.length > 0
      ? target.rects
      : [fallbackBbox];
  }

  const clean = (t: string) => t.replace(/<[^>]+>/g, "").trim();
  const transLens = sentences.map((s) => Math.max(1, clean(s).length));
  const origLens = origSentences.map((s) => Math.max(1, clean(s.text).length));

  const totalTrans = transLens.reduce((a, b) => a + b, 0);
  const totalOrig = origLens.reduce((a, b) => a + b, 0);

  let transStart = 0;
  for (let i = 0; i < sIdx; i++) transStart += transLens[i];
  const transEnd = transStart + transLens[sIdx];

  const rStart = transStart / totalTrans;
  const rEnd = transEnd / totalTrans;
  const rMid = (transStart + transLens[sIdx] / 2) / totalTrans;

  // Tìm tất cả các câu gốc có dải vị trí [oStart, oEnd] giao cắt với dải câu dịch [rStart, rEnd]
  const matched: SentenceInfo[] = [];
  let origCur = 0;
  for (let i = 0; i < origSentences.length; i++) {
    const oStart = origCur / totalOrig;
    origCur += origLens[i];
    const oEnd = origCur / totalOrig;

    if (Math.max(rStart, oStart) < Math.min(rEnd, oEnd) + 1e-4) {
      matched.push(origSentences[i]);
    }
  }

  if (matched.length === 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let oCur = 0;
    for (let i = 0; i < origSentences.length; i++) {
      const oMid = (oCur + origLens[i] / 2) / totalOrig;
      oCur += origLens[i];
      const dist = Math.abs(oMid - rMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    matched.push(origSentences[bestIdx]);
  }

  const allRects = matched.flatMap((s) => s.rects || []);
  return allRects.length > 0 ? allRects : [fallbackBbox];
}

export default function TranslationPopup({
  block, reference, pageWidth, onClose, onHoverSentence,
}: Props) {
  const { fontSize: popupFontSize } = useHighlightStyle();
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null);

  const onHoverSentenceRef = useRef(onHoverSentence);
  onHoverSentenceRef.current = onHoverSentence;
  const leaveTimerRef = useRef<number | null>(null);

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
      if (leaveTimerRef.current != null) {
        window.clearTimeout(leaveTimerRef.current);
      }
      onHoverSentenceRef.current?.(null);
    };
  }, [block.id]);

  const handleSentenceMouseEnter = (sIdx: number) => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setActiveSentenceIdx(sIdx);
    const rects = getCorrespondingOrigRects(sIdx, sentences, origSentences, block.bbox);
    onHoverSentenceRef.current?.(rects);
  };

  const handleSentenceMouseLeave = () => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      setActiveSentenceIdx(null);
      onHoverSentenceRef.current?.(null);
      leaveTimerRef.current = null;
    }, 60);
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
