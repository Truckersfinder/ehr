import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SupportedLanguage } from "@/lib/i18n";

const OPTIONS: { code: SupportedLanguage; labelKey: string }[] = [
  { code: "en", labelKey: "app.languageEnglish" },
  { code: "fr", labelKey: "app.languageFrench" },
  { code: "es", labelKey: "app.languageSpanish" },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0] as SupportedLanguage;
  const value = OPTIONS.some((o) => o.code === lng) ? lng : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title={t("app.language")}
          aria-label={t("app.language")}
          data-testid="button-language-switcher"
        >
          <Languages className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => void i18n.changeLanguage(v as SupportedLanguage)}
        >
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.code} value={o.code}>
              {t(o.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
