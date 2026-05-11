import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listConflictRecords, removeConflictRecord } from "@/lib/offline/offline-idb";
import type { OfflineConflictRecord } from "@/lib/offline/offline-types";
import { useOfflineSync } from "@/lib/offline/offline-sync-root";
import { ArrowLeft } from "lucide-react";

/**
 * Manual resolution for offline sync conflicts (server changed while the user had local edits).
 * Offline-specific: there is no automatic merge — staff must re-apply changes in the chart if needed.
 */
export default function SyncConflictsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refreshCounts } = useOfflineSync();
  const [rows, setRows] = useState<OfflineConflictRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const authToken = getStoredAuthToken();
    const uid = user?.id ?? sessionStorage.getItem("ehr_offline_user_id");
    if (!authToken || !uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await listConflictRecords(uid, authToken));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = async (id: string) => {
    await removeConflictRecord(id);
    await load();
    await refreshCounts();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <a className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("pages.syncConflicts.back")}
            </a>
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.syncConflicts.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("pages.syncConflicts.pageIntro")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("pages.syncConflicts.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pages.syncConflicts.empty")}</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{r.path}</CardTitle>
                  <CardDescription>{r.message}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      {t("pages.syncConflicts.serverSnapshot")}
                    </p>
                    <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(r.serverSnapshot, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      {t("pages.syncConflicts.queuedBody")}
                    </p>
                    <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(r.queuedBody, null, 2)}
                    </pre>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void dismiss(r.id)}>
                    {t("pages.syncConflicts.dismiss")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
