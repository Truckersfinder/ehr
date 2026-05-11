import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { listConflictRecords, listPendingSyncItems } from "@/lib/offline/offline-idb";
import {
  clearOfflineUserBinding,
  notifyOfflineUserBinding,
  setStaffOfflineAccessGetter,
} from "@/lib/offline/offline-fetch-overlay";
import {
  flushPendingSyncQueue,
  requestBackgroundSyncWhenPossible,
} from "@/lib/offline/offline-write-queue";
import { queryClient } from "@/lib/queryClient";

export type OfflineSyncPhase = "idle" | "syncing";

type OfflineSyncContextValue = {
  online: boolean;
  phase: OfflineSyncPhase;
  pendingCount: number;
  conflictCount: number;
  lastSyncMessage: string | null;
  showAllSavedFlash: boolean;
  /** Staff-only: open manual conflict resolution */
  openConflictsPath: string;
  refreshCounts: () => Promise<void>;
  runFlush: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncRoot({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [phase, setPhase] = useState<OfflineSyncPhase>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [showAllSavedFlash, setShowAllSavedFlash] = useState(false);
  const flushLock = useRef(false);

  useEffect(() => {
    setStaffOfflineAccessGetter(() => ({
      token,
      userId: user?.id ?? null,
    }));
    if (user?.id) notifyOfflineUserBinding(user.id);
    else clearOfflineUserBinding();
  }, [user?.id, token]);

  const refreshCounts = useCallback(async () => {
    const authToken = getStoredAuthToken();
    const uid = user?.id ?? sessionStorage.getItem("ehr_offline_user_id");
    if (!authToken || !uid) {
      setPendingCount(0);
      setConflictCount(0);
      return;
    }
    const [pending, conflicts] = await Promise.all([
      listPendingSyncItems(uid, authToken),
      listConflictRecords(uid, authToken),
    ]);
    setPendingCount(pending.length);
    setConflictCount(conflicts.length);
  }, [user?.id]);

  const runFlushInner = useCallback(async () => {
    if (flushLock.current || !navigator.onLine) return;
    const authToken = getStoredAuthToken();
    const uid = user?.id ?? sessionStorage.getItem("ehr_offline_user_id");
    if (!authToken || !uid) return;
    flushLock.current = true;
    setPhase("syncing");
    setLastSyncMessage(null);
    try {
      const { flushed, conflicts } = await flushPendingSyncQueue({
        userId: uid,
        token: authToken,
        onProgress: (p, msg) => {
          setPhase(p === "syncing" ? "syncing" : "idle");
          if (msg) setLastSyncMessage(msg);
        },
        onQueueLength: setPendingCount,
        onConflicts: () => void refreshCounts(),
      });
      if (conflicts > 0) {
        setLastSyncMessage(t("app.offline.conflictsBody", { count: conflicts }));
      }
      if (flushed > 0) {
        void queryClient.invalidateQueries();
        setShowAllSavedFlash(true);
        window.setTimeout(() => setShowAllSavedFlash(false), 4000);
      }
      await refreshCounts();
    } finally {
      setPhase("idle");
      flushLock.current = false;
    }
  }, [refreshCounts, user?.id, t]);

  const runFlushRef = useRef(runFlushInner);
  runFlushRef.current = runFlushInner;

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts, user?.id]);

  useEffect(() => {
    const onQueue = () => void refreshCounts();
    window.addEventListener("ehr-offline-queue-changed", onQueue);
    return () => window.removeEventListener("ehr-offline-queue-changed", onQueue);
  }, [refreshCounts]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void runFlushRef.current();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const onSw = (ev: MessageEvent) => {
      if (ev.data?.type === "EHR_RUN_OFFLINE_FLUSH") {
        void runFlushRef.current();
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onSw);
    return () => navigator.serviceWorker?.removeEventListener?.("message", onSw);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !navigator.onLine) return;
    void runFlushRef.current();
  }, [user?.id]);

  const runFlush = useCallback(async () => {
    requestBackgroundSyncWhenPossible();
    await runFlushInner();
  }, [runFlushInner]);

  useEffect(() => {
    if (pendingCount > 0 && navigator.onLine) {
      requestBackgroundSyncWhenPossible();
    }
  }, [pendingCount]);

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      online,
      phase,
      pendingCount,
      conflictCount,
      lastSyncMessage,
      showAllSavedFlash,
      openConflictsPath: "/sync-conflicts",
      refreshCounts,
      runFlush,
    }),
    [
      online,
      phase,
      pendingCount,
      conflictCount,
      lastSyncMessage,
      showAllSavedFlash,
      refreshCounts,
      runFlush,
    ],
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error("useOfflineSync must be used within OfflineSyncRoot");
  return ctx;
}

export function useOptionalOfflineSync(): OfflineSyncContextValue | null {
  return useContext(OfflineSyncContext);
}
