import { useEffect, useMemo, useState } from "react";
import { Switch, Route, Link, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeaderNav } from "@/components/app-header-nav";
import { PatientSearch } from "@/components/patient-search";
import { PatientDemographicsSidebar } from "@/components/patient-demographics-sidebar";
import { PatientChartNavigatorEmbedded } from "@/components/patient-chart-navigator-embedded";
import { ToolbarPatientPickerDialog } from "./components/toolbar-patient-picker-dialog";
import { ScheduleNewAppointmentToolbarDialog } from "@/components/schedule-new-appointment-toolbar-dialog";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Moon, Sun, CalendarDays, FlaskConical, Upload, UserPlus, LogOut, Receipt, Heart } from "lucide-react";

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
import PharmacyPage from "@/pages/pharmacy";
import BillingPage from "@/pages/billing";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";

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
      <Route path="/laboratory" component={LaboratoryPage} />
      <Route path="/upload-results" component={UploadResultsPage} />
      <Route path="/pharmacy" component={PharmacyPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
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
   * Laboratory & Upload Results: show demographics + chart navigator only when there is an
   * active patient chart session AND the user role is allowed for that workflow (same as sidebar).
   * Other routes (dashboard, admin, etc.) never show the embedded storyboard.
   */
  const laboratoryRoles = new Set([
    "super_admin",
    "facility_admin",
    "clinician",
    "nurse",
    "lab_tech",
  ]);
  const uploadResultsRoles = new Set([
    "super_admin",
    "facility_admin",
    "clinician",
    "nurse",
    "lab_tech",
  ]);

  const role = user?.role ?? "";
  const inPatientChartSession = !!activePatientId;
  const showEmbeddedOnLaboratory =
    pathOnly === "/laboratory" && inPatientChartSession && laboratoryRoles.has(role);
  const showEmbeddedOnUploadResults =
    pathOnly === "/upload-results" && inPatientChartSession && uploadResultsRoles.has(role);

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
  const isAdminToolbar = user && (user.role === "super_admin" || user.role === "facility_admin");

  const [labPickerOpen, setLabPickerOpen] = useState(false);
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);

  return (
    <>
      <ToolbarPatientPickerDialog
        open={labPickerOpen}
        onOpenChange={setLabPickerOpen}
        title="Laboratory — select patient"
        description="Search for the patient you are resulting labs for."
        targetPath="/laboratory"
      />
      <ToolbarPatientPickerDialog
        open={uploadPickerOpen}
        onOpenChange={setUploadPickerOpen}
        title="Upload results — select patient"
        description="Search for the patient whose outside lab, imaging, or document you are uploading."
        targetPath="/upload-results"
      />
      <div className="flex h-screen w-full">
        {showPatientDemographicsSidebar && demographicsPatientId ? (
          <>
            <PatientDemographicsSidebar
              patientId={demographicsPatientId}
              onRequestLeave={(path) => window.dispatchEvent(new CustomEvent("ehr-request-leave", { detail: path }))}
            />
            {/* Laboratory / Upload Results: embedded storyboard is review-only (no visit documentation) */}
            {showEmbeddedPatientChrome && (
              <PatientChartNavigatorEmbedded
                patientId={demographicsPatientId}
                showVisitDocumentation={false}
              />
            )}
          </>
        ) : null}
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 border-b bg-background sticky top-0 z-50">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link href="/">
                <a
                  className="inline-flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/80 transition-colors shrink-0"
                  data-testid="link-app-brand"
                >
                  <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                    <Heart className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <span className="font-bold text-sm tracking-tight">PPH</span>
                </a>
              </Link>
              {isReception ? (
                <Link href="/appointments">
                  <a
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                    data-testid="toolbar-appointments"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Appointments
                  </a>
                </Link>
              ) : (
                <Link href="/schedule">
                  <a className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors" data-testid="toolbar-schedule">
                    <CalendarDays className="w-4 h-4" />
                    Schedule
                  </a>
                </Link>
              )}
              {isAdminToolbar && (
                <Link href="/billing">
                  <a
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                    data-testid="toolbar-billing"
                  >
                    <Receipt className="w-4 h-4" />
                    Billing
                  </a>
                </Link>
              )}
              {showLabAndUpload && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="inline-flex items-center gap-2 px-3 py-2 h-auto rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    data-testid="toolbar-laboratory"
                    onClick={() => setLabPickerOpen(true)}
                  >
                    <FlaskConical className="w-4 h-4" />
                    Laboratory
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="inline-flex items-center gap-2 px-3 py-2 h-auto rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    data-testid="toolbar-upload-results"
                    onClick={() => setUploadPickerOpen(true)}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Results
                  </Button>
                </>
              )}
              {isReception && (
                <>
                  <ScheduleNewAppointmentToolbarDialog />
                  <Link href="/patients/register">
                    <a className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors" data-testid="toolbar-register-new-patient">
                      <UserPlus className="w-4 h-4" />
                      <span className="hidden sm:inline">Register New Patient</span>
                      <span className="sm:hidden">Register</span>
                    </a>
                  </Link>
                </>
              )}
              {user ? <AppHeaderNav user={user} /> : null}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
          <main className="flex-1 overflow-auto">
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
          <p className="text-sm text-muted-foreground">Loading PPH…</p>
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
