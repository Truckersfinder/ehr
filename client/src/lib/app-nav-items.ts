import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FlaskConical,
  Upload,
  Pill,
  Receipt,
  Shield,
  CalendarDays,
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
    roles: ["super_admin", "facility_admin", "lab_tech", "pharmacist", "finance"],
  },
  { title: "Appointments", url: "/appointments", icon: CalendarDays, roles: ["reception"] },
  {
    title: "Laboratory",
    url: "/laboratory",
    icon: FlaskConical,
    roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech"],
  },
  {
    title: "Upload Results",
    url: "/upload-results",
    icon: Upload,
    roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech"],
  },
  {
    title: "Pharmacy",
    url: "/pharmacy",
    icon: Pill,
    roles: ["super_admin", "facility_admin", "clinician", "pharmacist"],
  },
  /** Billing in nav for finance & reception; super_admin / facility_admin use toolbar Billing */
  { title: "Billing", url: "/billing", icon: Receipt, roles: ["finance", "reception"] },
  { title: "Admin", url: "/admin", icon: Shield, roles: ["super_admin", "facility_admin"] },
];
