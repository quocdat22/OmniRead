import { useEffect, useState } from "react";
import type { HighlightColor, HighlightStyle } from "../types";

export const HIGHLIGHT_STORAGE_KEY = "omni_highlight_style";
export const HIGHLIGHT_PADDING_KEY = "omni_highlight_padding";
export const HIGHLIGHT_COLOR_KEY = "omni_highlight_color";

export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyle = "bar";
export const DEFAULT_HIGHLIGHT_PADDING = 4;
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "blue";

export interface ColorPreset {
  id: HighlightColor;
  name: string;
  hex: string;
  rgb: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "blue", name: "Xanh dương (Mặc định)", hex: "#2563eb", rgb: "37, 99, 235" },
  { id: "yellow", name: "Vàng", hex: "#eab308", rgb: "234, 179, 8" },
  { id: "green", name: "Xanh lá", hex: "#16a34a", rgb: "22, 163, 74" },
  { id: "purple", name: "Tím", hex: "#9333ea", rgb: "147, 51, 234" },
  { id: "orange", name: "Cam", hex: "#f97316", rgb: "249, 115, 22" },
  { id: "rose", name: "Đỏ hồng", hex: "#e11d48", rgb: "225, 29, 72" },
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

export function useHighlightStyle() {
  const [style, setStyleState] = useState<HighlightStyle>(getSavedHighlightStyle);
  const [padding, setPaddingState] = useState<number>(getSavedHighlightPadding);
  const [color, setColorState] = useState<HighlightColor>(getSavedHighlightColor);

  const setStyle = (newStyle: HighlightStyle) => {
    setStyleState(newStyle);
    try {
      localStorage.setItem(HIGHLIGHT_STORAGE_KEY, newStyle);
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

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === HIGHLIGHT_STORAGE_KEY) {
        setStyleState(getSavedHighlightStyle());
      } else if (e.key === HIGHLIGHT_PADDING_KEY) {
        setPaddingState(getSavedHighlightPadding());
      } else if (e.key === HIGHLIGHT_COLOR_KEY) {
        setColorState(getSavedHighlightColor());
      }
    };
    const onCustom = () => {
      setStyleState(getSavedHighlightStyle());
      setPaddingState(getSavedHighlightPadding());
      setColorState(getSavedHighlightColor());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("omni-highlight-style-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("omni-highlight-style-changed", onCustom);
    };
  }, []);

  const colorPreset = getColorPreset(color);

  return { style, setStyle, padding, setPadding, color, setColor, colorPreset };
}
