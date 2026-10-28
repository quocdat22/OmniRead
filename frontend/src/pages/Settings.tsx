import {
  ArrowLeft,
  Bot,
  Check,
  Keyboard,
  KeyRound,
  Layers,
  Palette,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
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

  const [previewHoveredSentence, setPreviewHoveredSentence] = useState<number | null>(null);

  const isPaddingEnabled = highlightStyle === "background" || highlightStyle === "border";

  return (
    <div className="settings">
      <div className="settings-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/" className="btn inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>Thư viện</span>
          </Link>
          <div>
            <h1>Cài đặt</h1>
            <p className="settings-subtitle">Tùy biến hiển thị và trải nghiệm đọc sách thông minh</p>
          </div>
        </div>

        <ThemeToggle />
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="appearance" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Palette className="h-4 w-4" />
            <span>Giao diện & Highlight</span>
          </TabsTrigger>
          <TabsTrigger value="translation" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Bot className="h-4 w-4" />
            <span>Dịch thuật & AI</span>
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Keyboard className="h-4 w-4" />
            <span>Phím tắt & Trợ năng</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Appearance */}
        <TabsContent value="appearance">
          <div className="settings-group">
            {/* Theme Selection Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>🎨 Chế độ hiển thị (Theme)</h2>
                <p>
                  Chọn giao diện sáng, tối hoặc tự động chuyển đổi theo cài đặt hệ điều hành của bạn.
                </p>
              </div>

              <div className="option-grid">
                {THEME_OPTIONS.map((opt) => {
                  const isSelected = theme === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className={`option-card${isSelected ? " active" : ""}`}
                      onClick={() => setTheme(opt.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTheme(opt.id)}
                    >
                      <span className="option-radio">
                        {isSelected && <span className="option-radio-dot" />}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span>{opt.icon}</span>
                          <h3 className="option-card-title">{opt.title}</h3>
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.4 }}>
                          {opt.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Block Highlight Card */}
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

              {/* Option Kiểu đối chiếu câu trong tài liệu gốc */}
              <div className="setting-color-row">
                <div className="setting-color-header">
                  <span>Kiểu sáng câu đối chiếu gốc khi hover:</span>
                  <strong>{sentenceStyle === "bracket" ? "Dấu ngoặc góc 「 … 」" : "Khối phủ (Block)"}</strong>
                </div>
                <p style={{ margin: "4px 0 12px", fontSize: "13px", color: "var(--muted)" }}>
                  Chọn cách câu văn trong tài liệu gốc sáng lên khi bạn rê chuột vào từng câu dịch trong popup.
                </p>
                <div className="option-grid" style={{ marginBottom: 0 }}>
                  {SENTENCE_OPTIONS.map((opt) => {
                    const isSelected = sentenceStyle === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`option-card${isSelected ? " active" : ""}`}
                        onClick={() => setSentenceStyle(opt.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSentenceStyle(opt.id)}
                      >
                        <span className="option-radio">
                          {isSelected && <span className="option-radio-dot" />}
                        </span>
                        <div>
                          <h3 className="option-card-title">{opt.title}</h3>
                          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.4 }}>
                            {opt.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Option màu sắc đánh dấu block & câu */}
              <div className="setting-color-row">
                <div className="setting-color-header">
                  <span>Màu sắc nổi bật (Highlight Color):</span>
                  <strong>{colorPreset.name}</strong>
                </div>
                <p style={{ margin: "4px 0 10px", fontSize: "13px", color: "var(--muted)" }}>
                  Màu sắc đánh dấu khối và ký hiệu đối chiếu câu. Ký hiệu câu sẽ đồng bộ theo tông màu này để tạo sự thống nhất.
                </p>
                <div className="color-swatches">
                  {COLOR_PRESETS.map((col) => {
                    const isSelected = highlightColor === col.id;
                    return (
                      <SimpleTooltip key={col.id} content={`${col.name} (${col.hex})`}>
                        <button
                          type="button"
                          className={`color-swatch-btn${isSelected ? " active" : ""}`}
                          style={{ "--swatch-color": col.hex } as React.CSSProperties}
                          onClick={() => setHighlightColor(col.id)}
                          aria-label={`Màu: ${col.name}`}
                        >
                          <span className="color-swatch-circle" />
                          {isSelected && (
                            <span className="color-swatch-check">
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            </span>
                          )}
                        </button>
                      </SimpleTooltip>
                    );
                  })}
                </div>
              </div>

              {/* Radix Slider thiết lập Padding */}
              <div className={`setting-slider-row${!isPaddingEnabled ? " disabled opacity-50 pointer-events-none" : ""}`}>
                <div className="slider-label">
                  <span>Khoảng đệm (Padding):</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {highlightPadding === DEFAULT_HIGHLIGHT_PADDING && (
                      <span className="default-tag">Mặc định</span>
                    )}
                    <strong>{highlightPadding}px</strong>
                  </div>
                </div>
                <div className="slider-control py-2">
                  <Slider
                    min={0}
                    max={16}
                    step={1}
                    value={[highlightPadding]}
                    disabled={!isPaddingEnabled}
                    onValueChange={(val) => setHighlightPadding(val[0])}
                    aria-label="Khoảng đệm padding"
                  />
                  <div className="slider-ticks">
                    <span>0px</span>
                    <span className="tick-default">4px (Mặc định)</span>
                    <span>8px</span>
                    <span>12px</span>
                    <span>16px</span>
                  </div>
                </div>
              </div>

              {/* Radix Slider thiết lập Font Size của Popup */}
              <div className="setting-slider-row">
                <div className="slider-label">
                  <span>Cỡ chữ nội dung popup:</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {popupFontSize === DEFAULT_POPUP_FONT_SIZE && (
                      <span className="default-tag">Mặc định</span>
                    )}
                    <strong>{popupFontSize}px</strong>
                  </div>
                </div>
                <div className="slider-control py-2">
                  <Slider
                    min={12}
                    max={24}
                    step={1}
                    value={[popupFontSize]}
                    onValueChange={(val) => setPopupFontSize(val[0])}
                    aria-label="Cỡ chữ nội dung popup"
                  />
                  <div className="slider-ticks">
                    <span>12px</span>
                    <span className="tick-default">15px (Mặc định)</span>
                    <span>18px</span>
                    <span>21px</span>
                    <span>24px</span>
                  </div>
                </div>
              </div>

              {/* Live Preview Section */}
              <div className="preview-box">
                <div className="preview-header">
                  <div className="preview-header-title">Xem trước (Live Preview)</div>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
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

                  <div className="preview-popup-wrapper">
                    <div className="preview-popup">
                      <div
                        className="preview-popup-body"
                        style={{ fontSize: `${popupFontSize}px` }}
                      >
                        <p style={{ margin: 0 }}>
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
        </TabsContent>

        {/* Tab 2: Translation & AI */}
        <TabsContent value="translation">
          <div className="settings-group">
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>Cấu hình Dịch thuật & Mô hình DeepSeek</h2>
                <p>Thông tin và cơ chế xử lý song ngữ thông minh trong OmniRead.</p>
              </div>

              <div className="space-y-4 text-sm text-[var(--fg)]">
                <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]">
                  <div className="flex items-center gap-2 mb-2">
                    <KeyRound className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <h3 className="font-semibold">1. Khóa bảo mật DeepSeek API Key</h3>
                  </div>
                  <p className="text-[var(--muted)] mb-3">
                    OmniRead sử dụng mô hình DeepSeek qua endpoint OpenAI-compatible để dịch thuật câu văn chính xác, tự nhiên theo ngữ cảnh học thuật và sách chuyên khảo.
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Khóa được cấu hình an toàn ở phía máy chủ trong file <code>backend/.env</code>:
                  </p>
                  <pre className="mt-2 rounded bg-black/10 dark:bg-black/30 p-2 text-xs font-mono">
                    DEEPSEEK_API_KEY=sk-your-api-key-here
                  </pre>
                </div>

                <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <h3 className="font-semibold">2. Cơ chế đối chiếu câu chuẩn xác (@floating-ui)</h3>
                  </div>
                  <p className="text-[var(--muted)]">
                    Hệ thống tự động phân tách câu văn bản gốc và câu bản dịch tương ứng. Khi bạn rê chuột vào bất kỳ câu dịch nào trong popup, văn bản gốc trên trang sách sẽ được chiếu sáng ngay lập tức.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Shortcuts & Accessibility */}
        <TabsContent value="shortcuts">
          <div className="settings-group">
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5 text-[var(--accent)] shrink-0" />
                  <h2>Phím tắt & Khả năng truy cập (Accessibility)</h2>
                </div>
                <p>Điều hướng nhanh chóng bằng bàn phím theo tiêu chuẩn WAI-ARIA.</p>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>Mở bảng phím tắt trợ năng trong trình đọc</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">?</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>Đóng popup dịch hoặc hộp thoại</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">Esc</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>Điều chỉnh Slider / Chọn Tab</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">← / →</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>Mở menu thao tác / Kích hoạt</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">Enter / Space</kbd>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
