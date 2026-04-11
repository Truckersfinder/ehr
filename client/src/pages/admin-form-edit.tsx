import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Building2, FileText, Shield, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import {
  ClinicalFormDefinitionCard,
  clinicalFieldsToCustomDraftRows,
  buildAdminFormBodyFromDraft,
  type DraftFormFieldRow,
} from "@/components/clinical-form-definition-card";
import { cn } from "@/lib/utils";
import { getClinicalTemplateKind } from "@/lib/clinical-form-template-kind";
import type { ClinicalForm } from "@shared/schema";

const sidebarLinkClass = cn(
  SIDEBAR_TABS_TRIGGER_CLASS,
  "text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors no-underline",
);

type AdminFormEditPageProps = {
  params?: { formId?: string };
};

export default function AdminFormEditPage({ params: paramsFromRoute }: AdminFormEditPageProps) {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const paramsFromCtx = useParams() as { formId?: string };
  const formId = (paramsFromRoute?.formId ?? paramsFromCtx.formId ?? "").trim();
  const { toast } = useToast();
  const canManageBeds = user?.role === "super_admin";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [draftFields, setDraftFields] = useState<DraftFormFieldRow[]>([]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== "security") {
      setLocation("/admin");
    }
  }, [user, isLoading, setLocation]);

  const canFetch = Boolean(formId && user?.role === "security");

  const {
    data: loaded,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/admin/forms", formId],
    queryFn: async () => {
      if (!formId) throw new Error("Missing form id");
      if (!token) throw new Error("Session expired — sign in again.");
      return apiGetJson<ClinicalForm>(`/api/admin/forms/${encodeURIComponent(formId)}`, token);
    },
    enabled: canFetch,
  });

  useEffect(() => {
    if (!loaded) return;
    setTitle(loaded.title ?? "");
    setDescription(loaded.description ?? "");
    setDraftFields(clinicalFieldsToCustomDraftRows(Array.isArray(loaded.fields) ? loaded.fields : []));
  }, [loaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!loaded) throw new Error("Nothing to save");
      const body = buildAdminFormBodyFromDraft(
        title,
        description,
        draftFields,
        getClinicalTemplateKind(loaded),
      );
      if (!token) throw new Error("Session expired — sign in again.");
      return apiPatchJson<ClinicalForm, typeof body>(
        `/api/admin/forms/${encodeURIComponent(formId)}`,
        body,
        token,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Forms & consent template updated" });
      setLocation("/admin?tab=forms");
    },
    onError: (e: Error) =>
      toast({ title: "Could not save template", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="admin-form-edit-loading">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <Skeleton className="h-64 w-full lg:w-60 shrink-0" />
          <Skeleton className="h-96 flex-1 w-full min-w-0" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "security") {
    return null;
  }

  const showInitialLoader = canFetch && !isError && !loaded && (isPending || isFetching);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full" data-testid="admin-form-edit-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <SectionTitleWithHint hint="System management and audit logs.">Administration</SectionTitleWithHint>
        </h1>
      </div>

      <SidebarTabsNavLayout
        sidebar={
          <nav className={SIDEBAR_TABS_LIST_CLASS} aria-label="Administration sections">
            <Link href="/admin?tab=users">
              <a className={sidebarLinkClass}>
                <Users className="w-3.5 h-3.5 shrink-0" /> Users
              </a>
            </Link>
            <Link href="/admin?tab=facilities">
              <a className={sidebarLinkClass}>
                <Building2 className="w-3.5 h-3.5 shrink-0" /> Facilities
              </a>
            </Link>
            {canManageBeds ? (
              <Link href="/admin?tab=beds">
                <a className={sidebarLinkClass}>
                  <Building2 className="w-3.5 h-3.5 shrink-0" /> Bed management
                </a>
              </Link>
            ) : null}
            <span
              className={cn(
                SIDEBAR_TABS_TRIGGER_CLASS,
                "bg-background text-foreground shadow-sm ring-1 ring-border cursor-default",
              )}
              aria-current="page"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" /> Forms & Consent · Edit template
            </span>
            <Link href="/admin?tab=audit">
              <a className={sidebarLinkClass}>
                <Shield className="w-3.5 h-3.5 shrink-0" /> Audit Log
              </a>
            </Link>
          </nav>
        }
      >
        <div className="space-y-6 min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
                aria-label="Back to Forms & Consent list"
                onClick={() => setLocation("/admin?tab=forms")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  <SectionTitleWithHint hint="Update fields and description. Changes apply wherever this template is listed.">
                    {!loaded
                      ? "Edit template"
                      : getClinicalTemplateKind(loaded) === "consent"
                        ? "Edit consent document"
                        : "Edit form"}
                  </SectionTitleWithHint>
                </h2>
              </div>
            </div>
          </div>

          {!formId ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitleWithHint hint="Open a template from Administration → Forms & Consent and choose Edit.">
                    Missing form
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
            </Card>
          ) : isError ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitleWithHint
                    hint={
                      error instanceof Error
                        ? error.message
                        : "Request failed. You may need Systems administrator access."
                    }
                  >
                    Could not load template
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setLocation("/admin?tab=forms")}>
                  Back to Forms & Consent
                </Button>
                <Button type="button" onClick={() => void refetch()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : showInitialLoader ? (
            <Skeleton className="h-[28rem] w-full" />
          ) : loaded ? (
            <ClinicalFormDefinitionCard
              templateKind={getClinicalTemplateKind(loaded)}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              draftFields={draftFields}
              setDraftFields={setDraftFields}
              titleId="clinical-form-edit-title"
              descriptionId="clinical-form-edit-description"
              footer={
                <>
                  <Button type="button" variant="secondary" onClick={() => setLocation("/admin?tab=forms")}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-submit-edit-form"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save template"}
                  </Button>
                </>
              }
            />
          ) : null}
        </div>
      </SidebarTabsNavLayout>
    </div>
  );
}
