import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FlaskConical,
  Upload,
  Receipt,
  Shield,
  CalendarDays,
  ClipboardList,
} from "lucide-react";

export type AppNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
};

/** Primary module navigation (previously sidebar); shown in the app header. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    roles: ["super_admin", "facility_admin", "lab_tech", "pharmacist", "finance", "security"],
  },
  {
    title: "Billing",
    url: "/billing",
    icon: Receipt,
    roles: ["super_admin", "facility_admin", "finance", "reception", "security"],
  },
  { title: "Scheduled Appointment", url: "/appointments", icon: CalendarDays, roles: ["reception"] },
  { title: "Patient Follow up", url: "/patient-follow-up", icon: ClipboardList, roles: ["reception"] },
  {
    title: "Laboratory",
    url: "/laboratory",
    icon: FlaskConical,
    roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech"],
  },
  {
    title: "Uploads",
    url: "/upload-results",
    icon: Upload,
    roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech"],
  },
  /** Security staff: Administration only (same app area as super / facility admin). */
  { title: "Admin", url: "/admin", icon: Shield, roles: ["security"] },
];
