import type { Block } from "../types";

interface Props {
  block: Block;
  pageWidth: number; // point, từ backend (page.width)
  pageHeight: number;
  selected: boolean;
  onSelect: (block: Block, el: HTMLElement) => void;
}

/**
 * Vùng bấm được đặt đè lên canvas. Dùng toạ độ % theo kích thước trang gốc
 * nên không cần tính lại khi zoom / đổi độ phân giải canvas.
 */
export default function BlockOverlay({ block, pageWidth, pageHeight, selected, onSelect }: Props) {
  const [x0, y0, x1, y1] = block.bbox;
  const style = {
    left: `${(x0 / pageWidth) * 100}%`,
    top: `${(y0 / pageHeight) * 100}%`,
    width: `${((x1 - x0) / pageWidth) * 100}%`,
    height: `${((y1 - y0) / pageHeight) * 100}%`,
  };
  const cls = ["block", selected && "selected", block.status === "error" && "error"]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={style}
      data-block-id={block.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block, e.currentTarget);
      }}
    />
  );
}
