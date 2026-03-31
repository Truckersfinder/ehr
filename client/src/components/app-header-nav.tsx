import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { APP_NAV_ITEMS } from "@/lib/app-nav-items";

type UserLike = { role: string };

function navTestId(title: string) {
  return `link-nav-${title.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * Horizontal links that replaced the main navigation sidebar (role-filtered).
 */
export function AppHeaderNav({ user }: { user: UserLike }) {
  const [location] = useLocation();
  const items = APP_NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const hideTitles = new Set<string>();
  if (user.role === "reception") hideTitles.add("Scheduled Appointment");
  if (user.role === "clinician" || user.role === "nurse") {
    hideTitles.add("Laboratory");
    hideTitles.add("Uploads");
  }

  const visible = items.filter((i) => !hideTitles.has(i.title));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((item) => {
        const isActive =
          location === item.url || (item.url !== "/" && location.startsWith(item.url));
        return (
          <Link key={item.title} href={item.url}>
            <a
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )}
              data-testid={navTestId(item.title)}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">{item.title}</span>
            </a>
          </Link>
        );
      })}
    </>
  );
}
