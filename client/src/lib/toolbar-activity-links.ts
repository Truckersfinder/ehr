/** Stable toolbar activity ids → routes (secondary row, not module header nav). */

export function toolbarActivityHref(id: string): string {
  switch (id) {
    case "tb_systems_dashboard":
      return "/systems-dashboard";
    case "tb_administrative":
      return "/admin?section=administrative";
    case "tb_api":
      return "/systems-dashboard?tab=api";
    case "tb_application_config":
      return "/admin?section=application_config";
    case "tb_organization_config":
      return "/admin?section=organization";
    case "tb_patient_portal_config":
      return "/patient-portal-configuration";
    case "tb_user_management":
      return "/admin?section=users";
    case "tb_role_management":
      return "/admin?section=roles";
    case "tb_schedule":
      return "/schedule";
    case "tb_admin":
      return "/admin";
    case "tb_bed_management":
      return "/admin?tab=beds";
    case "tb_patient_call":
      return "/patient-call";
    case "tb_reception_appointments":
      return "/appointments";
    case "tb_laboratory":
      return "/laboratory";
    case "tb_uploads":
      return "/upload-results";
    case "tb_register_patient":
      return "/patients/register";
    default:
      return "/";
  }
}

export function toolbarActivityTestId(id: string): string {
  switch (id) {
    case "tb_systems_dashboard":
      return "toolbar-systems-dashboard";
    case "tb_administrative":
      return "toolbar-administrative";
    case "tb_application_config":
      return "toolbar-application-configuration";
    case "tb_organization_config":
      return "toolbar-organization-configuration";
    case "tb_patient_portal_config":
      return "toolbar-patient-portal-configuration";
    case "tb_user_management":
      return "toolbar-user-management";
    case "tb_role_management":
      return "toolbar-role-management";
    case "tb_schedule":
      return "toolbar-schedule";
    case "tb_admin":
      return "link-nav-admin";
    case "tb_bed_management":
      return "link-nav-bed-management";
    case "tb_patient_call":
      return "toolbar-patient-call";
    case "tb_reception_appointments":
      return "toolbar-appointments";
    case "tb_laboratory":
      return "toolbar-laboratory";
    case "tb_uploads":
      return "toolbar-upload-results";
    case "tb_register_patient":
      return "toolbar-register-new-patient";
    default:
      return `toolbar-${id}`;
  }
}
