import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language?.startsWith("en") ? "en" : "vi";

  const toggleLanguage = () => {
    const next = currentLang === "vi" ? "en" : "vi";
    i18n.changeLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-surface text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer select-none ${className}`}
      title={t("common.language.toggleTitle")}
      aria-label={t("common.language.toggleTitle")}
    >
      <Languages className="w-3.5 h-3.5 text-muted" />
      <span>{currentLang === "vi" ? "VI" : "EN"}</span>
    </button>
  );
}
