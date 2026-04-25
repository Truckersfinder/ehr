import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  FlaskConical,
  Upload,
  UserPlus,
  PhoneCall,
  Shield,
  Bed,
  LayoutDashboard,
  SlidersHorizontal,
  Building2,
  Settings2,
  Users,
  ShieldCheck,
  LayoutGrid,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toolbarActivityHref, toolbarActivityTestId } from "@/lib/toolbar-activity-links";

type Item = { id: string; label: string };

function iconFor(id: string) {
  switch (id) {
    case "tb_systems_dashboard":
      return LayoutDashboard;
    case "tb_administrative":
      return Building2;
    case "tb_api":
      return Plug;
    case "tb_application_config":
      return SlidersHorizontal;
    case "tb_organization_config":
      return Settings2;
    case "tb_patient_portal_config":
      return LayoutGrid;
    case "tb_user_management":
      return Users;
    case "tb_role_management":
      return ShieldCheck;
    case "tb_schedule":
    case "tb_reception_appointments":
      return CalendarDays;
    case "tb_admin":
      return Shield;
    case "tb_bed_management":
      return Bed;
    case "tb_patient_call":
      return PhoneCall;
    case "tb_laboratory":
      return FlaskConical;
    case "tb_uploads":
      return Upload;
    case "tb_register_patient":
      return UserPlus;
    default:
      return CalendarDays;
  }
}

type Props = {
  items: Item[];
  pathOnly: string;
  location: string;
  isAdminGeneralNav: boolean;
  isAdminBedManagementNav: boolean;
};

function linkActive(
  id: string,
  pathOnly: string,
  location: string,
  isAdminGeneralNav: boolean,
  isAdminBedManagementNav: boolean,
): boolean {
  const href = toolbarActivityHref(id);
  const base = href.split("?")[0];
  const q = href.includes("?") ? href.split("?")[1] : "";
  if (id === "tb_admin") return isAdminGeneralNav;
  if (id === "tb_bed_management") return isAdminBedManagementNav;
  if (q) {
    return pathOnly === base && location.includes(q);
  }
  return pathOnly === base || (base !== "/" && pathOnly.startsWith(base));
}

export function ToolbarActionLinks({
  items,
  pathOnly,
  location,
  isAdminGeneralNav,
  isAdminBedManagementNav,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      {items.map(({ id, label }) => {
        const href = toolbarActivityHref(id);
        const Icon = iconFor(id);
        const testId = toolbarActivityTestId(id);
        const isActive = linkActive(id, pathOnly, location, isAdminGeneralNav, isAdminBedManagementNav);
        const text = t(`toolbarIds.${id}`, { defaultValue: label });
        return (
          <Link key={id} href={href}>
            <a
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )}
              data-testid={testId}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {id === "tb_register_patient" ? (
                <>
                  <span className="hidden sm:inline">{text}</span>
                  <span className="sm:hidden">{t("toolbar.register")}</span>
                </>
              ) : (
                <span className="whitespace-nowrap">{text}</span>
              )}
            </a>
          </Link>
        );
      })}
    </>
  );
}
