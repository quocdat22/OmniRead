import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Keyboard,
  Loader2,
  Maximize2,
  Minus,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { type ColorPreset, COLOR_PRESETS } from "../hooks/useHighlightStyle";
import { useScrollVisibility } from "../hooks/useScrollVisibility";
import { type ThemePreference, useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import type {
  HighlightColor,
  HighlightStyle,
  Progress,
  SentenceHighlightStyle,
} from "../types";
import LanguageSwitcher from "./LanguageSwitcher";

export interface ReaderToolbarProps {
  bookTitle?: string;
  currentPage: number;
  numPages?: number;
  onJumpPage: (page: number) => void;
  zoom: number;
  onChangeZoom: (next: number) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  progress: Progress | null;
  pagesTotal: number;
  pagesDone: number;
  canRetry: boolean;
  onRetry: () => void;
  highlightStyle: HighlightStyle;
  setHighlightStyle: (style: HighlightStyle) => void;
  sentenceStyle: SentenceHighlightStyle;
  setSentenceStyle: (style: SentenceHighlightStyle) => void;
  highlightColor: HighlightColor;
  setHighlightColor: (color: HighlightColor) => void;
  colorPreset: ColorPreset;
  popupFontSize: number;
  setPopupFontSize: (size: number) => void;
  onOpenShortcuts: () => void;
}

export default function ReaderToolbar({
  bookTitle,
  currentPage,
  numPages,
  onJumpPage,
  zoom,
  onChangeZoom,
  isSidebarOpen,
  onToggleSidebar,
  progress,
  pagesTotal,
  pagesDone,
  canRetry,
  onRetry,
  highlightStyle,
  setHighlightStyle,
  sentenceStyle,
  setSentenceStyle,
  highlightColor,
  setHighlightColor,
  colorPreset,
  popupFontSize,
  setPopupFontSize,
  onOpenShortcuts,
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  const [jumpInput, setJumpInput] = useState(String(currentPage));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Keep jump input in sync with currentPage from outer scroll
  useEffect(() => {
    setJumpInput(String(currentPage));
  }, [currentPage]);

  // Auto-hide when scrolling down, show when scrolling up
  const isVisible = useScrollVisibility({
    threshold: 8,
    topOffset: 50,
    freeze: isSettingsOpen,
  });

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 h-14 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 bg-surface/95 backdrop-blur-md border-b border-border transition-all duration-300 ease-in-out",
        isVisible
          ? "translate-y-0 shadow-xs opacity-100"
          : "-translate-y-full shadow-none opacity-0 pointer-events-none"
      )}
    >
      {/* ================= Cụm Trái: Điều hướng & Tiêu đề ================= */}
      <div className="flex items-center gap-2 min-w-0">
        <SimpleTooltip content={t("reader.backToLibrary")}>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t("common.library")}</span>
          </Link>
        </SimpleTooltip>

        <SimpleTooltip content={isSidebarOpen ? t("reader.closeSidebar", { defaultValue: "Đóng thanh bên" }) : t("reader.openSidebar", { defaultValue: "Mở thanh bên" })}>
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cn(
              "p-1.5 rounded-lg border border-border bg-surface text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer",
              isSidebarOpen && "border-accent text-accent bg-accent/10"
            )}
            aria-label="Sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </SimpleTooltip>

        <div
          className="font-semibold text-xs sm:text-sm text-foreground max-w-[120px] sm:max-w-[200px] md:max-w-[280px] lg:max-w-[360px] truncate select-none ml-1"
          title={bookTitle}
        >
          {bookTitle ?? "…"}
        </div>
      </div>

      {/* ================= Cụm Giữa: Trang & Thu phóng ================= */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Số trang hiện tại */}
        <div className="flex items-center gap-1.5 text-xs text-muted font-medium bg-surface-hover/60 border border-border px-2 py-1 rounded-lg">
          <span className="hidden sm:inline text-muted/80">{t("common.page")}</span>
          <input
            type="number"
            min={1}
            max={numPages ?? 1}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onJumpPage(Number(jumpInput));
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-10 sm:w-11 text-center font-semibold bg-background border border-border/80 rounded py-0.5 text-foreground focus:outline-hidden focus:border-accent text-xs"
            aria-label={t("reader.currentPageAria")}
          />
          <span className="text-muted/60">/</span>
          <span className="text-foreground font-semibold">
            {numPages ?? "…"}
          </span>
        </div>

        {/* Cụm Zoom Segmented Pill */}
        <div className="flex items-center rounded-lg border border-border bg-surface text-xs overflow-hidden shadow-2xs">
          <SimpleTooltip content={t("reader.zoomOut")}>
            <button
              type="button"
              className="p-1.5 hover:bg-surface-hover text-muted hover:text-foreground transition-colors cursor-pointer"
              onClick={() => onChangeZoom(zoom - 0.1)}
              aria-label={t("reader.zoomOut")}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>

          <span className="w-10 sm:w-12 text-center font-medium text-foreground select-none px-1">
            {Math.round(zoom * 100)}%
          </span>

          <SimpleTooltip content={t("reader.zoomIn")}>
            <button
              type="button"
              className="p-1.5 hover:bg-surface-hover text-muted hover:text-foreground transition-colors cursor-pointer"
              onClick={() => onChangeZoom(zoom + 0.1)}
              aria-label={t("reader.zoomIn")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>

          <div className="w-[1px] h-4 bg-border hidden sm:block" />

          <SimpleTooltip content={t("reader.fitWidth")}>
            <button
              type="button"
              className="p-1.5 hover:bg-surface-hover text-muted hover:text-foreground transition-colors cursor-pointer hidden sm:flex items-center justify-center"
              onClick={() => onChangeZoom((window.innerWidth - 32) / 820)}
              aria-label={t("reader.fitWidth")}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
        </div>
      </div>

      {/* ================= Cụm Phải: Trạng thái & Menu cài đặt ================= */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Nút dịch lại lỗi nếu có */}
        {canRetry && (
          <SimpleTooltip content={t("reader.retryErrorsTooltip")}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-2xs"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("reader.retryErrors")}</span>
            </button>
          </SimpleTooltip>
        )}

        {/* Trạng thái dịch gọn */}
        {!progress ? null : progress.status === "parsing" ? (
          <SimpleTooltip content={t("reader.analyzingPdf")}>
            <div className="flex items-center gap-1.5 text-xs text-muted bg-surface-hover/60 px-2 py-1 rounded-lg border border-border">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />
              <span className="hidden md:inline">{t("reader.analyzingPdf")}</span>
            </div>
          </SimpleTooltip>
        ) : progress.status === "error" ? (
          <SimpleTooltip content={progress.error_msg ? t("errors." + progress.error_msg, { defaultValue: progress.error_msg }) : t("common.error")}>
            <div className="flex items-center gap-1 text-xs text-danger bg-danger/10 px-2 py-1 rounded-lg border border-danger/20 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">{t("common.error")}</span>
            </div>
          </SimpleTooltip>
        ) : progress.status === "translating" ? (
          <SimpleTooltip content={`${t("reader.translating")} ${pagesDone}/${pagesTotal}`}>
            <div className="flex items-center gap-1.5 text-xs text-muted bg-surface-hover/60 px-2 py-1 rounded-lg border border-border font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />
              <span className="hidden sm:inline">
                {pagesDone}/{pagesTotal}
              </span>
            </div>
          </SimpleTooltip>
        ) : (
          <SimpleTooltip content={`${t("reader.translated")} ${pagesDone}/${pagesTotal}`}>
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted bg-surface-hover/60 px-2 py-1 rounded-lg border border-border">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="hidden md:inline font-medium">
                {pagesDone}/{pagesTotal}
              </span>
            </div>
          </SimpleTooltip>
        )}

        {/* Menu Cài Đặt Hợp Nhất (Unified Settings Menu) */}
        <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <SimpleTooltip content={t("reader.quickSettingsTooltip")}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "p-1.5 rounded-lg border border-border bg-surface text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer",
                  isSettingsOpen && "border-accent text-accent bg-accent/10"
                )}
                aria-label={t("reader.quickSettings")}
              >
                <Settings className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </SimpleTooltip>

          <PopoverContent className="w-80 p-4 shadow-xl" align="end">
            <div className="flex flex-col gap-3.5">
              {/* Header Cài đặt */}
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-semibold text-sm text-foreground">
                  {t("reader.quickSettings")}
                </span>
                <Link
                  to="/settings"
                  className="text-xs text-accent hover:underline inline-flex items-center gap-0.5"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <span>{t("reader.advancedSettings")}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Chế độ giao diện (Theme) */}
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">
                  {t("settings.themeSection.title")}:
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    { id: "light", label: `☀️ ${t("settings.themeSection.light", { defaultValue: "Sáng" })}` },
                    { id: "dark", label: `🌙 ${t("settings.themeSection.dark", { defaultValue: "Tối" })}` },
                    { id: "system", label: `💻 ${t("settings.themeSection.system", { defaultValue: "Tự động" })}` },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        theme === item.id
                          ? "border-accent bg-accent text-white font-medium"
                          : "border-border hover:bg-surface-hover text-foreground"
                      }`}
                      onClick={() => setTheme(item.id as ThemePreference)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kiểu highlight khối */}
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">
                  {t("reader.blockHighlightStyle")}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {[
                    { id: "bar", label: t("reader.styleBar") },
                    { id: "background", label: t("reader.styleBackground") },
                    { id: "border", label: t("settings.highlightSection.border") },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        highlightStyle === item.id
                          ? "border-accent bg-accent text-white font-medium"
                          : "border-border hover:bg-surface-hover text-foreground"
                      }`}
                      onClick={() =>
                        setHighlightStyle(item.id as HighlightStyle)
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kiểu câu đối chiếu */}
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">
                  {t("reader.sentenceHighlightStyle")}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    { id: "bracket", label: t("reader.bracketStyle") },
                    { id: "block", label: t("reader.blockStyle") },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        sentenceStyle === item.id
                          ? "border-accent bg-accent text-white font-medium"
                          : "border-border hover:bg-surface-hover text-foreground"
                      }`}
                      onClick={() =>
                        setSentenceStyle(item.id as SentenceHighlightStyle)
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bảng màu */}
              <div>
                <div className="text-xs text-muted mb-2 font-medium">
                  {t("reader.colorLabel")}{" "}
                  <strong className="text-foreground">{t("common.colors." + colorPreset.id, { defaultValue: colorPreset.name })}</strong>
                </div>
                <div className="flex items-center gap-2.5">
                  {COLOR_PRESETS.map((c) => {
                    const colorName = t("common.colors." + c.id, { defaultValue: c.name });
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer ${
                          highlightColor === c.id
                            ? "border-foreground scale-110 shadow-xs ring-2 ring-accent/30"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c.hex }}
                        onClick={() => setHighlightColor(c.id)}
                        title={colorName}
                        aria-label={colorName}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Slider cỡ chữ popup */}
              <div className="pt-1">
                <div className="flex justify-between text-xs text-muted mb-2">
                  <span className="font-medium">{t("reader.popupFontSize")}</span>
                  <span className="font-semibold text-foreground">
                    {popupFontSize}px
                  </span>
                </div>
                <Slider
                  min={12}
                  max={24}
                  step={1}
                  value={[popupFontSize]}
                  onValueChange={(val) => setPopupFontSize(val[0])}
                  aria-label={t("reader.popupFontSize")}
                />
              </div>

              {/* Nút xem phím tắt */}
              <div className="border-t border-border pt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onOpenShortcuts();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-foreground transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Keyboard className="h-3.5 w-3.5 text-muted" />
                    <span>{t("reader.shortcutsTooltip")}</span>
                  </span>
                  <span className="text-[10px] font-mono text-muted bg-surface-hover px-1.5 py-0.5 rounded border border-border">
                    ?
                  </span>
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Nút chuyển đổi ngôn ngữ */}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
