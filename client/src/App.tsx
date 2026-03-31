import { useEffect, useMemo } from "react";
import { Switch, Route, Redirect, Link, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeaderNav } from "@/components/app-header-nav";
import { PatientSearch } from "@/components/patient-search";
import { PatientDemographicsSidebar } from "@/components/patient-demographics-sidebar";
import { PatientChartNavigatorEmbedded } from "@/components/patient-chart-navigator-embedded";
import { ScheduleNewAppointmentToolbarDialog } from "@/components/schedule-new-appointment-toolbar-dialog";
import { cn } from "@/lib/utils";
import { MutedIconBox } from "@/components/muted-icon-box";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun, CalendarDays, FlaskConical, Upload, User, UserPlus, LogOut, Heart, PhoneCall, Shield } from "lucide-react";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import SchedulePage from "@/pages/schedule";
import PatientsPage from "@/pages/patients";
import RegisterPatientPage from "@/pages/register-patient";
import PatientDetailPage from "@/pages/patient-detail";
import PatientDemographicsEditPage from "@/pages/patient-demographics-edit-page";
import EncountersPage from "@/pages/encounters";
import EncounterDetailPage from "@/pages/encounter-detail";
import AppointmentsPage from "@/pages/appointments";
import CheckInAppointmentPage from "@/pages/check-in-appointment";
import LaboratoryPage from "@/pages/laboratory";
import UploadResultsPage from "@/pages/upload-results";
import BillingPage from "@/pages/billing";
import BillingVisitChargesReviewPage from "@/pages/billing-visit-charges-review";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";
import PatientFollowUpPage from "@/pages/patient-follow-up";
import PatientCallPage from "@/pages/patient-call";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}

function LandingByRole() {
  const { user } = useAuth();
  if (user?.role === "security") {
    return <Redirect to="/admin" />;
  }
  if (user?.role === "reception") {
    return <AppointmentsPage />;
  }
  const scheduleRoles = ["clinician", "nurse"];
  if (user && scheduleRoles.includes(user.role)) {
    return <SchedulePage />;
  }
  return <DashboardPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingByRole} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/patients" component={PatientsPage} />
      <Route path="/patients/register" component={RegisterPatientPage} />
      <Route path="/patients/:id/demographics" component={PatientDemographicsEditPage} />
      <Route path="/patients/:id" component={PatientDetailPage} />
      <Route path="/encounters" component={EncountersPage} />
      <Route path="/encounters/:id" component={EncounterDetailPage} />
      <Route path="/appointments/check-in/:appointmentId" component={CheckInAppointmentPage} />
      <Route path="/appointments" component={AppointmentsPage} />
      <Route path="/patient-follow-up" component={PatientFollowUpPage} />
      <Route path="/patient-call" component={PatientCallPage} />
      <Route path="/laboratory" component={LaboratoryPage} />
      <Route path="/upload-results" component={UploadResultsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/billing/visit-charges/:encounterId" component={BillingVisitChargesReviewPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const pathOnly = location.split("?")[0];
  const [matchDemographics, demoParams] = useRoute("/patients/:id/demographics");
  const [matchPatient, params] = useRoute("/patients/:id");
  const patientIdFromRoute =
    matchDemographics && demoParams?.id
      ? demoParams.id
      : matchPatient && params?.id && params.id !== "register"
        ? params.id
        : undefined;

  useEffect(() => {
    if (patientIdFromRoute) {
      sessionStorage.setItem("ehr_active_patient_id", patientIdFromRoute);
    }
  }, [patientIdFromRoute]);

  useEffect(() => {
    if (pathOnly === "/patients" || pathOnly === "/patients/register") {
      sessionStorage.removeItem("ehr_active_patient_id");
    }
  }, [pathOnly]);

  /** Security role: Administration area only. */
  useEffect(() => {
    if (user?.role === "security" && pathOnly !== "/admin") {
      setLocation("/admin");
    }
  }, [user, pathOnly, setLocation]);

  const activePatientId = useMemo(() => {
    if (patientIdFromRoute) return patientIdFromRoute;
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("ehr_active_patient_id");
  }, [patientIdFromRoute, location]);

  const isPatientDetailRoute =
    /^\/patients\/[^/]+(\/demographics)?$/.test(pathOnly) && pathOnly !== "/patients/register";
  /** No embedded patient storyboard on Schedule (or home when it is the schedule landing). */
  const scheduleLandingRoles = ["clinician", "nurse"] as const;
  const isScheduleView =
    pathOnly === "/schedule" ||
    (pathOnly === "/" && !!user && scheduleLandingRoles.includes(user.role as (typeof scheduleLandingRoles)[number]));

  /**
   * Toolbar: Schedule never shows the embedded storyboard.
   * Laboratory & Uploads: full-width only (no demographics + chart navigator rail).
   * Other routes (dashboard, admin, etc.) never show the embedded chrome.
   */
  /** Lab and Uploads are full-width workflows; do not pin demographics / chart review beside them. */
  const showEmbeddedOnLaboratory = false;
  const showEmbeddedOnUploadResults = false;

  const showEmbeddedPatientChrome =
    !isPatientDetailRoute &&
    pathOnly !== "/patients" &&
    !isScheduleView &&
    (showEmbeddedOnLaboratory || showEmbeddedOnUploadResults);

  const showPatientDemographicsSidebar =
    (isPatientDetailRoute && !!patientIdFromRoute) || showEmbeddedPatientChrome;
  const demographicsPatientId = patientIdFromRoute ?? activePatientId ?? "";

  const showLabAndUpload = user && ["clinician", "nurse"].includes(user.role);
  const isReception = user && user.role === "reception";
  /** Put module nav (Dashboard, Billing, …) before Schedule / Patient Call so admins see the intended order. */
  const isAdminRole = user && (user.role === "super_admin" || user.role === "facility_admin");
  const isSecurityOnly = user && user.role === "security";

  return (
    <>
      <div className="flex h-screen w-full flex-col">
        <header className="flex w-full flex-wrap items-center gap-2 sm:gap-3 p-2 border-b bg-background sticky top-0 z-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link href="/">
                <a
                  className="inline-flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/80 transition-colors shrink-0"
                  data-testid="link-app-brand"
                >
                  <MutedIconBox icon={Heart} size="sm" />
                  <span className="font-bold text-xs sm:text-sm tracking-tight leading-tight">
                    Pin Point Health
                  </span>
                </a>
              </Link>
              {isSecurityOnly ? (
                <AppHeaderNav user={user} />
              ) : isAdminRole ? (
                <>
                  <AppHeaderNav user={user} />
                  <Link href="/schedule">
                    <a
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      data-testid="toolbar-schedule"
                    >
                      <CalendarDays className="w-4 h-4" />
                      Schedule
                    </a>
                  </Link>
                  <Link href="/admin">
                    <a
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        (pathOnly === "/admin" || pathOnly.startsWith("/admin/")) && "bg-accent text-accent-foreground"
                      )}
                      data-testid="link-nav-admin"
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap">Admin</span>
                    </a>
                  </Link>
                  <Link href="/patient-call">
                    <a
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      data-testid="toolbar-patient-call"
                    >
                      <PhoneCall className="w-4 h-4" />
                      Patient Call
                    </a>
                  </Link>
                </>
              ) : (
                <>
                  {isReception ? (
                    <Link href="/appointments">
                      <a
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                        data-testid="toolbar-appointments"
                      >
                        <CalendarDays className="w-4 h-4" />
                        Scheduled Appointment
                      </a>
                    </Link>
                  ) : (
                    <Link href="/schedule">
                      <a
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                        data-testid="toolbar-schedule"
                      >
                        <CalendarDays className="w-4 h-4" />
                        Schedule
                      </a>
                    </Link>
                  )}
                  <Link href="/patient-call">
                    <a
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                      data-testid="toolbar-patient-call"
                    >
                      <PhoneCall className="w-4 h-4" />
                      Patient Call
                    </a>
                  </Link>
                  {showLabAndUpload && (
                    <>
                      <Link href="/laboratory">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-laboratory"
                        >
                          <FlaskConical className="w-4 h-4" />
                          Laboratory
                        </a>
                      </Link>
                      <Link href="/upload-results">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-upload-results"
                        >
                          <Upload className="w-4 h-4" />
                          Uploads
                        </a>
                      </Link>
                    </>
                  )}
                  {isReception && (
                    <>
                      <ScheduleNewAppointmentToolbarDialog />
                      <Link href="/patients/register">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-register-new-patient"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span className="hidden sm:inline">New Patient</span>
                          <span className="sm:hidden">Register</span>
                        </a>
                      </Link>
                    </>
                  )}
                  {user ? <AppHeaderNav user={user} /> : null}
                </>
              )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            {user && (
              <span
                className="inline-flex items-center gap-1.5 min-w-0 max-w-[min(12rem,40vw)] sm:max-w-xs"
                data-testid="header-user-name"
                title={user.fullName || user.username}
              >
                <User className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm font-medium text-foreground" title={user.fullName || user.username}>
                  {user.fullName?.trim() || user.username}
                </span>
              </span>
            )}
            <PatientSearch />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1">
          {showPatientDemographicsSidebar && demographicsPatientId ? (
            <>
              <PatientDemographicsSidebar
                patientId={demographicsPatientId}
                onRequestLeave={(path) => window.dispatchEvent(new CustomEvent("ehr-request-leave", { detail: path }))}
              />
              {/* Laboratory / Uploads: embedded storyboard is review-only (no visit documentation) */}
              {showEmbeddedPatientChrome && (
                <PatientChartNavigatorEmbedded
                  patientId={demographicsPatientId}
                  showVisitDocumentation={false}
                />
              )}
            </>
          ) : null}
          <main className="min-w-0 flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading Pin Point Health…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
