import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Encounter, Patient, Prescription, PatientProblem, PatientAllergy } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInOrgTimeZone } from "@/lib/org-timezone";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { VisitSummaryTab } from "@/components/visit-summary-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PatientPortalVisibilityConfig } from "@shared/patient-portal-config";

function dash(s: string | null | undefined): string {
  const t = typeof s === "string" ? s.trim() : "";
  return t.length > 0 ? t : "—";
}

type Props = {
  token: string | null;
  patient: Patient;
  prescriptions: Prescription[];
  problems: PatientProblem[];
  allergies: PatientAllergy[];
  users: { id: string; fullName: string; username?: string }[];
  /** Used by VisitSummaryTab for "By <user>" labels. */
  prescriberNameById: Map<string, string>;
  /** Patient portal: preloaded encounters (skips staff encounters API). */
  encountersOverride?: Encounter[];
  encountersLoading?: boolean;
  /** Patient portal visit summary URL for the selected encounter. */
  visitSummaryUrlForEncounter?: (encounterId: string) => string;
  /** When staff auth is absent (patient portal), pass facility IANA time zone. */
  orgTimeZone?: string;
  /** Hide tabs not enabled in organization patient portal settings. */
  tabVisibility?: Partial<
    Pick<
      PatientPortalVisibilityConfig,
      "showOverview" | "showVisits" | "showProblems" | "showMedications" | "showAllergies"
    >
  >;
  /** Portal / systems preview copy for title and description. */
  uiVariant?: "staff" | "portal" | "preview";
  /** Optional banner below the title (portal welcome message). */
  welcomeBanner?: string | null;
  /** Demo mode: visit summary is placeholder only (systems dashboard preview). */
  isPreview?: boolean;
};

function firstVisibleTab(vis: {
  showOverview: boolean;
  showVisits: boolean;
  showProblems: boolean;
  showMedications: boolean;
  showAllergies: boolean;
}): string {
  if (vis.showOverview) return "overview";
  if (vis.showVisits) return "visits";
  if (vis.showProblems) return "problems";
  if (vis.showMedications) return "medications";
  return "allergies";
}

export function PatientRecordTab({
  token,
  patient,
  prescriptions,
  problems,
  allergies,
  users,
  prescriberNameById,
  encountersOverride,
  encountersLoading: encountersLoadingProp,
  visitSummaryUrlForEncounter,
  orgTimeZone: orgTimeZoneProp,
  tabVisibility,
  uiVariant = "staff",
  welcomeBanner,
  isPreview = false,
}: Props) {
  const { t } = useTranslation();
  const hookTz = useOrgTimeZone();
  const orgTz = orgTimeZoneProp ?? hookTz;

  const vis = useMemo(
    () => ({
      showOverview: tabVisibility?.showOverview !== false,
      showVisits: tabVisibility?.showVisits !== false,
      showProblems: tabVisibility?.showProblems !== false,
      showMedications: tabVisibility?.showMedications !== false,
      showAllergies: tabVisibility?.showAllergies !== false,
    }),
    [tabVisibility],
  );

  const defaultTab = useMemo(() => firstVisibleTab(vis), [vis]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);

  const { data: encountersFetched = [], isLoading: encountersQueryLoading } = useQuery<Encounter[]>({
    queryKey: queryKeys.encounters.listByPatient(patient.id),
    queryFn: () => apiGetJson<Encounter[]>(`/api/encounters?patientId=${encodeURIComponent(patient.id)}`, token),
    enabled: !!token && !!patient.id && encountersOverride === undefined,
  });

  const encounters = encountersOverride ?? encountersFetched;
  const isLoading = encountersOverride !== undefined ? !!encountersLoadingProp : encountersQueryLoading;

  const completedVisits = useMemo(() => {
    const list = encounters.filter((e) => String(e.status) === "completed");
    list.sort((a, b) => new Date(b.visitDate ?? 0).getTime() - new Date(a.visitDate ?? 0).getTime());
    return list;
  }, [encounters]);

  const clinicianNameById = useMemo(() => new Map(users.map((u) => [u.id, u.fullName ?? u.username ?? u.id])), [users]);

  const activeMeds = prescriptions.filter((p) => p.status !== "cancelled");
  const discontinuedMeds = prescriptions.filter((p) => p.status === "cancelled");
  const activeProblems = problems.filter((p) => String(p.status ?? "active") !== "resolved");
  const resolvedProblems = problems.filter((p) => String(p.status ?? "") === "resolved");

  const addressLine = [patient.address, patient.city, patient.state, patient.country].filter(Boolean).join(", ");

  const title =
    uiVariant === "preview"
      ? t("pages.patientRecord.titlePreview")
      : uiVariant === "portal"
        ? t("pages.patientRecord.titlePortal")
        : t("pages.patientRecord.titleStaff");
  const subtitle =
    uiVariant === "preview"
      ? t("pages.patientRecord.subtitlePreview")
      : uiVariant === "portal"
        ? t("pages.patientRecord.subtitlePortal")
        : t("pages.patientRecord.subtitleStaff");

  return (
    <div className="p-4 space-y-6 max-w-7xl" data-testid="patient-record-tab">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {welcomeBanner ? (
          <div className="mt-3 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
            {welcomeBanner}
          </div>
        ) : null}
      </div>

      <Tabs key={JSON.stringify(vis)} defaultValue={defaultTab} className="w-full">
        <SidebarTabsNavLayout
          sidebar={
            <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
              {vis.showOverview ? (
                <TabsTrigger value="overview" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                  {t("pages.patientRecord.tabOverview")}
                </TabsTrigger>
              ) : null}
              {vis.showVisits ? (
                <TabsTrigger value="visits" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                  {t("pages.patientRecord.tabVisits")}
                </TabsTrigger>
              ) : null}
              {vis.showProblems ? (
                <TabsTrigger value="problems" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                  {t("pages.patientRecord.tabProblems")}
                </TabsTrigger>
              ) : null}
              {vis.showMedications ? (
                <TabsTrigger value="medications" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                  {t("pages.patientRecord.tabMedications")}
                </TabsTrigger>
              ) : null}
              {vis.showAllergies ? (
                <TabsTrigger value="allergies" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                  {t("pages.patientRecord.tabAllergies")}
                </TabsTrigger>
              ) : null}
            </TabsList>
          }
        >
          {vis.showOverview ? (
          <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none">
            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.demoContact")}</h3>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2 text-sm">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("pages.patientRecord.sectionIdentity")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelName")}</span> {patient.firstName}{" "}
                    {patient.lastName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelMrn")}</span> {patient.mrn}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelDob")}</span>{" "}
                    {formatInOrgTimeZone(patient.dateOfBirth, "MMM d, yyyy", orgTz)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelGender")}</span> {patient.gender ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelNationalId")}</span> {dash(patient.nationalId)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelBloodGroup")}</span> {dash(patient.bloodGroup)}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("pages.patientRecord.sectionContact")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelPhone")}</span> {dash(patient.phone)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelEmail")}</span> {dash(patient.email)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">{t("pages.patientRecord.labelAddress")}</span>{" "}
                    {addressLine.length > 0 ? addressLine : "—"}
                  </p>
                  {(patient.nextOfKinName || patient.nextOfKinPhone) && (
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("pages.patientRecord.sectionNextOfKin")}
                      </p>
                      <p className="mt-1">
                        {dash(patient.nextOfKinName)}
                        {patient.nextOfKinRelation ? ` (${patient.nextOfKinRelation})` : ""}
                      </p>
                      <p>{dash(patient.nextOfKinPhone)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.chartGlance")}</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeActiveProblems", { count: activeProblems.length })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeResolvedProblems", { count: resolvedProblems.length })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeAllergies", { count: allergies.length })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeActiveMeds", { count: activeMeds.length })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeDiscontinuedMeds", { count: discontinuedMeds.length })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("pages.patientRecord.badgeCompletedVisits", { count: completedVisits.length })}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t("pages.patientRecord.chartGlanceHint")}</p>
              </CardContent>
            </Card>
          </TabsContent>
          ) : null}

          {vis.showVisits ? (
          <TabsContent value="visits" className="mt-0 space-y-4 focus-visible:outline-none">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <h3 className="text-sm font-semibold">{t("pages.patientRecord.previousVisits")}</h3>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : completedVisits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noCompletedVisits")}</p>
                  ) : (
                    <div className="space-y-2 max-h-[min(28rem,70vh)] overflow-auto pr-1">
                      {completedVisits.slice(0, 50).map((e) => {
                        const when = formatInOrgTimeZone(e.visitDate, "MMM d, yyyy · h:mm a", orgTz);
                        const clinicianName = clinicianNameById.get(e.clinicianId) ?? e.clinicianId ?? "—";
                        const active = selectedEncounterId === e.id;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            className={`w-full rounded-md border px-3 py-2 text-left hover:bg-accent transition-colors ${
                              active ? "border-primary/60 bg-accent" : "border-border"
                            }`}
                            onClick={() => setSelectedEncounterId(e.id)}
                            data-testid={`patient-record-visit-${e.id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{when}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {t("pages.patientRecord.visitStatusCompleted")}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground truncate" title={String(clinicianName)}>
                              {t("pages.patientRecord.clinicianLabel", { name: clinicianName })}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedEncounterId ? (
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => setSelectedEncounterId(null)}
                      >
                        {t("pages.patientRecord.clearSelection")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="lg:col-span-3 min-w-0">
                {selectedEncounterId ? (
                  isPreview ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <h3 className="text-sm font-semibold">{t("pages.patientRecord.visitDocumentation")}</h3>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        {t("pages.patientRecord.visitPreviewPlaceholder")}
                      </CardContent>
                    </Card>
                  ) : (
                  <VisitSummaryTab
                    encounterId={selectedEncounterId}
                    authToken={token}
                    prescriberNameById={prescriberNameById}
                    readOnly
                    visitSummaryUrl={
                      visitSummaryUrlForEncounter ? visitSummaryUrlForEncounter(selectedEncounterId) : undefined
                    }
                    orgTimeZone={orgTimeZoneProp}
                  />
                  )
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground text-sm">
                      {t("pages.patientRecord.selectVisitPrompt")}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
          ) : null}

          {vis.showProblems ? (
          <TabsContent value="problems" className="mt-0 space-y-6 focus-visible:outline-none">
            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.activeProblems")}</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {activeProblems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noActiveProblems")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.patientRecord.colProblem")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colStatus")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colStart")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colSymptoms")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProblems.map((pr) => (
                        <TableRow key={pr.id}>
                          <TableCell className="font-medium whitespace-normal">{pr.problem}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {dash(pr.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {pr.problemStartDate
                              ? formatInOrgTimeZone(pr.problemStartDate, "MMM d, yyyy", orgTz)
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                            {dash(pr.symptoms)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.resolvedProblems")}</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {resolvedProblems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noResolvedProblems")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.patientRecord.colProblem")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colStart")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colSymptoms")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colResolution")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resolvedProblems.map((pr) => (
                        <TableRow key={pr.id}>
                          <TableCell className="font-medium whitespace-normal">{pr.problem}</TableCell>
                          <TableCell>
                            {pr.problemStartDate
                              ? formatInOrgTimeZone(pr.problemStartDate, "MMM d, yyyy", orgTz)
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-sm whitespace-normal text-muted-foreground">
                            {dash(pr.symptoms)}
                          </TableCell>
                          <TableCell className="max-w-md whitespace-normal">{dash(pr.resolution)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          ) : null}

          {vis.showMedications ? (
          <TabsContent value="medications" className="mt-0 space-y-6 focus-visible:outline-none">
            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.activeMedications")}</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {activeMeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noActiveMedications")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.patientRecord.colMedication")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colDosage")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colFrequency")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colRoute")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colInstructions")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colStatus")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colPrescriber")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMeds.map((rx) => (
                        <TableRow key={rx.id}>
                          <TableCell className="font-medium">{rx.medicationName}</TableCell>
                          <TableCell>{dash(rx.dosage)}</TableCell>
                          <TableCell>{dash(rx.frequency)}</TableCell>
                          <TableCell>{dash(rx.route)}</TableCell>
                          <TableCell className="max-w-[14rem] whitespace-normal text-muted-foreground">
                            {dash(rx.instructions)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {String(rx.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{prescriberNameById.get(rx.prescribedBy) ?? rx.prescribedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.discontinuedMedications")}</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {discontinuedMeds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noDiscontinuedMedications")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.patientRecord.colMedication")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colDosage")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colFrequency")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colRoute")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colInstructions")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colPrescriber")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {discontinuedMeds.map((rx) => (
                        <TableRow key={rx.id}>
                          <TableCell className="font-medium">{rx.medicationName}</TableCell>
                          <TableCell>{dash(rx.dosage)}</TableCell>
                          <TableCell>{dash(rx.frequency)}</TableCell>
                          <TableCell>{dash(rx.route)}</TableCell>
                          <TableCell className="max-w-[14rem] whitespace-normal text-muted-foreground">
                            {dash(rx.instructions)}
                          </TableCell>
                          <TableCell>{prescriberNameById.get(rx.prescribedBy) ?? rx.prescribedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          ) : null}

          {vis.showAllergies ? (
          <TabsContent value="allergies" className="mt-0 focus-visible:outline-none">
            <Card>
              <CardHeader className="pb-2">
                <h3 className="text-sm font-semibold">{t("pages.patientRecord.allergiesTitle")}</h3>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {allergies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientRecord.noAllergies")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.patientRecord.colAllergen")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colSeverity")}</TableHead>
                        <TableHead>{t("pages.patientRecord.colReaction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allergies.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-normal">{a.allergen}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {String(a.severity)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xl whitespace-normal text-muted-foreground">
                            {dash(a.reactionType)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {patient.allergies && patient.allergies.trim().length > 0 ? (
                  <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t("pages.patientRecord.freeTextDemographics")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{patient.allergies}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
          ) : null}
        </SidebarTabsNavLayout>
      </Tabs>
    </div>
  );
}
