import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Heart, Lock, User, Shield } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(username, password);
      toast({ title: "Welcome back", description: "You have been logged in successfully." });
    } catch (error: any) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative items-center justify-center p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="relative z-10 text-primary-foreground max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-md bg-primary-foreground/20 flex items-center justify-center">
              <Heart className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">OneHealthEHR</h1>
              <p className="text-primary-foreground/70 text-sm">Electronic Health Records</p>
            </div>
          </div>
          <p className="text-xl leading-relaxed text-primary-foreground/90 mb-8">
            A comprehensive, secure, and modern electronic health records system built for healthcare facilities across Africa.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Shield className="w-5 h-5 flex-shrink-0" />
              <span>Role-based access control with full audit logging</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Heart className="w-5 h-5 flex-shrink-0" />
              <span>Complete clinical workflow with SOAP notes and ICD-10</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Lock className="w-5 h-5 flex-shrink-0" />
              <span>Enterprise-grade security and multi-facility support</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center">
              <Heart className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">OneHealthEHR</h1>
              <p className="text-muted-foreground text-sm">Electronic Health Records</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="text-muted-foreground text-sm">Enter your credentials to access the system</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="username"
                      data-testid="input-username"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      data-testid="input-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  data-testid="button-login"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t">
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
                    <p className="font-medium">Reception</p>
                    <p className="text-muted-foreground">reception / reception123</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
