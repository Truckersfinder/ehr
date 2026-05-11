import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const useDarkLabel = t("app.themeUseDark");
  const useLightLabel = t("app.themeUseLight");
  const isLight = theme === "light";
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      title={isLight ? useDarkLabel : useLightLabel}
      aria-label={isLight ? useDarkLabel : useLightLabel}
    >
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}
