import { Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { PatientPortalSystemsSection } from "@/components/admin/patient-portal-systems-section";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";

/** Systems administrator — configure patient-facing portal sections and preview. */
export default function PatientPortalConfigurationPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();

  if (user && user.role !== "security") {
    return <Redirect to="/" />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="patient-portal-configuration-page">
      <h1 className="text-2xl font-bold tracking-tight">
        <SectionTitleWithHint hint={t("pages.patientPortalConfiguration.hint")}>
          {t("pages.patientPortalConfiguration.title")}
        </SectionTitleWithHint>
      </h1>
      <PatientPortalSystemsSection token={token} />
    </div>
  );
}
