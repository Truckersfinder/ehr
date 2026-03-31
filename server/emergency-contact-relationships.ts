import type { EmergencyContactRelationshipOption } from "@shared/emergency-contact-relationships";

const RELATIONSHIPS: EmergencyContactRelationshipOption[] = [
  { value: "Spouse", label: "Spouse" },
  { value: "Parent", label: "Parent" },
  { value: "Child", label: "Child" },
  { value: "Sibling", label: "Sibling" },
  { value: "Grandparent", label: "Grandparent" },
  { value: "Grandchild", label: "Grandchild" },
  { value: "Aunt/Uncle", label: "Aunt/Uncle" },
  { value: "Cousin", label: "Cousin" },
  { value: "Guardian", label: "Guardian" },
  { value: "Partner", label: "Partner" },
  { value: "Friend", label: "Friend" },
  { value: "Neighbor", label: "Neighbor" },
  { value: "Caregiver", label: "Caregiver" },
  { value: "Other", label: "Other" },
];

export function getEmergencyContactRelationships(): EmergencyContactRelationshipOption[] {
  return RELATIONSHIPS;
}

