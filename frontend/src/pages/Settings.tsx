import type React from "react";
import { Link } from "react-router-dom";
import { COLOR_PRESETS, useHighlightStyle } from "../hooks/useHighlightStyle";
import type { HighlightStyle } from "../types";

interface OptionItem {
  id: HighlightStyle;
  title: string;
}

const OPTIONS: OptionItem[] = [
  { id: "bar", title: "Vạch sáng bên trái" },
  { id: "background", title: "Tô nền đoạn văn" },
  { id: "border", title: "Đóng khung viền" },
];

const SAMPLE_BLOCK = {
  original:
    "OmniRead is designed to make reading foreign language documents natural and effortless. By clicking any text block, you instantly receive contextual translations while preserving the document's original reading flow.",
  translation:
    "OmniRead được thiết kế để giúp việc đọc tài liệu ngoại ngữ trở nên tự nhiên và dễ dàng. Bằng cách nhấp vào bất kỳ khối văn bản nào, bạn sẽ nhận được bản dịch ngữ cảnh tức thì mà vẫn giữ nguyên luồng đọc ban đầu.",
};

export default function Settings() {
  const {
    style: highlightStyle,
    setStyle: setHighlightStyle,
    padding: highlightPadding,
    setPadding: setHighlightPadding,
    color: highlightColor,
    setColor: setHighlightColor,
    colorPreset,
    fontSize: popupFontSize,
    setFontSize: setPopupFontSize,
  } = useHighlightStyle();

  const isPaddingEnabled = highlightStyle === "background" || highlightStyle === "border";

  return (
    <div className="settings">
      <div className="settings-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/" className="btn">
            ← Thư viện
          </Link>
          <div>
            <h1>Cài đặt</h1>
            <p className="settings-subtitle">Tùy biến hiển thị và trải nghiệm đọc sách thông minh</p>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-card">
          <div className="settings-card-header">
            <h2>Kiểu đánh dấu vùng chọn (Block Highlight)</h2>
            <p>
              Chọn cách khối/đoạn văn bản được làm nổi bật khi bạn click để xem bản dịch qua popup.
            </p>
          </div>

          <div className="option-grid">
            {OPTIONS.map((opt) => {
              const isSelected = highlightStyle === opt.id;
              return (
                <div
                  key={opt.id}
                  className={`option-card${isSelected ? " active" : ""}`}
                  data-style={opt.id}
                  onClick={() => setHighlightStyle(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setHighlightStyle(opt.id)}
                >
                  <span className="option-radio">
                    {isSelected && <span className="option-radio-dot" />}
                  </span>
                  <h3 className="option-card-title">{opt.title}</h3>
                </div>
              );
            })}
          </div>

          {/* ---------------- Option màu sắc ---------------- */}
          <div className="setting-color-row">
            <div className="setting-color-header">
              <span>Màu sắc đánh dấu:</span>
              <strong>{colorPreset.name}</strong>
            </div>
            <div className="color-swatches">
              {COLOR_PRESETS.map((col) => {
                const isSelected = highlightColor === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    className={`color-swatch-btn${isSelected ? " active" : ""}`}
                    style={{ "--swatch-color": col.hex } as React.CSSProperties}
                    onClick={() => setHighlightColor(col.id)}
                    title={col.name}
                    aria-label={col.name}
                  >
                    <span className="color-swatch-circle" />
                    {isSelected && <span className="color-swatch-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- Slider thiết lập Padding ---------------- */}
          <div className={`setting-slider-row${!isPaddingEnabled ? " disabled" : ""}`}>
            <div className="slider-label">
              <span>Khoảng đệm (Padding):</span>
              <strong>{highlightPadding}px</strong>
            </div>
            <div className="slider-control">
              <input
                type="range"
                min={0}
                max={16}
                step={1}
                value={highlightPadding}
                disabled={!isPaddingEnabled}
                onChange={(e) => setHighlightPadding(Number(e.target.value))}
                className="padding-slider"
                aria-label="Khoảng đệm padding"
              />
              <div className="slider-ticks">
                <span>0px</span>
                <span>4px</span>
                <span>8px</span>
                <span>12px</span>
                <span>16px</span>
              </div>
            </div>
          </div>

          {/* ---------------- Slider thiết lập Font Size của Popup ---------------- */}
          <div className="setting-slider-row">
            <div className="slider-label">
              <span>Cỡ chữ nội dung popup:</span>
              <strong>{popupFontSize}px</strong>
            </div>
            <div className="slider-control">
              <input
                type="range"
                min={12}
                max={24}
                step={1}
                value={popupFontSize}
                onChange={(e) => setPopupFontSize(Number(e.target.value))}
                className="padding-slider"
                aria-label="Cỡ chữ nội dung popup"
              />
              <div className="slider-ticks">
                <span>12px</span>
                <span>15px</span>
                <span>18px</span>
                <span>21px</span>
                <span>24px</span>
              </div>
            </div>
          </div>

          {/* ---------------- Live Preview Section ---------------- */}
          <div className="preview-box">
            <div className="preview-header">
              <div className="preview-header-title">Xem trước (Live Preview)</div>
            </div>

            <div
              className="preview-paper"
              data-highlight-style={highlightStyle}
              style={
                {
                  "--highlight-padding": `${highlightPadding}px`,
                  "--highlight-color": colorPreset.hex,
                  "--highlight-color-rgb": colorPreset.rgb,
                } as React.CSSProperties
              }
            >
              <div className="preview-block selected">
                {SAMPLE_BLOCK.original}
              </div>

              <div className="preview-popup-wrapper">
                <div className="preview-popup">
                  <div
                    className="preview-popup-body"
                    style={{ fontSize: `${popupFontSize}px` }}
                  >
                    <p style={{ margin: 0 }}>{SAMPLE_BLOCK.translation}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
