import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { APP_NAV_ITEMS } from "@/lib/app-nav-items";
import { NAV_ITEM_CAPABILITY_ID } from "@shared/role-capabilities-registry";
import { HEADER_NAV_ACTIVITY_ORDER } from "@shared/application-ui";

type UserLike = {
  role: string;
  capabilities?: string[];
  activityUi?: {
    headerNav: { id: string; label: string }[];
  };
};

/** Header links reserved for Systems administrator (`security`); Clinic / Facility admins use Admin + in-page nav. */
const SYSTEMS_ADMIN_ONLY_NAV_TITLES = new Set([
  "Organization configuration",
  "User management",
  "Role management",
  "Administrative",
]);

/** Toolbar module links (Dashboard, Billing, Laboratory, Uploads) — hidden for Systems administrator; they use admin toolbar + activities only. */
const MODULE_NAV_HIDDEN_FOR_SECURITY = new Set([
  "Dashboard",
  "Billing",
  "Laboratory",
  "Uploads",
]);

function navTestId(title: string) {
  return `link-nav-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

/** Match toolbar link to current /admin URL (section=… or legacy tab=…). */
function adminNavItemIsActive(itemUrl: string, pathname: string, search: string): boolean {
  if (!itemUrl.includes("/admin?")) return false;
  const itemQ = new URLSearchParams(itemUrl.split("?")[1] ?? "");
  const want = itemQ.get("section");
  if (!want) return false;
  if (pathname !== "/admin") return false;
  const cur = new URLSearchParams(search);
  const section = cur.get("section");
  const tab = cur.get("tab");
  if (section === want) return true;
  if (want === "organization" && !section && !tab) return true;
  if (want === "users" && tab === "users") return true;
  if (want === "administrative" && tab && ["facilities", "beds", "forms", "audit"].includes(tab)) return true;
  return false;
}

/**
 * Horizontal links that replaced the main navigation sidebar (role-filtered).
 */
export function AppHeaderNav({ user }: { user: UserLike }) {
  const { t } = useTranslation();
  const [pathname] = useLocation();
  const search = useSearch();

  const items = APP_NAV_ITEMS.filter((item) => {
    if (MODULE_NAV_HIDDEN_FOR_SECURITY.has(item.title) && user.role === "security") {
      return false;
    }
    if (SYSTEMS_ADMIN_ONLY_NAV_TITLES.has(item.title) && user.role !== "security") {
      return false;
    }
    const capId = NAV_ITEM_CAPABILITY_ID[item.title];
    if (user.capabilities?.length && capId) {
      return user.capabilities.includes(capId);
    }
    return item.roles.includes(user.role);
  });

  const hideTitles = new Set<string>();
  if (user.role === "reception") hideTitles.add("Scheduled Appointment");
  if (user.role === "clinician" || user.role === "nurse") {
    hideTitles.add("Laboratory");
    hideTitles.add("Uploads");
  }

  const legacyVisible = items.filter((i) => !hideTitles.has(i.title));

  const headerNavFromApi = user.activityUi?.headerNav;
  const layoutRows =
    headerNavFromApi?.map(({ id, label }) => {
      const meta = HEADER_NAV_ACTIVITY_ORDER.find((h) => h.id === id);
      if (!meta) return null;
      const item = APP_NAV_ITEMS.find((n) => n.title === meta.titleKey);
      if (!item || hideTitles.has(item.title)) return null;
      return { item, displayTitle: label, layoutKey: id, meta };
    }) ?? [];

  const fromLayout = layoutRows.filter((r): r is NonNullable<(typeof layoutRows)[number]> => r !== null);

  const visible =
    headerNavFromApi?.length === 0
      ? []
      : fromLayout.length > 0
        ? fromLayout
        : legacyVisible.map((item) => ({
            item,
            displayTitle: item.title,
            layoutKey: item.title,
            meta: null as (typeof HEADER_NAV_ACTIVITY_ORDER)[number] | null,
          }));

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((row) => {
        const { item, displayTitle, layoutKey, meta } = row;
        const full = `${pathname}${search ? `?${search}` : ""}`;
        const isActive =
          full === item.url ||
          (item.url.includes("?") && adminNavItemIsActive(item.url, pathname, search)) ||
          (item.url !== "/" && !item.url.includes("?") && pathname.startsWith(item.url));
        const titleKey = meta?.titleKey ?? item.title;
        const label = meta
          ? t(`toolbarIds.${meta.id}`, { defaultValue: displayTitle })
          : t(item.i18nKey, { defaultValue: titleKey });
        return (
          <Link key={layoutKey} href={item.url}>
            <a
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )}
              data-testid={navTestId(titleKey)}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </a>
          </Link>
        );
      })}
    </>
  );
}
