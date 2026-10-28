import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "omni_theme";

export function getSavedThemePreference(): ThemePreference {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") {
      return val;
    }
  } catch {
    // ignore
  }
  return "system";
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") {
    return getSystemPrefersDark() ? "dark" : "light";
  }
  return pref;
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(getSavedThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getSavedThemePreference()));

  const setTheme = (newTheme: ThemePreference) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      window.dispatchEvent(new Event("omni-theme-changed"));
    } catch {
      // ignore
    }
    const resolved = applyTheme(newTheme);
    setResolvedTheme(resolved);
  };

  useEffect(() => {
    const handleSync = () => {
      const currentPref = getSavedThemePreference();
      setThemeState(currentPref);
      const resolved = applyTheme(currentPref);
      setResolvedTheme(resolved);
    };

    // Apply on mount
    handleSync();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (getSavedThemePreference() === "system") {
        handleSync();
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    window.addEventListener("omni-theme-changed", handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("omni-theme-changed", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme,
  };
}
