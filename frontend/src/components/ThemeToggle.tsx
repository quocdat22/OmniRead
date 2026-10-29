import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const getLabel = () => {
    if (theme === "light") return t("common.theme.light");
    if (theme === "dark") return t("common.theme.dark");
    return t("common.theme.system");
  };

  const getIcon = () => {
    if (theme === "light") return "☀️";
    if (theme === "dark") return "🌙";
    return "💻";
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer select-none ${className}`}
      title={t("common.theme.toggleTitle", { theme: getLabel() })}
      aria-label={t("common.theme.ariaLabel")}
    >
      <span className="text-sm leading-none">{getIcon()}</span>
      <span>{getLabel()}</span>
    </button>
  );
}
