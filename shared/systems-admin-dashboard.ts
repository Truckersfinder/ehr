/** Response shape for GET /api/admin/systems-dashboard (Systems administrator only). */
export type SystemsDashboardSnapshot = {
  users: {
    total: number;
    active: number;
    deactivated: number;
  };
  /** Active accounts with no successful login in the last 30 days (includes never-logged-in accounts older than 30 days). */
  staleActiveAccounts: {
    count: number;
    items: Array<{
      id: string;
      fullName: string;
      username: string;
      role: string;
      lastLoginAt: string | null;
      createdAt: string | null;
    }>;
  };
  facilities: { total: number; active: number; inactive: number };
  clinicalForms: { total: number; active: number; inactive: number };
  /** Rows in `role_capability_overrides` (custom RBAC). */
  roleCapabilityOverrideRows: number;
  audit: {
    loginsLast7Days: number;
    securityEventsLast24h: number;
    recentSecurityEvents: Array<{
      id: string;
      createdAt: string;
      action: string;
      resource: string;
      details: string | null;
      userId: string;
      /** Resolved from staff directory when available. */
      actorFullName: string | null;
    }>;
  };
};
