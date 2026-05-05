import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, User, Shield, Eye, EyeOff } from "lucide-react";
import { ImaniMark } from "@/components/imani-mark";
import { Link, useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/patient-portal-branding";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.title = t("app.documentTitleEhr", { name: APP_PRODUCT_DISPLAY_NAME });
  }, [t]);

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
    <div
      className="flex min-h-[100dvh] flex-col bg-background md:flex-row"
      data-testid="login-page"
    >
      {/* Left half — brand green + subtle hex grid */}
      <div
        className="login-green-hex-pattern relative min-h-[min(280px,40vh)] w-full shrink-0 overflow-hidden md:min-h-screen md:w-1/2"
        aria-hidden
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_15%,rgba(212,168,71,0.12),transparent_55%),radial-gradient(ellipse_70%_50%_at_90%_85%,rgba(200,114,42,0.07),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <ImaniMark className="w-36 h-36 md:w-48 md:h-48 opacity-90 drop-shadow-md" alt="" />
        </div>
      </div>

      {/* Right half — login */}
      <div className="relative flex w-full flex-1 flex-col items-center justify-center px-6 py-10 md:w-1/2 md:py-12">
        <div className="absolute top-3 left-3 z-10">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground hover:bg-accent"
            asChild
          >
            <Link href="/">← Home</Link>
          </Button>
        </div>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#D6EDE5]/35 via-transparent to-[#F7E4D4]/25 dark:opacity-40" />

        <div className="relative mt-14 w-full max-w-md md:mt-0">
          <div className="mb-6 flex items-center justify-center gap-3">
            <ImaniMark className="h-14 w-14 md:h-16 md:w-16 shrink-0" alt="" />
            <div className="text-center">
              <h1 className="font-serif text-3xl font-semibold tracking-tight leading-tight text-[#0D3B2E]">
                {APP_PRODUCT_DISPLAY_NAME}
              </h1>
              <p className="text-sm text-muted-foreground">{t("auth.brandSubtitle")}</p>
            </div>
          </div>

          <Card className="border-[rgba(13,59,46,0.1)] bg-white/85 shadow-md backdrop-blur supports-[backdrop-filter]:bg-white/80">
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-11"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className={cn(
                      "pointer-events-auto absolute right-1.5 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-md border border-transparent",
                      "text-muted-foreground outline-none hover:bg-accent/90 hover:text-foreground",
                      "focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    data-testid="button-toggle-password-visibility"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="size-4 shrink-0" aria-hidden /> : <Eye className="size-4 shrink-0" aria-hidden />}
                  </button>
                </div>
              </div>
              <Button type="submit" data-testid="button-login" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.signingIn") : t("auth.signInButton")}
              </Button>
            </form>

            {import.meta.env.DEV ? (
              <div className="mt-6 border-t pt-6" data-testid="login-dev-hints">
                <p className="mb-2 text-xs text-muted-foreground">
                  Open the app at <span className="font-mono text-foreground">http://127.0.0.1:3000</span> after running{" "}
                  <span className="font-mono text-foreground">npm run dev</span> so sign-in can reach the API.
                </p>
                <p className="mb-3 text-xs text-muted-foreground">Demo accounts:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-accent/50 p-2">
                    <p className="font-medium">Admin</p>
                    <p className="text-muted-foreground">admin / admin123</p>
                  </div>
                  <div className="rounded-md bg-accent/50 p-2">
                    <p className="font-medium">Clinician</p>
                    <p className="text-muted-foreground">drwanjiku / doctor123</p>
                  </div>
                  <div className="rounded-md bg-accent/50 p-2">
                    <p className="font-medium">Nurse</p>
                    <p className="text-muted-foreground">nomondi / nurse123</p>
                  </div>
                  <div className="rounded-md bg-accent/50 p-2">
                    <p className="font-medium">Receptionist</p>
                    <p className="text-muted-foreground">reception / reception123</p>
                  </div>
                  <div className="col-span-2 rounded-md bg-accent/50 p-2">
                    <p className="font-medium">Security</p>
                    <p className="text-muted-foreground">Security123 / Security123</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Role-based access with audit-friendly workflows</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                <span>Secure sessions and protected patient data</span>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
