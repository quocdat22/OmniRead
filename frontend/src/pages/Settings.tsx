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
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ThemeToggle from "../components/ThemeToggle";
import {
  COLOR_PRESETS,
  DEFAULT_HIGHLIGHT_PADDING,
  DEFAULT_POPUP_FONT_SIZE,
  useHighlightStyle,
} from "../hooks/useHighlightStyle";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import type { HighlightStyle, SentenceHighlightStyle } from "../types";

const SAMPLE_BLOCK = {
  originalSentences: [
    "OmniRead is designed to make reading foreign language documents natural and effortless.",
    "By clicking any text block, you instantly receive contextual translations while preserving the document's original reading flow.",
  ],
  translationSentencesVi: [
    "OmniRead được thiết kế để giúp việc đọc tài liệu ngoại ngữ trở nên tự nhiên và dễ dàng.",
    "Bằng cách nhấp vào bất kỳ khối văn bản nào, bạn sẽ nhận được bản dịch ngữ cảnh tức thì mà vẫn giữ nguyên luồng đọc ban đầu.",
  ],
  translationSentencesEn: [
    "OmniRead is designed to make reading foreign language documents natural and effortless.",
    "By clicking any text block, you instantly receive contextual translations while preserving the document's original reading flow.",
  ],
};

export default function Settings() {
  const { t, i18n } = useTranslation();
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

  const themeOptions: { id: ThemePreference; title: string; desc: string; icon: string }[] = [
    {
      id: "light",
      title: t("settings.themeSection.light"),
      desc: t("settings.themeSection.lightDesc"),
      icon: "☀️",
    },
    {
      id: "dark",
      title: t("settings.themeSection.dark"),
      desc: t("settings.themeSection.darkDesc"),
      icon: "🌙",
    },
    {
      id: "system",
      title: t("settings.themeSection.system"),
      desc: t("settings.themeSection.systemDesc"),
      icon: "💻",
    },
  ];

  const highlightOptions: { id: HighlightStyle; title: string }[] = [
    { id: "bar", title: t("settings.highlightSection.bar") },
    { id: "background", title: t("settings.highlightSection.background") },
    { id: "border", title: t("settings.highlightSection.border") },
  ];

  const sentenceOptions: { id: SentenceHighlightStyle; title: string; desc: string }[] = [
    {
      id: "bracket",
      title: t("settings.sentenceSection.bracketTitle"),
      desc: t("settings.sentenceSection.bracketDesc"),
    },
    {
      id: "block",
      title: t("settings.sentenceSection.blockTitle"),
      desc: t("settings.sentenceSection.blockDesc"),
    },
  ];

  const translationSentences = i18n.language?.startsWith("en")
    ? SAMPLE_BLOCK.translationSentencesEn
    : SAMPLE_BLOCK.translationSentencesVi;

  return (
    <div className="settings">
      <div className="settings-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/" className="btn inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>{t("common.library")}</span>
          </Link>
          <div>
            <h1>{t("settings.title")}</h1>
            <p className="settings-subtitle">{t("settings.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="appearance" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Palette className="h-4 w-4" />
            <span>{t("settings.tabAppearance")}</span>
          </TabsTrigger>
          <TabsTrigger value="translation" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Bot className="h-4 w-4" />
            <span>{t("settings.tabTranslation")}</span>
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="inline-flex items-center gap-1.5 cursor-pointer">
            <Keyboard className="h-4 w-4" />
            <span>{t("settings.tabShortcuts")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Appearance */}
        <TabsContent value="appearance">
          <div className="settings-group">
            {/* Theme Selection Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <h2>{t("settings.themeSection.title")}</h2>
                <p>{t("settings.themeSection.desc")}</p>
              </div>

              <div className="option-grid">
                {themeOptions.map((opt) => {
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
                <h2>{t("settings.highlightSection.title")}</h2>
                <p>{t("settings.highlightSection.desc")}</p>
              </div>

              <div className="option-grid">
                {highlightOptions.map((opt) => {
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
                  <span>{t("settings.sentenceSection.title")}</span>
                  <strong>
                    {sentenceStyle === "bracket"
                      ? t("settings.sentenceSection.bracketTitle")
                      : t("settings.sentenceSection.blockTitle")}
                  </strong>
                </div>
                <p style={{ margin: "4px 0 12px", fontSize: "13px", color: "var(--muted)" }}>
                  {t("settings.sentenceSection.desc")}
                </p>
                <div className="option-grid" style={{ marginBottom: 0 }}>
                  {sentenceOptions.map((opt) => {
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
                  <span>{t("settings.colorSection.title")}</span>
                  <strong>
                    {t(`common.colors.${colorPreset.id}`, { defaultValue: colorPreset.name })}
                  </strong>
                </div>
                <p style={{ margin: "4px 0 10px", fontSize: "13px", color: "var(--muted)" }}>
                  {t("settings.colorSection.desc")}
                </p>
                <div className="color-swatches">
                  {COLOR_PRESETS.map((col) => {
                    const isSelected = highlightColor === col.id;
                    const colName = t(`common.colors.${col.id}`, { defaultValue: col.name });
                    return (
                      <SimpleTooltip key={col.id} content={`${colName} (${col.hex})`}>
                        <button
                          type="button"
                          className={`color-swatch-btn${isSelected ? " active" : ""}`}
                          style={{ "--swatch-color": col.hex } as React.CSSProperties}
                          onClick={() => setHighlightColor(col.id)}
                          aria-label={t("settings.colorSection.ariaColor", { name: colName })}
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
                  <span>{t("settings.paddingSection.title")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {highlightPadding === DEFAULT_HIGHLIGHT_PADDING && (
                      <span className="default-tag">{t("common.default")}</span>
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
                    aria-label={t("settings.paddingSection.aria")}
                  />
                  <div className="slider-ticks">
                    <span>0px</span>
                    <span className="tick-default">{t("settings.paddingSection.tickDefault")}</span>
                    <span>8px</span>
                    <span>12px</span>
                    <span>16px</span>
                  </div>
                </div>
              </div>

              {/* Radix Slider thiết lập Font Size của Popup */}
              <div className="setting-slider-row">
                <div className="slider-label">
                  <span>{t("settings.fontSizeSection.title")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {popupFontSize === DEFAULT_POPUP_FONT_SIZE && (
                      <span className="default-tag">{t("common.default")}</span>
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
                    aria-label={t("settings.fontSizeSection.aria")}
                  />
                  <div className="slider-ticks">
                    <span>12px</span>
                    <span className="tick-default">{t("settings.fontSizeSection.tickDefault")}</span>
                    <span>18px</span>
                    <span>21px</span>
                    <span>24px</span>
                  </div>
                </div>
              </div>

              {/* Live Preview Section */}
              <div className="preview-box">
                <div className="preview-header">
                  <div className="preview-header-title">{t("settings.preview.title")}</div>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {t("settings.preview.hoverHint")}
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
                          {translationSentences.map((s, idx) => (
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
                <h2>{t("settings.aiConfigSection.title")}</h2>
                <p>{t("settings.aiConfigSection.desc")}</p>
              </div>

              <div className="space-y-4 text-sm text-[var(--fg)]">
                <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]">
                  <div className="flex items-center gap-2 mb-2">
                    <KeyRound className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <h3 className="font-semibold">{t("settings.aiConfigSection.item1Title")}</h3>
                  </div>
                  <p className="text-[var(--muted)] mb-3">
                    {t("settings.aiConfigSection.item1Desc")}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {t("settings.aiConfigSection.item1Config", { file: "backend/.env" })}
                  </p>
                  <pre className="mt-2 rounded bg-black/10 dark:bg-black/30 p-2 text-xs font-mono">
                    DEEPSEEK_API_KEY=sk-your-api-key-here
                  </pre>
                </div>

                <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-[var(--accent)] shrink-0" />
                    <h3 className="font-semibold">{t("settings.aiConfigSection.item2Title")}</h3>
                  </div>
                  <p className="text-[var(--muted)]">
                    {t("settings.aiConfigSection.item2Desc")}
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
                  <h2>{t("settings.shortcutsSection.title")}</h2>
                </div>
                <p>{t("settings.shortcutsSection.desc")}</p>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>{t("settings.shortcutsSection.openHelp")}</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">?</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>{t("settings.shortcutsSection.closePopup")}</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">Esc</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>{t("settings.shortcutsSection.adjustSlider")}</span>
                  <kbd className="rounded border border-[var(--border)] bg-muted/40 px-2 py-0.5 font-mono text-xs">← / →</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                  <span>{t("settings.shortcutsSection.openMenu")}</span>
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
