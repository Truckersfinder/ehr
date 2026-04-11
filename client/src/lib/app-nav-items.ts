import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FlaskConical,
  Upload,
  Receipt,
  CalendarDays,
  ClipboardList,
  Settings2,
  Users,
  ShieldCheck,
  Building2,
} from "lucide-react";

export type AppNavItem = {
  /** Stable English title for capability / filter matching (NAV_ITEM_CAPABILITY_ID). */
  title: string;
  /** i18n key under `nav.*` in locale files. */
  i18nKey: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
};

/** Primary module navigation (previously sidebar); shown in the app header. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    title: "Dashboard",
    i18nKey: "nav.dashboard",
    url: "/",
    icon: LayoutDashboard,
    roles: ["super_admin", "lab_tech"],
  },
  {
    title: "Billing",
    i18nKey: "nav.billing",
    url: "/billing",
    icon: Receipt,
    roles: ["super_admin", "reception"],
  },
  {
    title: "Scheduled Appointment",
    i18nKey: "nav.scheduledAppointment",
    url: "/appointments",
    icon: CalendarDays,
    roles: ["reception"],
  },
  {
    title: "Patient Follow up",
    i18nKey: "nav.patientFollowUp",
    url: "/patient-follow-up",
    icon: ClipboardList,
    roles: ["reception"],
  },
  {
    title: "Laboratory",
    i18nKey: "nav.laboratory",
    url: "/laboratory",
    icon: FlaskConical,
    roles: ["super_admin", "clinician", "nurse", "lab_tech"],
  },
  {
    title: "Uploads",
    i18nKey: "nav.uploads",
    url: "/upload-results",
    icon: Upload,
    roles: ["super_admin", "clinician", "nurse", "lab_tech"],
  },
  {
    title: "Organization configuration",
    i18nKey: "nav.organizationConfiguration",
    url: "/admin?section=organization",
    icon: Settings2,
    roles: ["security"],
  },
  {
    title: "User management",
    i18nKey: "nav.userManagement",
    url: "/admin?section=users",
    icon: Users,
    roles: ["security"],
  },
  {
    title: "Role management",
    i18nKey: "nav.roleManagement",
    url: "/admin?section=roles",
    icon: ShieldCheck,
    roles: ["security"],
  },
  {
    title: "Administrative",
    i18nKey: "nav.administrative",
    url: "/admin?section=administrative",
    icon: Building2,
    roles: ["security"],
  },
];
