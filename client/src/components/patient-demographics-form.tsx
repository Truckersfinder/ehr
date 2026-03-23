import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountrySelect } from "@/components/country-select";
import type { Patient } from "@shared/schema";
import { readApiJsonOrThrow } from "@/lib/api-response";
import { normalizePatientRow } from "@/lib/patient-photo";

export type DemographicsDraft = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other";
  nationalId: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  bloodGroup: string;
  allergies: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelation: string;
  insuranceCarrier: string;
  insurancePolicyNumber: string;
  insuranceGroupNumber: string;
  billingGuarantorName: string;
  billingGuarantorPhone: string;
  billingGuarantorRelation: string;
  billingNotes: string;
};

export function patientToDemographicsDraft(p: Patient): DemographicsDraft {
  const dob =
    p.dateOfBirth == null
      ? ""
      : typeof p.dateOfBirth === "string"
        ? p.dateOfBirth.slice(0, 10)
        : String(p.dateOfBirth).slice(0, 10);
  return {
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    dateOfBirth: dob,
    gender: (p.gender as DemographicsDraft["gender"]) || "male",
    nationalId: p.nationalId ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    country: p.country ?? "KE",
    bloodGroup: p.bloodGroup ?? "",
    allergies: p.allergies ?? "",
    nextOfKinName: p.nextOfKinName ?? "",
    nextOfKinPhone: p.nextOfKinPhone ?? "",
    nextOfKinRelation: p.nextOfKinRelation ?? "",
    insuranceCarrier: p.insuranceCarrier ?? "",
    insurancePolicyNumber: p.insurancePolicyNumber ?? "",
    insuranceGroupNumber: p.insuranceGroupNumber ?? "",
    billingGuarantorName: p.billingGuarantorName ?? "",
    billingGuarantorPhone: p.billingGuarantorPhone ?? "",
    billingGuarantorRelation: p.billingGuarantorRelation ?? "",
    billingNotes: p.billingNotes ?? "",
  };
}

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

type Props = {
  patientId: string;
  patient: Patient;
};

export function PatientDemographicsForm({ patientId, patient }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<DemographicsDraft>(() => patientToDemographicsDraft(patient));
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(patientToDemographicsDraft(patient));
  }, [patient]);

  const set = (patch: Partial<DemographicsDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!String(draft.firstName).trim() || !String(draft.lastName).trim()) {
        throw new Error("First and last name are required");
      }
      if (!draft.dateOfBirth) {
        throw new Error("Date of birth is required");
      }
      const body: Record<string, unknown> = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        dateOfBirth: draft.dateOfBirth,
        gender: draft.gender,
        nationalId: draft.nationalId.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        address: draft.address.trim() || null,
        city: draft.city.trim() || null,
        country: draft.country || null,
        bloodGroup: draft.bloodGroup.trim() || null,
        allergies: draft.allergies.trim() || null,
        nextOfKinName: draft.nextOfKinName.trim() || null,
        nextOfKinPhone: draft.nextOfKinPhone.trim() || null,
        nextOfKinRelation: draft.nextOfKinRelation.trim() || null,
        insuranceCarrier: draft.insuranceCarrier.trim() || null,
        insurancePolicyNumber: draft.insurancePolicyNumber.trim() || null,
        insuranceGroupNumber: draft.insuranceGroupNumber.trim() || null,
        billingGuarantorName: draft.billingGuarantorName.trim() || null,
        billingGuarantorPhone: draft.billingGuarantorPhone.trim() || null,
        billingGuarantorRelation: draft.billingGuarantorRelation.trim() || null,
        billingNotes: draft.billingNotes.trim() || null,
      };
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Failed to save");
      }
      return normalizePatientRow(await res.json());
    },
    onSuccess: (saved) => {
      // Update cache directly; avoid invalidating ["/api/patients", id] (refetch can race and hide profile photo).
      queryClient.setQueryData<Patient>(["/api/patients", patientId], (prev) => {
        const next = { ...saved };
        if (next.profilePhotoUrl == null && prev?.profilePhotoUrl) {
          next.profilePhotoUrl = prev.profilePhotoUrl;
        }
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/patients", ""], exact: true });
      toast({ title: "Patient demographics saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/patients/${patientId}/profile-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await readApiJsonOrThrow<Patient>(res);
      return normalizePatientRow(data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Patient>(["/api/patients", patientId], (prev) => ({
        ...(prev ?? ({} as Patient)),
        ...updated,
        profilePhotoUrl: updated.profilePhotoUrl ?? prev?.profilePhotoUrl ?? null,
      }));
      toast({ title: "Profile photo updated" });
      if (photoInputRef.current) photoInputRef.current.value = "";
    },
    onError: (e: Error) => toast({ title: "Photo upload failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-8 max-w-3xl pb-16">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>First name *</Label>
            <Input value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name *</Label>
            <Input value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth *</Label>
            <Input type="date" value={draft.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender *</Label>
            <Select value={draft.gender} onValueChange={(v: DemographicsDraft["gender"]) => set({ gender: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>National ID / passport</Label>
            <Input value={draft.nationalId} onChange={(e) => set({ nationalId: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Blood group</Label>
            <Select
              value={draft.bloodGroup || "__none"}
              onValueChange={(v) => set({ bloodGroup: v === "__none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Not specified —</SelectItem>
                {BLOOD.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact & address</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Street address</Label>
            <Input value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City / town</Label>
              <Input value={draft.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <CountrySelect value={draft.country} onValueChange={(code) => set({ country: code })} />
            </div>
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Emergency contact</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={draft.nextOfKinName} onChange={(e) => set({ nextOfKinName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={draft.nextOfKinPhone} onChange={(e) => set({ nextOfKinPhone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input value={draft.nextOfKinRelation} onChange={(e) => set({ nextOfKinRelation: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Allergies (legacy text)</p>
          <Textarea
            value={draft.allergies}
            onChange={(e) => set({ allergies: e.target.value })}
            placeholder="Free-text allergies; structured allergies are managed in the chart Allergy tab."
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        <div className="border-t pt-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing & insurance</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Insurance / payer</Label>
              <Input value={draft.insuranceCarrier} onChange={(e) => set({ insuranceCarrier: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Policy / member #</Label>
              <Input
                value={draft.insurancePolicyNumber}
                onChange={(e) => set({ insurancePolicyNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Group / plan #</Label>
            <Input value={draft.insuranceGroupNumber} onChange={(e) => set({ insuranceGroupNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Guarantor name</Label>
              <Input value={draft.billingGuarantorName} onChange={(e) => set({ billingGuarantorName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Guarantor phone</Label>
              <Input value={draft.billingGuarantorPhone} onChange={(e) => set({ billingGuarantorPhone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Guarantor relationship</Label>
              <Input
                value={draft.billingGuarantorRelation}
                onChange={(e) => set({ billingGuarantorRelation: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Billing notes</Label>
            <Textarea
              value={draft.billingNotes}
              onChange={(e) => set({ billingNotes: e.target.value })}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <div className="border-t pt-6 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profile photo</p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            data-testid="demographics-page-profile-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhotoMutation.mutate(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploadPhotoMutation.isPending}
              onClick={() => photoInputRef.current?.click()}
            >
              {uploadPhotoMutation.isPending ? "Uploading…" : "Upload or replace photo"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="demographics-save">
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
