import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router as WouterRouter, Switch, Route, Redirect, Link, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeaderNav } from "@/components/app-header-nav";
import { PatientSearch } from "@/components/patient-search";
import { PatientStoryboard } from "@/components/patient-demographics-sidebar";
import { PatientChartNavigatorEmbedded } from "@/components/patient-chart-navigator-embedded";
import { ScheduleNewAppointmentToolbarDialog } from "@/components/schedule-new-appointment-toolbar-dialog";
import { ToolbarActionLinks } from "@/components/toolbar-action-links";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useOrganizationSettings } from "@/lib/organization-settings";
import { ImaniMark } from "@/components/imani-mark";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CalendarDays, FlaskConical, Upload, UserPlus, LogOut, PhoneCall, Shield, Bed, LayoutDashboard } from "lucide-react";

import LoginPage from "@/pages/login";
import PinpointEhrHomePage from "@/pages/pinpoint-ehr-home";
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
import AdminFormNewPage from "@/pages/admin-form-new";
import AdminFormEditPage from "@/pages/admin-form-edit";
import NotFound from "@/pages/not-found";
import PatientFollowUpPage from "@/pages/patient-follow-up";
import PatientCallPage from "@/pages/patient-call";
import RecentlyDischargedPage from "@/pages/recently-discharged";
import FormsConsentEnterPatientChart from "@/pages/forms-consent-enter-patient-chart";
import PatientClinicalFormFillPage from "@/pages/patient-clinical-form-fill";
import PatientClinicalFormCompletionReviewPage from "@/pages/patient-clinical-form-completion-review";
import PublicClinicalFormFillPage from "@/pages/public-clinical-form-fill";
import SystemsAdminDashboardPage from "@/pages/systems-admin-dashboard";
import PatientPortalConfigurationPage from "@/pages/patient-portal-configuration";
import PatientPortalLoginPage from "@/pages/patient-portal-login";
import PatientPortalInvitePage from "@/pages/patient-portal-invite";
import PatientPortalRecordPage from "@/pages/patient-portal-record";

function LandingByRole() {
  const { user } = useAuth();
  if (user?.role === "reception") {
    return <AppointmentsPage />;
  }
  const scheduleRoles = ["clinician", "nurse"];
  if (user && scheduleRoles.includes(user.role)) {
    return <SchedulePage />;
  }
  /** Systems administrators land on the systems dashboard, not the clinical department dashboard. */
  if (user?.role === "security") {
    return <Redirect to="/systems-dashboard" />;
  }
  return <DashboardPage />;
}

function AuthenticatedRoutes() {
  return (
    <Switch>
      <Route path="/" component={LandingByRole} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/patients" component={PatientsPage} />
      <Route path="/patients/register" component={RegisterPatientPage} />
      <Route path="/patients/:id/demographics" component={PatientDemographicsEditPage} />
      <Route path="/patients/:id/clinical-forms/:formId/fill" component={PatientClinicalFormFillPage} />
      <Route path="/patients/:id/clinical-forms/completions/:completionId" component={PatientClinicalFormCompletionReviewPage} />
      <Route path="/patients/:id" component={PatientDetailPage} />
      <Route path="/encounters" component={EncountersPage} />
      <Route path="/encounters/:id" component={EncounterDetailPage} />
      <Route path="/appointments/check-in/:appointmentId" component={CheckInAppointmentPage} />
      <Route path="/appointments" component={AppointmentsPage} />
      <Route path="/patient-follow-up" component={PatientFollowUpPage} />
      <Route path="/patient-call" component={PatientCallPage} />
      <Route path="/admissions/recently-discharged" component={RecentlyDischargedPage} />
      <Route path="/laboratory" component={LaboratoryPage} />
      <Route path="/upload-results" component={UploadResultsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/billing/visit-charges/:encounterId" component={BillingVisitChargesReviewPage} />
      <Route path="/forms-activity" component={FormsConsentEnterPatientChart} />
      <Route path="/forms" component={FormsConsentEnterPatientChart} />
      <Route path="/systems-dashboard" component={SystemsAdminDashboardPage} />
      <Route path="/patient-portal-configuration" component={PatientPortalConfigurationPage} />
      <Route path="/admin/forms/new" component={AdminFormNewPage} />
      <Route path="/admin/forms/:formId/edit" component={AdminFormEditPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const pathOnly = location.split("?")[0];
  const adminUrlTab = useMemo(() => {
    if (pathOnly !== "/admin") return null;
    const q = location.includes("?") ? location.split("?")[1] : "";
    return new URLSearchParams(q).get("tab");
  }, [location, pathOnly]);
  const isAdminBedManagementNav = pathOnly === "/admin" && adminUrlTab === "beds";
  /** Include nested admin routes (e.g. /admin/forms/new) so the Admin toolbar item stays active. */
  const isAdminGeneralNav =
    (pathOnly === "/admin" && adminUrlTab !== "beds") || pathOnly.startsWith("/admin/");
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
   * Laboratory & Uploads: full-width only (no patient storyboard + navigator rail).
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

  const showPatientStoryboard =
    (isPatientDetailRoute && !!patientIdFromRoute) || showEmbeddedPatientChrome;
  const storyboardPatientId = patientIdFromRoute ?? activePatientId ?? "";

  const showLabAndUpload = user && ["clinician", "nurse"].includes(user.role);
  const isReception = user && user.role === "reception";
  /** Clinic/facility admins + systems administrators (security): full toolbar (Schedule, Admin, beds link, Patient Call). */
  const isAdminRole =
    user && (user.role === "super_admin" || user.role === "security");

  const headerUserLabel = useMemo(() => {
    if (!user) return "";
    if (user.role === "super_admin") return t("roles.super_admin");
    if (user.role === "security") return t("roles.security");
    return user.fullName?.trim() || user.username;
  }, [user, t]);

  const { organizationName, logoUrl } = useOrganizationSettings();

  const headerRoleLabel =
    user?.role != null ? t(`roles.${user.role}`, { defaultValue: user.role }) : "";

  const headerProfileName = user?.fullName?.trim() || user?.username || "";

  const headerProfileOrg = (user?.organization?.name ?? organizationName ?? "").trim();

  const headerProfileInitials = useMemo(() => {
    const n = headerProfileName || user?.username || "";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2)
      return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }, [headerProfileName, user?.username]);

  const headerProfileTooltip = [headerProfileName, headerProfileOrg, headerRoleLabel]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    document.title = t("app.documentTitleEhr", { name: organizationName });
  }, [organizationName, t]);

  /** Security toolbar without the dashboard item — we always render a dedicated Systems dashboard link so it is never missing when UI layout omits `tb_systems_dashboard`. */
  const securityToolbarWithoutDashboard = useMemo(() => {
    if (user?.role !== "security" || !user.activityUi?.toolbar?.length) return [];
    return user.activityUi.toolbar.filter((x) => x.id !== "tb_systems_dashboard");
  }, [user?.role, user?.activityUi?.toolbar]);

  return (
    <>
      <div className="flex h-screen w-full flex-col">
        <header className="app-shell-header flex w-full flex-wrap items-center gap-2 sm:gap-3 p-2 border-b sticky top-0 z-50 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div
                className="inline-flex items-center gap-2 px-2 py-1.5 shrink-0 select-none"
                data-testid="header-app-brand"
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-7 w-auto max-w-[140px] object-contain dark:brightness-95"
                  />
                ) : (
                  <ImaniMark className="h-7 w-7" alt="" />
                )}
                <span className="font-serif font-semibold text-xs sm:text-sm tracking-tight leading-tight">
                  {organizationName}
                </span>
              </div>
              {isAdminRole ? (
                <>
                  {user.role === "security" ? (
                    <Link href="/systems-dashboard">
                      <a
                        className={cn(
                          "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          pathOnly === "/systems-dashboard" && "bg-accent text-accent-foreground",
                        )}
                        data-testid="toolbar-systems-dashboard"
                      >
                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                        {t("toolbar.dashboard")}
                      </a>
                    </Link>
                  ) : null}
                  {securityToolbarWithoutDashboard.length > 0 ? (
                    <ToolbarActionLinks
                      items={securityToolbarWithoutDashboard}
                      pathOnly={pathOnly}
                      location={location}
                      isAdminGeneralNav={isAdminGeneralNav}
                      isAdminBedManagementNav={isAdminBedManagementNav}
                    />
                  ) : null}
                  <AppHeaderNav user={user} />
                  {user.activityUi?.toolbar?.length && user.role !== "security" ? (
                    <ToolbarActionLinks
                      items={user.activityUi.toolbar}
                      pathOnly={pathOnly}
                      location={location}
                      isAdminGeneralNav={isAdminGeneralNav}
                      isAdminBedManagementNav={isAdminBedManagementNav}
                    />
                  ) : user.role !== "security" ? (
                    <>
                      <Link href="/schedule">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-schedule"
                        >
                          <CalendarDays className="w-4 h-4" />
                          {t("toolbar.schedule")}
                        </a>
                      </Link>
                      <Link href="/admin">
                        <a
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            isAdminGeneralNav && "bg-accent text-accent-foreground",
                          )}
                          data-testid="link-nav-admin"
                        >
                          <Shield className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">{t("toolbar.admin")}</span>
                        </a>
                      </Link>
                      <Link href="/admin?tab=beds">
                        <a
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            isAdminBedManagementNav && "bg-accent text-accent-foreground",
                          )}
                          data-testid="link-nav-bed-management"
                        >
                          <Bed className="w-4 h-4 shrink-0" />
                          <span className="whitespace-nowrap">{t("toolbar.bedManagement")}</span>
                        </a>
                      </Link>
                      <Link href="/patient-call">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-patient-call"
                        >
                          <PhoneCall className="w-4 h-4" />
                          {t("toolbar.patientCall")}
                        </a>
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {isReception ? <ScheduleNewAppointmentToolbarDialog /> : null}
                  {user && user.activityUi?.toolbar?.length ? (
                    <ToolbarActionLinks
                      items={user.activityUi.toolbar}
                      pathOnly={pathOnly}
                      location={location}
                      isAdminGeneralNav={isAdminGeneralNav}
                      isAdminBedManagementNav={isAdminBedManagementNav}
                    />
                  ) : (
                    <>
                      {isReception ? (
                        <Link href="/appointments">
                          <a
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                            data-testid="toolbar-appointments"
                          >
                            <CalendarDays className="w-4 h-4" />
                            {t("toolbar.scheduledAppointment")}
                          </a>
                        </Link>
                      ) : (
                        <Link href="/schedule">
                          <a
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                            data-testid="toolbar-schedule"
                          >
                            <CalendarDays className="w-4 h-4" />
                            {t("toolbar.schedule")}
                          </a>
                        </Link>
                      )}
                      <Link href="/patient-call">
                        <a
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                          data-testid="toolbar-patient-call"
                        >
                          <PhoneCall className="w-4 h-4" />
                          {t("toolbar.patientCall")}
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
                              {t("toolbar.laboratory")}
                            </a>
                          </Link>
                          <Link href="/upload-results">
                            <a
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                              data-testid="toolbar-upload-results"
                            >
                              <Upload className="w-4 h-4" />
                              {t("toolbar.uploads")}
                            </a>
                          </Link>
                        </>
                      )}
                      {isReception && (
                        <Link href="/patients/register">
                          <a
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                            data-testid="toolbar-register-new-patient"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">{t("toolbar.newPatient")}</span>
                            <span className="sm:hidden">{t("toolbar.register")}</span>
                          </a>
                        </Link>
                      )}
                    </>
                  )}
                  {user ? <AppHeaderNav user={user} /> : null}
                </>
              )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0 ml-auto sm:ml-0">
            {user && (
              <div
                className="flex items-center gap-2 min-w-0 max-w-[min(15rem,52vw)] sm:max-w-md"
                data-testid="header-profile"
                title={headerProfileTooltip}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground"
                  aria-hidden
                >
                  {headerProfileInitials}
                </div>
                <div className="flex min-w-0 flex-col items-end text-right leading-snug">
                  <span
                    className="truncate text-sm font-semibold text-foreground"
                    data-testid="header-profile-name"
                  >
                    {headerProfileName || headerUserLabel}
                  </span>
                  {headerProfileOrg ? (
                    <span className="truncate text-xs text-muted-foreground max-w-full">{headerProfileOrg}</span>
                  ) : null}
                  {headerRoleLabel ? (
                    <span className="truncate text-[11px] text-muted-foreground max-w-full">{headerRoleLabel}</span>
                  ) : null}
                </div>
              </div>
            )}
            <PatientSearch />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={logout}
              title={t("app.logOut")}
              aria-label={t("app.logOut")}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1">
          {showPatientStoryboard && storyboardPatientId ? (
            <>
              <PatientStoryboard
                patientId={storyboardPatientId}
                onRequestLeave={(path) => window.dispatchEvent(new CustomEvent("ehr-request-leave", { detail: path }))}
              />
              {/* Laboratory / Uploads: embedded storyboard is review-only (no visit documentation) */}
              {showEmbeddedPatientChrome && (
                <PatientChartNavigatorEmbedded
                  patientId={storyboardPatientId}
                  showVisitDocumentation={false}
                />
              )}
            </>
          ) : null}
          <main className="min-w-0 flex-1 overflow-auto">
            <AuthenticatedRoutes />
          </main>
        </div>
      </div>
    </>
  );
}

function PublicRouteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="absolute top-3 right-3 z-50 flex items-center gap-1 sm:gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [matchPublicClinicalForm, publicClinicalParams] = useRoute("/p/clinical-form/:token");
  const [matchLogin] = useRoute("/login");
  const [matchHome] = useRoute("/");
  const [matchPortalLogin] = useRoute("/portal");
  const [matchPortalInvite] = useRoute("/portal/invite/:token");
  const [matchPortalRecord] = useRoute("/portal/record");
  const { user, isLoading } = useAuth();

  if (matchPublicClinicalForm && publicClinicalParams?.token) {
    return (
      <PublicRouteChrome>
        <PublicClinicalFormFillPage token={decodeURIComponent(publicClinicalParams.token)} />
      </PublicRouteChrome>
    );
  }

  if (matchPortalInvite) {
    return (
      <PublicRouteChrome>
        <PatientPortalInvitePage />
      </PublicRouteChrome>
    );
  }
  if (matchPortalRecord) {
    return (
      <PublicRouteChrome>
        <PatientPortalRecordPage />
      </PublicRouteChrome>
    );
  }
  if (matchPortalLogin) {
    return (
      <PublicRouteChrome>
        <PatientPortalLoginPage />
      </PublicRouteChrome>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (matchLogin) {
      return <LoginPage />;
    }
    if (matchHome) {
      return <PinpointEhrHomePage />;
    }
    return <Redirect to="/login" />;
  }

  /** Logged-in staff: /login is invalid in this branch — send them to app home. */
  if (matchLogin) {
    return <Redirect to="/" />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter>
              <AppContent />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
