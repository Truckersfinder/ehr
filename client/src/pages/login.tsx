import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Heart, Lock, User, Shield } from "lucide-react";
import { MutedIconBox } from "@/components/muted-icon-box";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { publicOrganizationNameFallback, usePatientPortalBranding } from "@/lib/patient-portal-branding";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { data: branding } = usePatientPortalBranding();
  const publicOrgName = branding?.organizationName ?? publicOrganizationNameFallback();

  useEffect(() => {
    document.title = t("app.documentTitleEhr", { name: publicOrgName });
  }, [publicOrgName, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const loggedInUser = await login(username, password);
      if (loggedInUser.role === "clinician" || loggedInUser.role === "nurse") {
        setLocation("/schedule");
      } else if (loggedInUser.role === "reception") {
        setLocation("/appointments");
      } else if (loggedInUser.role === "security") {
        setLocation("/systems-dashboard");
      } else {
        setLocation("/");
      }
      toast({ title: t("auth.welcomeBack"), description: t("auth.loggedInSuccess") });
    } catch (error: any) {
      toast({ title: t("auth.loginFailed"), description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 py-10" data-testid="login-page">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 sm:gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-primary/10" />
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <MutedIconBox icon={Heart} size="lg" className="shadow-sm" />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">{publicOrgName}</h1>
            <p className="text-muted-foreground text-sm">{t("auth.brandSubtitle")}</p>
          </div>
        </div>

        <Card className="bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <CardHeader className="pb-4">
            <h2 className="text-2xl font-semibold tracking-tight">{t("auth.signIn")}</h2>
            <p className="text-muted-foreground text-sm">{t("auth.signInDescription")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t("auth.username")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    data-testid="input-username"
                    placeholder={t("auth.usernamePlaceholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    data-testid="input-password"
                    type="password"
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" data-testid="button-login" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.signingIn") : t("auth.signInButton")}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Open the app at <span className="font-mono text-foreground">http://127.0.0.1:3000</span> after running{" "}
                <span className="font-mono text-foreground">npm run dev</span> so sign-in can reach the API.
              </p>
              <p className="text-xs text-muted-foreground mb-3">Demo accounts:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-md bg-accent/50">
                  <p className="font-medium">Admin</p>
                  <p className="text-muted-foreground">admin / admin123</p>
                </div>
                <div className="p-2 rounded-md bg-accent/50">
                  <p className="font-medium">Clinician</p>
                  <p className="text-muted-foreground">drwanjiku / doctor123</p>
                </div>
                <div className="p-2 rounded-md bg-accent/50">
                  <p className="font-medium">Nurse</p>
                  <p className="text-muted-foreground">nomondi / nurse123</p>
                </div>
                <div className="p-2 rounded-md bg-accent/50">
                  <p className="font-medium">Receptionist</p>
                  <p className="text-muted-foreground">reception / reception123</p>
                </div>
                <div className="p-2 rounded-md bg-accent/50 col-span-2">
                  <p className="font-medium">Security</p>
                  <p className="text-muted-foreground">Security123 / Security123</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Role-based access with audit-friendly workflows</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>Secure sessions and protected patient data</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
