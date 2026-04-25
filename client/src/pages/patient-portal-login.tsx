import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PATIENT_PORTAL_TOKEN_STORAGE_KEY } from "@/lib/patient-portal-token";
import { publicOrganizationNameFallback, usePatientPortalBranding } from "@/lib/patient-portal-branding";

export default function PatientPortalLoginPage() {
  const { t } = useTranslation();
  const { data: branding } = usePatientPortalBranding();
  const organizationName = branding?.organizationName ?? publicOrganizationNameFallback();

  useEffect(() => {
    document.title = t("portal.login.documentTitle", { org: organizationName });
  }, [organizationName, t]);
  const [, navigate] = useLocation();
  const [mrn, setMrn] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pin.trim() || pin.length < 4) {
      setError(t("portal.login.errorPinLength"));
      return;
    }
    if (!mrn.trim() && !email.trim()) {
      setError(t("portal.login.errorMrnOrEmail"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/patient-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mrn: mrn.trim() || undefined,
          email: email.trim() || undefined,
          pin: pin.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || t("portal.login.errorSignInFailed"));
        return;
      }
      if (data.token) {
        localStorage.setItem(PATIENT_PORTAL_TOKEN_STORAGE_KEY, data.token);
        navigate("/portal/record");
      }
    } catch {
      setError(t("portal.login.errorNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("portal.login.heading")}</h1>
          <p className="text-sm text-muted-foreground">{organizationName}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("portal.login.cardTitle")}</CardTitle>
            <CardDescription>{t("portal.login.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-mrn">{t("portal.login.labelMrn")}</Label>
                <Input
                  id="portal-mrn"
                  autoComplete="username"
                  value={mrn}
                  onChange={(e) => setMrn(e.target.value)}
                  placeholder={t("portal.login.placeholderMrn")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-email">{t("portal.login.labelEmail")}</Label>
                <Input
                  id="portal-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("portal.login.placeholderEmail")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-pin">{t("portal.login.labelPin")}</Label>
                <Input
                  id="portal-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("portal.login.placeholderPin")}
                  required
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("portal.login.signingIn") : t("portal.login.continue")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/">
            <a className="underline underline-offset-2">{t("portal.login.staffLoginLink")}</a>
          </Link>
        </p>
      </div>
    </div>
  );
}
