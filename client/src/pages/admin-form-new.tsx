import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, Building2, FileText, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiPostJson } from "@/lib/api-client";
import {
  ClinicalFormDefinitionCard,
  buildAdminFormBodyFromDraft,
  type DraftFormFieldRow,
} from "@/components/clinical-form-definition-card";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { cn } from "@/lib/utils";
import type { ClinicalForm, ClinicalFormTemplateKind } from "@shared/schema";

function canAccessClinicalFormBuilder(role: string | undefined): boolean {
  return role === "security" || role === "super_admin";
}

const sidebarLinkClass = cn(
  SIDEBAR_TABS_TRIGGER_CLASS,
  "text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors no-underline",
);

export default function AdminFormNewPage() {
  const { user, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const canManageBeds = user?.role === "super_admin";

  const templateKind = useMemo((): ClinicalFormTemplateKind | null => {
    const v = new URLSearchParams(search).get("kind");
    if (v === "form" || v === "consent") return v;
    return null;
  }, [search]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [draftFields, setDraftFields] = useState<DraftFormFieldRow[]>([]);

  useEffect(() => {
    if (isLoading) return;
    if (user && !canAccessClinicalFormBuilder(user.role)) {
      setLocation("/admin");
    }
  }, [user, isLoading, setLocation]);

  useEffect(() => {
    if (isLoading || !user || !canAccessClinicalFormBuilder(user.role)) return;
    if (templateKind === null) {
      setLocation("/admin?tab=forms");
    }
  }, [isLoading, user, templateKind, setLocation]);

  const resetDraft = () => {
    setTitle("");
    setDescription("");
    setDraftFields([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!templateKind) throw new Error("Missing template kind");
      const body = buildAdminFormBodyFromDraft(title, description, draftFields, templateKind);
      return apiPostJson<ClinicalForm, typeof body>("/api/admin/forms", body, token);
    },
    onSuccess: () => {
      resetDraft();
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/clinical-form-templates"] });
      toast({
        title: templateKind === "consent" ? "Consent template created" : "Form template created",
        description: "The template is saved under Administration → Forms & Consent.",
      });
      setLocation("/admin?tab=forms");
    },
    onError: (e: Error) =>
      toast({ title: "Could not create template", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="admin-form-new-loading">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <Skeleton className="h-64 w-full lg:w-60 shrink-0" />
          <Skeleton className="h-96 flex-1 w-full min-w-0" />
        </div>
      </div>
    );
  }

  if (!user || !canAccessClinicalFormBuilder(user.role) || templateKind === null) {
    return null;
  }

  const pageTitle = templateKind === "consent" ? "Create consent document" : "Create form";
  const sidebarLabel =
    templateKind === "consent" ? "Forms & Consent · New consent" : "Forms & Consent · New form";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full" data-testid="admin-form-new-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground text-sm mt-1">System management and audit logs</p>
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
              <FileText className="w-3.5 h-3.5 shrink-0" /> {sidebarLabel}
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
                <h2 className="text-lg font-semibold tracking-tight">{pageTitle}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Add a title, optional description, and any additional fields. Patient MRN, name, and date of birth are
                  included automatically. For dropdowns, use comma-separated options.
                </p>
              </div>
            </div>
          </div>

          <ClinicalFormDefinitionCard
            templateKind={templateKind}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            draftFields={draftFields}
            setDraftFields={setDraftFields}
            footer={
              <>
                <Button type="button" variant="secondary" onClick={() => setLocation("/admin?tab=forms")}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  data-testid="button-submit-create-form"
                >
                  {createMutation.isPending ? "Saving…" : "Create"}
                </Button>
              </>
            }
          />
        </div>
      </SidebarTabsNavLayout>
    </div>
  );
}
