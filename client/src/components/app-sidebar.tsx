import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Users, Stethoscope, Calendar, FlaskConical,
  Pill, Receipt, Shield, Heart, LogOut, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  facility_admin: "Facility Admin",
  clinician: "Clinician",
  nurse: "Nurse",
  lab_tech: "Lab Tech",
  pharmacist: "Pharmacist",
  finance: "Finance",
  reception: "Reception",
};

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech", "pharmacist", "finance", "reception"] },
  { title: "Patients", url: "/patients", icon: Users, roles: ["super_admin", "facility_admin", "clinician", "nurse", "reception"] },
  { title: "Encounters", url: "/encounters", icon: Stethoscope, roles: ["super_admin", "facility_admin", "clinician", "nurse"] },
  { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["super_admin", "facility_admin", "clinician", "nurse", "reception"] },
  { title: "Laboratory", url: "/laboratory", icon: FlaskConical, roles: ["super_admin", "facility_admin", "clinician", "nurse", "lab_tech"] },
  { title: "Pharmacy", url: "/pharmacy", icon: Pill, roles: ["super_admin", "facility_admin", "clinician", "pharmacist"] },
  { title: "Billing", url: "/billing", icon: Receipt, roles: ["super_admin", "facility_admin", "finance", "reception"] },
  { title: "Admin", url: "/admin", icon: Shield, roles: ["super_admin", "facility_admin"] },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const filteredNav = navItems.filter((item) => user && item.roles.includes(user.role));
  const initials = user?.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "U";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer" data-testid="link-logo">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm tracking-tight truncate">OneHealthEHR</h2>
              <p className="text-[11px] text-muted-foreground truncate">Electronic Health Records</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNav.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 p-2">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">{user?.fullName}</p>
            <Badge variant="secondary" className="text-[10px] mt-0.5">{roleLabels[user?.role || ""] || user?.role}</Badge>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
