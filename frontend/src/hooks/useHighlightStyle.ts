import { useEffect, useState } from "react";
import type { HighlightColor, HighlightStyle, SentenceHighlightStyle } from "../types";

export const HIGHLIGHT_STORAGE_KEY = "omni_highlight_style";
export const HIGHLIGHT_PADDING_KEY = "omni_highlight_padding";
export const HIGHLIGHT_COLOR_KEY = "omni_highlight_color";
export const HIGHLIGHT_FONT_SIZE_KEY = "omni_popup_font_size";
export const SENTENCE_HIGHLIGHT_STORAGE_KEY = "omni_sentence_highlight_style";

export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = "bar";
export const DEFAULT_SENTENCE_HIGHLIGHT_STYLE: SentenceHighlightStyle = "bracket";
export const DEFAULT_HIGHLIGHT_PADDING = 4;
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "blue";
export const DEFAULT_POPUP_FONT_SIZE = 15;

export interface ColorPreset {
  id: HighlightColor;
  name: string;
  hex: string;
  rgb: string;
  /** Tone tương tự màu block nhưng có sự khác biệt tinh tế (đậm hơn, sắc nét hơn) để phân biệt rõ câu và đoạn */
  sentenceHex: string;
  sentenceRgb: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "blue",
    name: "Blue",
    hex: "#2563eb",
    rgb: "37, 99, 235",
    sentenceHex: "#1d4ed8",
    sentenceRgb: "29, 78, 216",
  },
  {
    id: "yellow",
    name: "Yellow",
    hex: "#eab308",
    rgb: "234, 179, 8",
    sentenceHex: "#d97706",
    sentenceRgb: "217, 119, 6",
  },
  {
    id: "green",
    name: "Green",
    hex: "#16a34a",
    rgb: "22, 163, 74",
    sentenceHex: "#15803d",
    sentenceRgb: "21, 128, 61",
  },
  {
    id: "purple",
    name: "Purple",
    hex: "#9333ea",
    rgb: "147, 51, 234",
    sentenceHex: "#7e22ce",
    sentenceRgb: "126, 34, 206",
  },
  {
    id: "orange",
    name: "Orange",
    hex: "#f97316",
    rgb: "249, 115, 22",
    sentenceHex: "#ea580c",
    sentenceRgb: "234, 88, 12",
  },
  {
    id: "rose",
    name: "Rose",
    hex: "#e11d48",
    rgb: "225, 29, 72",
    sentenceHex: "#be123c",
    sentenceRgb: "190, 18, 60",
  },
];

export function getColorPreset(id: HighlightColor): ColorPreset {
  return COLOR_PRESETS.find((c) => c.id === id) ?? COLOR_PRESETS[0];
}

export function getSavedHighlightStyle(): HighlightStyle {
  try {
    const val = localStorage.getItem(HIGHLIGHT_STORAGE_KEY);
    if (val === "bar" || val === "background" || val === "border") {
      return val;
    }
  } catch {
    // ignore
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}

export function getSavedSentenceHighlightStyle(): SentenceHighlightStyle {
  try {
    const val = localStorage.getItem(SENTENCE_HIGHLIGHT_STORAGE_KEY);
    if (val === "bracket" || val === "block") {
      return val;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SENTENCE_HIGHLIGHT_STYLE;
}

export function getSavedHighlightPadding(): number {
  try {
    const val = localStorage.getItem(HIGHLIGHT_PADDING_KEY);
    if (val !== null) {
      const num = Number(val);
      if (!Number.isNaN(num) && num >= 0 && num <= 32) {
        return num;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_HIGHLIGHT_PADDING;
}

export function getSavedHighlightColor(): HighlightColor {
  try {
    const val = localStorage.getItem(HIGHLIGHT_COLOR_KEY);
    if (val && COLOR_PRESETS.some((c) => c.id === val)) {
      return val as HighlightColor;
    }
  } catch {
    // ignore
  }
  return DEFAULT_HIGHLIGHT_COLOR;
}

export function getSavedPopupFontSize(): number {
  try {
    const val = localStorage.getItem(HIGHLIGHT_FONT_SIZE_KEY);
    if (val !== null) {
      const num = Number(val);
      if (!Number.isNaN(num) && num >= 10 && num <= 32) {
        return num;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_POPUP_FONT_SIZE;
}

export function useHighlightStyle() {
  const [style, setStyleState] = useState<HighlightStyle>(getSavedHighlightStyle);
  const [sentenceStyle, setSentenceStyleState] = useState<SentenceHighlightStyle>(getSavedSentenceHighlightStyle);
  const [padding, setPaddingState] = useState<number>(getSavedHighlightPadding);
  const [color, setColorState] = useState<HighlightColor>(getSavedHighlightColor);
  const [fontSize, setFontSizeState] = useState<number>(getSavedPopupFontSize);

  const setStyle = (newStyle: HighlightStyle) => {
    setStyleState(newStyle);
    try {
      localStorage.setItem(HIGHLIGHT_STORAGE_KEY, newStyle);
      window.dispatchEvent(new Event("omni-highlight-style-changed"));
    } catch {
      // ignore
    }
  };

  const setSentenceStyle = (newStyle: SentenceHighlightStyle) => {
    setSentenceStyleState(newStyle);
    try {
      localStorage.setItem(SENTENCE_HIGHLIGHT_STORAGE_KEY, newStyle);
      window.dispatchEvent(new Event("omni-highlight-style-changed"));
    } catch {
      // ignore
    }
  };

  const setPadding = (newPadding: number) => {
    setPaddingState(newPadding);
    try {
      localStorage.setItem(HIGHLIGHT_PADDING_KEY, String(newPadding));
      window.dispatchEvent(new Event("omni-highlight-style-changed"));
    } catch {
      // ignore
    }
  };

  const setColor = (newColor: HighlightColor) => {
    setColorState(newColor);
    try {
      localStorage.setItem(HIGHLIGHT_COLOR_KEY, newColor);
      window.dispatchEvent(new Event("omni-highlight-style-changed"));
    } catch {
      // ignore
    }
  };

  const setFontSize = (newSize: number) => {
    setFontSizeState(newSize);
    try {
      localStorage.setItem(HIGHLIGHT_FONT_SIZE_KEY, String(newSize));
      window.dispatchEvent(new Event("omni-highlight-style-changed"));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handleSync = () => {
      setStyleState(getSavedHighlightStyle());
      setSentenceStyleState(getSavedSentenceHighlightStyle());
      setPaddingState(getSavedHighlightPadding());
      setColorState(getSavedHighlightColor());
      setFontSizeState(getSavedPopupFontSize());
    };

    window.addEventListener("omni-highlight-style-changed", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("omni-highlight-style-changed", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const colorPreset = getColorPreset(color);

  return {
    style,
    sentenceStyle,
    padding,
    color,
    colorPreset,
    fontSize,
    setStyle,
    setSentenceStyle,
    setPadding,
    setColor,
    setFontSize,
  };
}
