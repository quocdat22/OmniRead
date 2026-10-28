import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import { useEffect, useMemo, useState } from "react";
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

    const overlap = Math.max(0, Math.min(rEnd, oEnd) - Math.max(rStart, oStart));
    if (overlap > 0) {
      matched.push(origSentences[i]);
    }
  }

  if (matched.length > 0) {
    const allRects: [number, number, number, number][] = [];
    for (const m of matched) {
      if (m.rects && m.rects.length > 0) {
        allRects.push(...m.rects);
      }
    }
    if (allRects.length > 0) return allRects;
  }

  // Fallback nếu không tính được giao cắt: tìm câu gốc có điểm giữa gần nhất
  let bestIdx = 0;
  let minDiff = Infinity;
  let accum = 0;
  for (let i = 0; i < origSentences.length; i++) {
    const origMid = (accum + origLens[i] / 2) / totalOrig;
    accum += origLens[i];
    const diff = Math.abs(origMid - rMid);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }
  const fallbackTarget = origSentences[bestIdx];
  return fallbackTarget && fallbackTarget.rects && fallbackTarget.rects.length > 0
    ? fallbackTarget.rects
    : [fallbackBbox];
}

export default function TranslationPopup({
  block,
  reference,
  pageWidth: _pageWidth,
  onClose,
  onHoverSentence,
}: Props) {
  const { fontSize: baseSize } = useHighlightStyle();
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null);

  // Split bản dịch thành các câu
  const sentences = useMemo(() => {
    if (!block.translation) return [];
    return splitSentencesHtml(block.translation);
  }, [block.translation]);

  // Floating UI positioning
  const { refs, floatingStyles, context } = useFloating({
    placement: "bottom",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ["top", "right", "left"] }),
      shift({ padding: 12 }),
      size({
        apply({ rects, elements, availableHeight }) {
          const refW = rects.reference.width;
          const maxW = Math.max(refW, 360);
          const screenMax = window.innerWidth - 24;
          const finalMax = Math.min(maxW, screenMax);

          Object.assign(elements.floating.style, {
            width: `${Math.max(refW, Math.min(finalMax, 520))}px`,
            maxWidth: `${finalMax}px`,
            maxHeight: `${Math.min(availableHeight - 16, 450)}px`,
          });
        },
      }),
    ],
  });

  const dismiss = useDismiss(context, {
    outsidePress: true,
    escapeKey: true,
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    refs.setReference(reference);
  }, [reference, refs]);

  // Esc để đóng popup
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Hover câu dịch -> tìm và kích hoạt bounding rects câu gốc
  const handleSentenceMouseEnter = (sIdx: number) => {
    setActiveSentenceIdx(sIdx);
    if (!onHoverSentence) return;

    const origSentences = block.sentences || [];
    const rects = getCorrespondingOrigRects(sIdx, sentences, origSentences, block.bbox);
    onHoverSentence(rects);
  };

  const handleSentenceMouseLeave = () => {
    setActiveSentenceIdx(null);
    if (onHoverSentence) {
      onHoverSentence(null);
    }
  };

  // Cleanup highlight khi popup bị unmount
  useEffect(() => {
    return () => {
      if (onHoverSentence) onHoverSentence(null);
    };
  }, [onHoverSentence]);

  const ready = block.status === "done" && block.translation;

  // Tính scale font size theo kích thước trang thực tế
  const refWidth = reference.getBoundingClientRect().width;
  const blockPtWidth = block.bbox[2] - block.bbox[0];
  const scale = blockPtWidth > 0 ? refWidth / blockPtWidth : 1;
  const computedFontSize = block.font_size
    ? Math.max(12, Math.round(block.font_size * scale * (baseSize / 15) * 10) / 10)
    : baseSize;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[1000] min-w-[min(260px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex flex-col bg-surface text-foreground border border-border rounded-xl shadow-2xl backdrop-blur-sm"
        {...getFloatingProps()}
      >
        <div className="p-3.5 overflow-auto leading-relaxed" style={{ fontSize: `${computedFontSize}px` }}>
          {block.group_size > 1 && (
            <div className="text-[11px] text-muted mb-1 font-medium">
              Đoạn nối qua trang (mảnh {block.part_no + 1}/{block.group_size})
            </div>
          )}
          {ready ? (
            <p className="m-0 whitespace-pre-wrap">
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
            <p className="m-0 text-danger text-sm">Dịch lỗi: {block.error_msg ?? "không rõ nguyên nhân"}</p>
          ) : (
            <p className="m-0 text-muted text-sm">Đang dịch… bản dịch sẽ tự hiện khi xong.</p>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
