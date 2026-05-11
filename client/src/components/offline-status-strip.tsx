import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/lib/offline/offline-sync-root";
import { cn } from "@/lib/utils";

/**
 * Offline / sync status for authenticated staff — uses existing Alert + Button primitives.
 */
export function OfflineStatusStrip() {
  const { t } = useTranslation();
  const {
    online,
    phase,
    pendingCount,
    conflictCount,
    lastSyncMessage,
    showAllSavedFlash,
    openConflictsPath,
    runFlush,
  } = useOfflineSync();

  const show =
    !online ||
    phase === "syncing" ||
    pendingCount > 0 ||
    conflictCount > 0 ||
    showAllSavedFlash ||
    (lastSyncMessage != null && lastSyncMessage.length > 0);

  if (!show) return null;

  const unsyncedBadge =
    pendingCount === 1
      ? t("app.offline.unsyncedOne", { count: pendingCount })
      : t("app.offline.unsyncedMany", { count: pendingCount });

  return (
    <div className="border-b bg-muted/40 px-3 py-2 space-y-2 shrink-0" data-testid="offline-status-strip">
      {!online ? (
        <Alert variant="default" className="py-2">
          <WifiOff className="h-4 w-4" />
          <AlertTitle className="text-sm">{t("app.offline.offlineModeTitle")}</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">
            {t("app.offline.offlineModeBody")}
            {pendingCount > 0 ? (
              <span className="block mt-1">
                <Badge variant="secondary" className="font-normal">
                  {unsyncedBadge}
                </Badge>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {online && phase === "syncing" ? (
        <Alert variant="default" className="py-2">
          <RefreshCw className={cn("h-4 w-4 animate-spin")} />
          <AlertTitle className="text-sm">{t("app.offline.syncingTitle")}</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">{t("app.offline.syncingBody")}</AlertDescription>
        </Alert>
      ) : null}

      {online && showAllSavedFlash && phase !== "syncing" ? (
        <Alert variant="default" className="py-2 border-green-500/30 bg-green-500/5">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-sm">{t("app.offline.allSavedTitle")}</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm">{t("app.offline.allSavedBody")}</AlertDescription>
        </Alert>
      ) : null}

      {online && pendingCount > 0 && phase !== "syncing" ? (
        <Alert variant="default" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">{t("app.offline.unsyncedTitle")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <Badge variant="secondary">{pendingCount}</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void runFlush()}>
              {t("app.offline.syncNow")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {online && conflictCount > 0 ? (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">{t("app.offline.conflictsTitle")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            {t("app.offline.conflictsBody", { count: conflictCount })}
            <Link href={openConflictsPath} className="text-sm font-medium underline underline-offset-4 text-inherit">
              {t("app.offline.reviewConflicts")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {lastSyncMessage && online && conflictCount === 0 && phase !== "syncing" ? (
        <p className="text-xs text-muted-foreground px-1">{lastSyncMessage}</p>
      ) : null}
    </div>
  );
}
