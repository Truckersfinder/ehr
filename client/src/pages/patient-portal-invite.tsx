import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PATIENT_PORTAL_TOKEN_STORAGE_KEY } from "@/lib/patient-portal-token";

export default function PatientPortalInvitePage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/portal/invite/:token");
  const token = params?.token ? decodeURIComponent(params.token) : "";
  const [, navigate] = useLocation();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  type InviteMeta = {
    firstName: string;
    facilityName: string;
    alreadyCompleted: boolean;
    message?: string;
  };

  const { data: meta, isLoading } = useQuery({
    queryKey: ["/api/patient-portal/invite", token],
    queryFn: async (): Promise<InviteMeta> => {
      const res = await fetch(`/api/patient-portal/invite/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || i18n.t("portal.invite.invalidLinkThrown"));
      }
      return (await res.json()) as InviteMeta;
    },
    enabled: !!token,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setError(t("portal.invite.errorPinFormat"));
      return;
    }
    if (pin !== confirm) {
      setError(t("portal.invite.errorPinMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/patient-portal/setup-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin, confirmPin: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || t("portal.invite.errorSavePin"));
        return;
      }
      if (data.token) {
        localStorage.setItem(PATIENT_PORTAL_TOKEN_STORAGE_KEY, data.token);
        navigate("/portal/record");
      }
    } catch {
      setError(t("portal.invite.errorNetwork"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">{t("portal.invite.invalidLink")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (meta?.alreadyCompleted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("portal.invite.alreadySetupTitle")}</CardTitle>
            <CardDescription>{meta.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/portal">{t("portal.invite.goToSignIn")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {meta?.firstName ? t("portal.invite.welcomeWithName", { name: meta.firstName }) : t("portal.invite.welcome")}
          </h1>
          <p className="text-sm text-muted-foreground">{meta?.facilityName}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("portal.invite.createPinTitle")}</CardTitle>
            <CardDescription>{t("portal.invite.createPinDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin1">{t("portal.invite.labelPin")}</Label>
                <Input
                  id="pin1"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin2">{t("portal.invite.labelConfirmPin")}</Label>
                <Input
                  id="pin2"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("portal.invite.saving") : t("portal.invite.continueToRecord")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
