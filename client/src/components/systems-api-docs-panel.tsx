import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

function CodeLine({ children }: { children: string }) {
  return <code className="block font-mono text-xs bg-muted/40 border rounded-md px-3 py-2 overflow-x-auto">{children}</code>;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function SystemsApiDocsPanel() {
  return (
    <div className="space-y-4" data-testid="systems-api-panel">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Integration API (v1)</span>
            <Badge variant="secondary" className="font-normal">/api/v1</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This EMR exposes production-grade integration endpoints for third-party services (labs, pharmacies, billing vendors,
            schedulers, telehealth, insurance verification, patient apps).
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Authentication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">API key</span> (server-to-server):</p>
                <CodeLine>{"Authorization: Bearer ehr_live_<uuid>_<secret>"}</CodeLine>
                <p><span className="font-medium text-foreground">OAuth2</span> (client_credentials):</p>
                <CodeLine>{"POST /api/v1/oauth/token"}</CodeLine>
              </CardContent>
            </Card>
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Key patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">Idempotency</span> on writes:</p>
                <CodeLine>{"Idempotency-Key: <unique key per request>"}</CodeLine>
                <p><span className="font-medium text-foreground">Webhooks</span> are queued + retried.</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Core resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {[
              "Patients",
              "Providers",
              "Appointments",
              "Encounters",
              "Medications",
              "Allergies",
              "Problems",
              "Labs",
              "Vitals",
              "Notes",
              "Documents",
              "Billing/Invoices",
              "Facilities",
              "Users/Roles",
              "Audit logs",
              "Webhooks",
            ].map((x) => (
              <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>
            ))}
          </div>
          <p className="pt-1">
            Full endpoint list and examples live in <span className="font-mono text-xs text-foreground">docs/integration/README.md</span>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Common workflow examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">Create a patient</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(CURL_CREATE_PATIENT)}>
                <Copy className="w-4 h-4" /> Copy cURL
              </Button>
            </div>
            <CodeLine>{CURL_CREATE_PATIENT}</CodeLine>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">Register a webhook</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(CURL_REGISTER_WEBHOOK)}>
                <Copy className="w-4 h-4" /> Copy cURL
              </Button>
            </div>
            <CodeLine>{CURL_REGISTER_WEBHOOK}</CodeLine>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Implementation references</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="text-sm">
            Source files (for internal implementers):
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

