import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Search, Plus, Users, Phone, Heart, AlertTriangle, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { fr as frDateLocale } from "date-fns/locale/fr";
import { es as esDateLocale } from "date-fns/locale/es";
import type { Patient } from "@shared/schema";

export default function PatientsPage() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.list(search ? `?search=${search}` : ""),
    queryFn: () => {
      const url = search ? `/api/patients?search=${encodeURIComponent(search)}` : "/api/patients";
      return apiGetJson<Patient[]>(url, token);
    },
  });

  const getAge = (dob: string) => {
    const d = new Date(dob);
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  const dateLocale = useMemo(() => {
    const base = (i18n.language || "en").split("-")[0];
    if (base === "fr") return frDateLocale;
    if (base === "es") return esDateLocale;
    return enUS;
  }, [i18n.language]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="patients-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <SectionTitleWithHint hint={t("pages.patients.hint", { count: patients.length })}>
              {t("pages.patients.title")}
            </SectionTitleWithHint>
          </h1>
        </div>
        {user && user.role !== "reception" && (
          <Button data-testid="button-register-patient" asChild>
            <Link href="/patients/register">
              <a className="inline-flex items-center">
                <Plus className="w-4 h-4 mr-2" />
                {t("pages.patients.registerNew")}
              </a>
            </Link>
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-patients"
          placeholder={t("pages.patients.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-32" /></CardContent></Card>
          ))}
        </div>
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("pages.patients.noPatientsTitle")}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {search ? t("pages.patients.noPatientsHintSearch") : t("pages.patients.noPatientsHintEmpty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover-elevate"
              onClick={() => navigate(`/patients/${patient.id}?chartEntry=browse`)}
              data-testid={`card-patient-${patient.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold">{patient.firstName} {patient.lastName}</p>
                    <p className="text-xs text-muted-foreground">{patient.mrn}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : ""}
                  </Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3 h-3 flex-shrink-0" />
                    <span>
                      {format(new Date(patient.dateOfBirth), "d MMM yyyy", { locale: dateLocale })} (
                      {t("pages.patients.ageYears", { years: getAge(patient.dateOfBirth) })})
                    </span>
                  </div>
                  {patient.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span>{patient.phone}</span>
                    </div>
                  )}
                  {patient.bloodGroup && (
                    <div className="flex items-center gap-2">
                      <Heart className="w-3 h-3 flex-shrink-0" />
                      <span>{t("pages.patients.bloodGroup", { value: patient.bloodGroup })}</span>
                    </div>
                  )}
                  {patient.allergies && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-destructive flex-shrink-0" />
                      <span className="text-destructive truncate">{patient.allergies}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

