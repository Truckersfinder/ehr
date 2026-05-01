import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

function CodeLine({ children }: { children: string }) {
  return <code className="block font-mono text-xs bg-muted/40 border rounded-md px-3 py-2 overflow-x-auto">{children}</code>;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function SystemsApiDocsPanel() {
  const { t } = useTranslation();
  const coreResourcesRaw = t("pages.systemsApi.coreResources", { returnObjects: true });
  const coreResources: string[] = Array.isArray(coreResourcesRaw)
    ? (coreResourcesRaw.filter((x) => typeof x === "string") as string[])
    : [];
  return (
    <div className="space-y-4" data-testid="systems-api-panel">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>{t("pages.systemsApi.title")}</span>
            <Badge variant="secondary" className="font-normal">/api/v1</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t("pages.systemsApi.subtitle")}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("pages.systemsApi.authTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">{t("pages.systemsApi.apiKeyLabel")}</span> {t("pages.systemsApi.apiKeyHint")}</p>
                <CodeLine>{"Authorization: Bearer ehr_live_<uuid>_<secret>"}</CodeLine>
                <p><span className="font-medium text-foreground">{t("pages.systemsApi.oauthLabel")}</span> {t("pages.systemsApi.oauthHint")}</p>
                <CodeLine>{"POST /api/v1/oauth/token"}</CodeLine>
              </CardContent>
            </Card>
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("pages.systemsApi.patternsTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">{t("pages.systemsApi.idempotencyLabel")}</span> {t("pages.systemsApi.idempotencyHint")}</p>
                <CodeLine>{"Idempotency-Key: <unique key per request>"}</CodeLine>
                <p><span className="font-medium text-foreground">{t("pages.systemsApi.webhooksLabel")}</span> {t("pages.systemsApi.webhooksHint")}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("pages.systemsApi.coreResourcesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {coreResources.map((x: string) => (
              <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>
            ))}
          </div>
          <p className="pt-1">
            {t("pages.systemsApi.fullDocsBefore")}{" "}
            <span className="font-mono text-xs text-foreground">docs/integration/README.md</span>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("pages.systemsApi.workflowsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{t("pages.systemsApi.workflowCreatePatient")}</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(CURL_CREATE_PATIENT)}>
                <Copy className="w-4 h-4" /> {t("pages.systemsApi.copyCurl")}
              </Button>
            </div>
            <CodeLine>{CURL_CREATE_PATIENT}</CodeLine>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{t("pages.systemsApi.workflowRegisterWebhook")}</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(CURL_REGISTER_WEBHOOK)}>
                <Copy className="w-4 h-4" /> {t("pages.systemsApi.copyCurl")}
              </Button>
            </div>
            <CodeLine>{CURL_REGISTER_WEBHOOK}</CodeLine>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("pages.systemsApi.implementationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="text-sm">
            {t("pages.systemsApi.implementationSubtitle")}
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li><span className="font-mono text-xs text-foreground">server/integration/v1-routes.ts</span> (REST handlers)</li>
            <li><span className="font-mono text-xs text-foreground">server/integration/middleware.ts</span> (auth, scopes, idempotency, rate limit)</li>
            <li><span className="font-mono text-xs text-foreground">server/integration/webhook-worker.ts</span> (durable retries)</li>
            <li><span className="font-mono text-xs text-foreground">docs/integration/openapi.yaml</span> (OpenAPI)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

const CURL_CREATE_PATIENT =
  "curl -sS -X POST \"$BASE/api/v1/patients\" -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" -d '{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"dateOfBirth\":\"1815-12-10\",\"gender\":\"female\",\"mrn\":\"TEST-001\"}'";

const CURL_REGISTER_WEBHOOK =
  "curl -sS -X POST \"$BASE/api/v1/webhooks\" -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" -d '{\"url\":\"https://partner.example.com/hooks/ehr\",\"eventTypes\":[\"appointment.created\",\"patient.created\"]}'";

