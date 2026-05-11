import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { EHR_TOKEN_STORAGE_KEY } from "@/lib/auth-storage";
import { clearAllOfflineIndexedDb } from "@/lib/offline/offline-idb";
import { clearOfflineUserBinding } from "@/lib/offline/offline-fetch-overlay";
import { postMessageClearApiCacheToServiceWorker } from "@/lib/offline/sw-messaging";

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email?: string;
  phone?: string;
  facilityId?: string;
  /** Effective capability ids (navigation, admin, activities) after role overrides. */
  capabilities?: string[];
  organization?: {
    facilityId: string;
    name: string;
    patientIdentifierLabel: string;
    defaultCountry: string;
    billingCurrency: string;
    logoUrl: string | null;
    timeZone?: string;
  };
  /** Per-role UI: nav labels/order, toolbar, patient chart (from Application configuration). */
  activityUi?: {
    headerNav: { id: string; label: string }[];
    toolbar: { id: string; label: string }[];
    patientChartReview: { id: string; label: string }[];
    patientChartVisitDoc: { id: string; label: string }[];
    /** Administration → Administrative (Facilities, Audit, …) — from Application configuration. */
    adminActivities: { id: string; label: string }[];
  };
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(EHR_TOKEN_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(EHR_TOKEN_STORAGE_KEY);
    // Offline-specific: wipe encrypted local PHI and SW API cache; never retain tokens in the SW layer.
    clearOfflineUserBinding();
    void clearAllOfflineIndexedDb();
    void postMessageClearApiCacheToServiceWorker();
  }, []);

  useEffect(() => {
    if (token) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Invalid token");
          return res.json();
        })
        .then((data) => setUser(data))
        .catch(() => logout())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token, logout]);

  const login = async (username: string, password: string): Promise<AuthUser> => {
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error(
        "Cannot reach the server. From the project root run npm run dev, then open http://127.0.0.1:3000. " +
          "If you start Vite alone (e.g. port 5173), the API must still be running on port 3000.",
      );
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Login failed");
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(EHR_TOKEN_STORAGE_KEY, data.token);
    return data.user as AuthUser;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Prefer `@/lib/api-client` (apiGetJson / apiPostJson / apiPatchJson) for new code. */
export function authFetch(token: string | null) {
  return (url: string, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
    });
  };
}
