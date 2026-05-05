import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { USER_ROLE_LABELS } from "@/lib/user-role-labels";

type CapDef = { id: string; label: string; category: string };

type CapMatrixResponse = {
  definitions: CapDef[];
  roles: string[];
  matrix: Record<string, Record<string, boolean>>;
};

export function RoleManagementPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/role-capabilities"],
    queryFn: () => apiGetJson<CapMatrixResponse>("/api/admin/role-capabilities", token!),
    enabled: !!token,
  });

  const patchCap = useMutation({
    mutationFn: (body: { role: string; capabilityId: string; allowed: boolean }) =>
      apiPatchJson<{ ok: boolean }, typeof body>("/api/admin/role-capabilities", body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/role-capabilities"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/application-config"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (e: Error) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const grouped = useMemo(() => {
    const defs = data?.definitions ?? [];
    const byCat = new Map<string, CapDef[]>();
    for (const d of defs) {
      const list = byCat.get(d.category) ?? [];
      list.push(d);
      byCat.set(d.category, list);
    }
    return byCat;
  }, [data?.definitions]);

  const roleLabel = (r: string) => (USER_ROLE_LABELS as Record<string, string>)[r] ?? r;

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading role capabilities…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          <SectionTitleWithHint hint="Grant navigation, clinical activities, and admin sections per role. Changes apply on next sign-in or refresh.">
            Role management
          </SectionTitleWithHint>
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <SectionTitleWithHint hint="Toggle access for each role. Unchecked removes access even if it was a default. The same rules drive Application configuration → Activities & navigation (Hide) for that role.">
              Role-based capabilities
            </SectionTitleWithHint>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full border rounded-md">
            <div className="min-w-[720px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="sticky left-0 z-10 min-w-[220px] bg-muted/40 py-2 pl-2 pr-4 text-left font-medium">
                      Capability
                    </th>
                    {data.roles.map((r) => (
                      <th
                        key={r}
                        className="min-w-[100px] whitespace-nowrap py-2 pl-2 pr-4 text-center font-medium last:pr-6"
                      >
                        {roleLabel(r)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(grouped.entries()).map(([group, defs]) => (
                    <Fragment key={group}>
                      <tr className="bg-muted/20">
                        <td
                          colSpan={data.roles.length + 1}
                          className="px-3 py-2 pr-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {group}
                        </td>
                      </tr>
                      {defs.map((def) => (
                        <tr key={def.id} className="border-b border-border/60">
                          <td className="sticky left-0 z-10 bg-background py-2 pl-3 pr-4 align-top">
                            <span className="font-medium">{def.label}</span>
                            <p className="text-[11px] text-muted-foreground font-mono">{def.id}</p>
                          </td>
                          {data.roles.map((r, roleIdx) => {
                            const allowed = data.matrix[r]?.[def.id] ?? false;
                            const isLastRole = roleIdx === data.roles.length - 1;
                            return (
                              <td
                                key={r}
                                className={cn(
                                  "py-2 pl-2 text-center align-middle",
                                  isLastRole ? "pr-6" : "pr-4",
                                )}
                              >
                                <Checkbox
                                  checked={allowed}
                                  disabled={patchCap.isPending}
                                  onCheckedChange={(c) => {
                                    patchCap.mutate({ role: r, capabilityId: def.id, allowed: c === true });
                                  }}
                                  aria-label={`${r} ${def.label}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
