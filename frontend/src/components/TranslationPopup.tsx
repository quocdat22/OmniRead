import {
  autoUpdate, flip, FloatingPortal, offset, shift, size,
  useDismiss, useFloating, useInteractions,
} from "@floating-ui/react";
import type { Block } from "../types";
import FormattedText from "./FormattedText";

interface Props {
  block: Block;
  reference: HTMLElement;
  onClose: () => void;
}

export default function TranslationPopup({
  block, reference, onClose,
}: Props) {
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

  const ready = block.status === "done" && !!block.translation;

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="popup" {...getFloatingProps()}>
        <div className="popup-body">
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
