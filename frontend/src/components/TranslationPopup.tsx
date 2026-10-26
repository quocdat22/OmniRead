import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import { useHighlightStyle } from "../hooks/useHighlightStyle";
import type { Block } from "../types";
import FormattedText from "./FormattedText";

interface Props {
  block: Block;
  reference: HTMLElement;
  pageWidth?: number;
  onClose: () => void;
}

export default function TranslationPopup({
  block, reference, pageWidth, onClose,
}: Props) {
  const { fontSize: popupFontSize } = useHighlightStyle();

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

  // Tính scale factor dựa theo tỷ lệ giữa kích thước hiển thị trên màn hình và PDF point gốc
  const pageEl = reference.closest(".pdf-page") as HTMLElement | null;
  const scale =
    pageEl && pageWidth
      ? pageEl.clientWidth / pageWidth
      : reference.parentElement && pageWidth
        ? reference.parentElement.clientWidth / pageWidth
        : 1;

  // Cỡ chữ theo CSS px:
  // Nếu block có font_size, tính theo tỷ lệ block.font_size * scale kết hợp với tỷ lệ điều chỉnh font size từ setting (mặc định 15px).
  // Nếu không có, sử dụng trực tiếp cỡ chữ popupFontSize đã chọn trong setting.
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
            <p><FormattedText text={block.translation!} /></p>
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
