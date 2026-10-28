import type React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import {
  COLOR_PRESETS,
  DEFAULT_HIGHLIGHT_PADDING,
  DEFAULT_POPUP_FONT_SIZE,
  useHighlightStyle,
} from "../hooks/useHighlightStyle";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import type { HighlightStyle, SentenceHighlightStyle } from "../types";

interface OptionItem {
  id: HighlightStyle;
  title: string;
}

const THEME_OPTIONS: { id: ThemePreference; title: string; desc: string; icon: string }[] = [
  { id: "light", title: "Giao diện Sáng", desc: "Tối ưu cho ban ngày hoặc môi trường đủ sáng", icon: "☀️" },
  { id: "dark", title: "Giao diện Tối", desc: "Dịu mắt khi đọc sách vào ban đêm", icon: "🌙" },
  { id: "system", title: "Theo hệ thống", desc: "Tự động đồng bộ theo chế độ của thiết bị", icon: "💻" },
];

const OPTIONS: OptionItem[] = [
  { id: "bar", title: "Vạch sáng bên trái" },
  { id: "background", title: "Tô nền đoạn văn" },
  { id: "border", title: "Đóng khung viền" },
];

const SENTENCE_OPTIONS: { id: SentenceHighlightStyle; title: string; desc: string }[] = [
  {
    id: "bracket",
    title: "Dấu ngoặc góc 「 … 」 (Khuyên dùng)",
    desc: "Đánh dấu tinh tế ở đầu và cuối câu, giữ trang sách sạch sẽ và không che văn bản gốc.",
  },
  {
    id: "block",
    title: "Khối phủ (Block Highlight)",
    desc: "Tô nền sáng và viền màu bao phủ toàn bộ câu văn tương ứng trong tài liệu gốc.",
  },
];

const SAMPLE_BLOCK = {
  originalSentences: [
    "OmniRead is designed to make reading foreign language documents natural and effortless.",
    "By clicking any text block, you instantly receive contextual translations while preserving the document's original reading flow.",
  ],
  translationSentences: [
    "OmniRead được thiết kế để giúp việc đọc tài liệu ngoại ngữ trở nên tự nhiên và dễ dàng.",
    "Bằng cách nhấp vào bất kỳ khối văn bản nào, bạn sẽ nhận được bản dịch ngữ cảnh tức thì mà vẫn giữ nguyên luồng đọc ban đầu.",
  ],
};

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const {
    style: highlightStyle,
    setStyle: setHighlightStyle,
    sentenceStyle,
    setSentenceStyle,
    padding: highlightPadding,
    setPadding: setHighlightPadding,
    color: highlightColor,
    setColor: setHighlightColor,
    colorPreset,
    fontSize: popupFontSize,
    setFontSize: setPopupFontSize,
  } = useHighlightStyle();

  const [previewHoveredSentence, setPreviewHoveredSentence] = useState<number | null>(0);

  const isPaddingEnabled = highlightStyle === "background" || highlightStyle === "border";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
          >
            ← Thư viện
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cài đặt</h1>
            <p className="text-sm text-muted mt-0.5">Tùy biến hiển thị và trải nghiệm đọc sách thông minh</p>
          </div>
        </div>

        <ThemeToggle />
      </div>

      <div className="flex flex-col gap-6">
        {/* ---------------- Card 1: Giao diện (Dark / Light mode) ---------------- */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              🎨 Chế độ hiển thị (Theme)
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Chọn giao diện sáng, tối hoặc tự động chuyển đổi theo cài đặt hệ điều hành của bạn.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTheme(opt.id)}
                  className={`flex flex-col gap-1.5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-accent bg-accent/5 shadow-xs"
                      : "border-border bg-surface hover:border-accent/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{opt.icon}</span>
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-accent bg-accent" : "border-border"
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mt-1">{opt.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{opt.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------- Card 2: Highlight Settings ---------------- */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              📑 Kiểu đánh dấu vùng chọn (Block Highlight)
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Chọn cách khối/đoạn văn bản được làm nổi bật khi bạn click để xem bản dịch qua popup.
            </p>
          </div>

          {/* Option Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {OPTIONS.map((opt) => {
              const isSelected = highlightStyle === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setHighlightStyle(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setHighlightStyle(opt.id)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-accent bg-accent/5 shadow-xs"
                      : "border-border bg-surface hover:border-accent/60"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-accent bg-accent" : "border-border"
                    }`}
                  >
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <h3 className="font-medium text-sm text-foreground">{opt.title}</h3>
                </div>
              );
            })}
          </div>

          {/* Option: Sentence Highlight Style */}
          <div className="p-4 rounded-xl border border-border bg-surface-hover/30">
            <div className="flex items-center justify-between text-sm font-medium mb-1">
              <span className="text-foreground">Kiểu sáng câu đối chiếu gốc khi hover:</span>
              <strong className="text-accent">
                {sentenceStyle === "bracket" ? "Dấu ngoặc góc 「 … 」" : "Khối phủ (Block)"}
              </strong>
            </div>
            <p className="text-xs text-muted mb-3">
              Chọn cách câu văn trong tài liệu gốc sáng lên khi bạn rê chuột vào từng câu dịch trong popup.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SENTENCE_OPTIONS.map((opt) => {
                const isSelected = sentenceStyle === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSentenceStyle(opt.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSentenceStyle(opt.id)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-accent bg-accent/5 shadow-xs"
                        : "border-border bg-surface hover:border-accent/60"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? "border-accent bg-accent" : "border-border"
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <div>
                      <h3 className="font-medium text-sm text-foreground">{opt.title}</h3>
                      <p className="text-xs text-muted mt-1 leading-relaxed">{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Option: Highlight Color Swatches */}
          <div className="p-4 rounded-xl border border-border bg-surface-hover/30">
            <div className="flex items-center justify-between text-sm font-medium mb-1">
              <span className="text-foreground">Màu sắc nổi bật (Highlight Color):</span>
              <strong className="text-accent">{colorPreset.name}</strong>
            </div>
            <p className="text-xs text-muted mb-3">
              Màu sắc đánh dấu khối và ký hiệu đối chiếu câu. Ký hiệu câu sẽ đồng bộ theo tông màu này.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {COLOR_PRESETS.map((col) => {
                const isSelected = highlightColor === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setHighlightColor(col.id)}
                    title={col.name}
                    aria-label={`Màu: ${col.name}`}
                    className={`w-8 h-8 rounded-full border-2 p-0.5 relative cursor-pointer transition-transform hover:scale-110 flex items-center justify-center ${
                      isSelected ? "border-foreground scale-105 shadow-xs" : "border-transparent"
                    }`}
                  >
                    <span
                      className="w-full h-full rounded-full shadow-inner"
                      style={{ backgroundColor: col.hex }}
                    />
                    {isSelected && (
                      <span className="absolute text-white text-xs font-bold drop-shadow-sm">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Option: Padding Slider */}
          <div
            className={`p-4 rounded-xl border border-border bg-surface-hover/30 transition-opacity ${
              !isPaddingEnabled ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            <div className="flex items-center justify-between text-sm font-medium mb-2">
              <span className="text-foreground">Khoảng đệm (Padding):</span>
              <div className="flex items-center gap-2">
                {highlightPadding === DEFAULT_HIGHLIGHT_PADDING && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                    Mặc định
                  </span>
                )}
                <strong className="text-accent">{highlightPadding}px</strong>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min={0}
                max={16}
                step={1}
                value={highlightPadding}
                disabled={!isPaddingEnabled}
                onChange={(e) => setHighlightPadding(Number(e.target.value))}
                className="w-full h-1.5 accent-accent cursor-pointer"
                aria-label="Khoảng đệm padding"
              />
              <div className="flex justify-between text-[11px] text-muted select-none">
                <span>0px</span>
                <span className="font-semibold text-accent">4px (Mặc định)</span>
                <span>8px</span>
                <span>12px</span>
                <span>16px</span>
              </div>
            </div>
          </div>

          {/* Option: Popup Font Size Slider */}
          <div className="p-4 rounded-xl border border-border bg-surface-hover/30">
            <div className="flex items-center justify-between text-sm font-medium mb-2">
              <span className="text-foreground">Cỡ chữ nội dung popup:</span>
              <div className="flex items-center gap-2">
                {popupFontSize === DEFAULT_POPUP_FONT_SIZE && (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                    Mặc định
                  </span>
                )}
                <strong className="text-accent">{popupFontSize}px</strong>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min={12}
                max={24}
                step={1}
                value={popupFontSize}
                onChange={(e) => setPopupFontSize(Number(e.target.value))}
                className="w-full h-1.5 accent-accent cursor-pointer"
                aria-label="Cỡ chữ nội dung popup"
              />
              <div className="flex justify-between text-[11px] text-muted select-none">
                <span>12px</span>
                <span className="font-semibold text-accent">15px (Mặc định)</span>
                <span>18px</span>
                <span>21px</span>
                <span>24px</span>
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-5 rounded-2xl border border-border bg-surface-hover/20 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <span>👁️</span> Xem trước trực tiếp (Live Preview)
              </div>
              <span className="text-xs text-muted">
                Rê chuột vào câu ở popup để thử nghiệm đối chiếu câu
              </span>
            </div>

            <div
              className="preview-paper"
              data-highlight-style={highlightStyle}
              style={
                {
                  "--highlight-padding": `${highlightPadding}px`,
                  "--highlight-color": colorPreset.hex,
                  "--highlight-color-rgb": colorPreset.rgb,
                  "--sentence-highlight-color": colorPreset.sentenceHex,
                  "--sentence-highlight-color-rgb": colorPreset.sentenceRgb,
                } as React.CSSProperties
              }
            >
              <div className="preview-block selected">
                {SAMPLE_BLOCK.originalSentences.map((s, idx) => {
                  const isHovered = previewHoveredSentence === idx;
                  if (sentenceStyle === "bracket") {
                    return (
                      <span
                        key={idx}
                        className={`preview-sentence-bracket${isHovered ? " active" : ""}`}
                      >
                        {isHovered && <span className="preview-bracket-mark bracket-start">「</span>}
                        {s}
                        {isHovered && <span className="preview-bracket-mark bracket-end">」</span>}{" "}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={idx}
                      className={isHovered ? "preview-sentence-highlight" : ""}
                    >
                      {s}{" "}
                    </span>
                  );
                })}
              </div>

              <div className="my-2 ml-3">
                <div className="p-3.5 rounded-xl border border-border bg-surface text-foreground shadow-lg max-w-lg">
                  <div style={{ fontSize: `${popupFontSize}px` }} className="leading-relaxed">
                    <p className="m-0">
                      {SAMPLE_BLOCK.translationSentences.map((s, idx) => (
                        <span
                          key={idx}
                          className={`popup-sentence ${previewHoveredSentence === idx ? "active" : ""}`}
                          onMouseEnter={() => setPreviewHoveredSentence(idx)}
                          onMouseLeave={() => setPreviewHoveredSentence(null)}
                        >
                          {s}{" "}
                        </span>
                      ))}
                    </p>
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
