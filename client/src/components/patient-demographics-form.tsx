import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountrySelect } from "@/components/country-select";
import { StateSelect } from "@/components/state-select";
import { EmergencyContactRelationshipSelect } from "@/components/emergency-contact-relationship-select";
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
  state: string;
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
  portalEnabled: boolean;
  portalAccessEmail: string;
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
    state: p.state ?? "",
    // Do not preselect a country; user must choose explicitly in the form.
    country: "",
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
    portalEnabled: p.portalEnabled ?? false,
    portalAccessEmail: p.portalAccessEmail ?? "",
  };
}

type Props = {
  patientId: string;
  patient: Patient;
};

export function PatientDemographicsForm({ patientId, patient }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DemographicsDraft>(() => patientToDemographicsDraft(patient));
  const galleryPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setDraft(patientToDemographicsDraft(patient));
  }, [patient]);

  const set = (patch: Partial<DemographicsDraft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Same rule as server: portal email wins, else contact email. Shown so staff knows where Resend will deliver. */
  const portalInviteDestination = useMemo(() => {
    const p = draft.portalAccessEmail.trim();
    const c = draft.email.trim();
    return p || c || "";
  }, [draft.portalAccessEmail, draft.email]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!String(draft.firstName).trim() || !String(draft.lastName).trim()) {
        throw new Error(t("components.patientDemographicsForm.errFirstLastRequired"));
      }
      if (!draft.dateOfBirth) {
        throw new Error(t("components.patientDemographicsForm.errDobRequired"));
      }
      if (!String(draft.country).trim()) {
        throw new Error(t("components.patientDemographicsForm.errCountryRequired"));
      }
      if (!String(draft.state).trim()) {
        throw new Error(t("components.patientDemographicsForm.errStateRequired"));
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
        state: draft.state.trim() || null,
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
        portalEnabled: draft.portalEnabled,
        portalAccessEmail: draft.portalAccessEmail.trim() || null,
      };
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("components.patientDemographicsForm.errFailedToSave"));
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
      toast({ title: t("components.patientDemographicsForm.toastSaved") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (regenerateToken: boolean) => {
      const resolvedTo = draft.portalAccessEmail.trim() || draft.email.trim();
      if (!resolvedTo) {
        throw new Error(t("components.patientDemographicsForm.errInviteNeedsEmail"));
      }
      const portalPatch = {
        portalEnabled: draft.portalEnabled,
        portalAccessEmail: draft.portalAccessEmail.trim() || null,
        /** Ensures the address shown in “Contact email” is saved; invite uses portal OR contact email. */
        email: draft.email.trim() || null,
      };
      const patchRes = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(portalPatch),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("components.patientDemographicsForm.errFailedToSavePortal"));
      }
      const saved = normalizePatientRow(await patchRes.json());
      queryClient.setQueryData<Patient>(["/api/patients", patientId], (prev) => {
        const next = { ...saved };
        if (next.profilePhotoUrl == null && prev?.profilePhotoUrl) {
          next.profilePhotoUrl = prev.profilePhotoUrl;
        }
        return next;
      });

      const res = await fetch(`/api/patients/${patientId}/portal-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regenerateToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("components.patientDemographicsForm.errFailedToSend"));
      }
      return (await res.json()) as { ok?: boolean; sentTo?: string };
    },
    onSuccess: (data) => {
      const to = data?.sentTo;
      toast({
        title: t("components.patientDemographicsForm.toastInviteQueuedTitle"),
        description: [
          to ? t("components.patientDemographicsForm.toastInviteQueuedRecipient", { to }) : null,
          t("components.patientDemographicsForm.toastInviteQueuedHint"),
        ]
          .filter(Boolean)
          .join(" "),
      });
    },
    onError: (e: Error) =>
      toast({ title: t("components.patientDemographicsForm.toastCouldNotSendEmail"), description: e.message, variant: "destructive" }),
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
      toast({ title: t("components.patientDemographicsForm.toastProfilePhotoUpdated") });
      if (galleryPhotoInputRef.current) galleryPhotoInputRef.current.value = "";
      if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = "";
    },
    onError: (e: Error) =>
      toast({ title: t("components.patientDemographicsForm.toastPhotoUploadFailed"), description: e.message, variant: "destructive" }),
  });

  const canUseCamera = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!navigator.mediaDevices?.getUserMedia;
  }, []);

  async function stopCamera() {
    try {
      cameraStream?.getTracks().forEach((t) => t.stop());
    } finally {
      setCameraStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }

  async function startCamera(nextDeviceId?: string) {
    if (!canUseCamera) {
      setCameraError(t("components.patientDemographicsForm.errCameraNotSupported"));
      return;
    }
    setCameraError(null);
    await stopCamera();

    const constraints: MediaStreamConstraints = {
      video: nextDeviceId ? { deviceId: { exact: nextDeviceId } } : { facingMode: "user" },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(cams);
      if (!nextDeviceId) {
        const activeTrack = stream.getVideoTracks()[0];
        const settings = activeTrack?.getSettings?.();
        const activeId = settings?.deviceId;
        if (activeId) setCameraDeviceId(activeId);
      }
    } catch (e: any) {
      setCameraError(e?.message || t("components.patientDemographicsForm.errCameraAccessDenied"));
      await stopCamera();
    }
  }

  async function captureAndUpload() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (!w || !h) {
      toast({ title: t("components.patientDemographicsForm.toastCameraNotReadyTitle"), description: t("components.patientDemographicsForm.toastCameraNotReadyDesc"), variant: "destructive" });
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (!blob) {
      toast({ title: t("components.patientDemographicsForm.toastCaptureFailedTitle"), description: t("components.patientDemographicsForm.toastCaptureFailedDesc"), variant: "destructive" });
      return;
    }
    const file = new File([blob], `profile-photo-${patientId}.jpg`, { type: "image/jpeg" });
    uploadPhotoMutation.mutate(file, {
      onSuccess: () => {
        setCameraOpen(false);
      },
    });
  }

  useEffect(() => {
    if (!cameraOpen) {
      void stopCamera();
      setCameraError(null);
      return;
    }
    void startCamera(cameraDeviceId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  return (
    <div className="space-y-8 max-w-3xl pb-16">
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic details</p>
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
        </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
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
            <div
              className="space-y-1.5"
              onMouseDownCapture={() => {
                if (!draft.country) {
                  toast({
                    title: "Country required",
                    description: "Please select a country first.",
                    variant: "destructive",
                  });
                }
              }}
            >
              <Label>State / province / region *</Label>
              <StateSelect
                countryCode={draft.country}
                value={draft.state}
                onValueChange={(state) => set({ state })}
                data-testid="demographics-select-state"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Country *</Label>
            <CountrySelect value={draft.country} onValueChange={(code) => set({ country: code, state: "" })} />
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
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
              <EmergencyContactRelationshipSelect
                value={draft.nextOfKinRelation}
                onValueChange={(v) => set({ nextOfKinRelation: v })}
                data-testid="demographics-select-next-of-kin-relationship"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
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
              <Select
                value={draft.billingGuarantorRelation || "__none"}
                onValueChange={(v) => set({ billingGuarantorRelation: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Not specified —</SelectItem>
                  <SelectItem value="Self">Self</SelectItem>
                  <SelectItem value="Parent">Parent</SelectItem>
                  <SelectItem value="Employer">Employer</SelectItem>
                </SelectContent>
              </Select>
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

        {patient.isActive ? (
          <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient portal access</p>
            <p className="text-sm text-muted-foreground">
              Read-only online access to their record. The patient receives an email from the hospital with a secure link
              and QR code, then creates a PIN.
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="demo-portal-enabled"
                checked={draft.portalEnabled}
                onCheckedChange={(v) => set({ portalEnabled: v === true })}
              />
              <div className="space-y-1">
                <Label htmlFor="demo-portal-enabled" className="font-medium cursor-pointer">
                  Enable patient portal for this patient
                </Label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Portal email (optional)</Label>
              <Input
                type="email"
                placeholder="Uses Contact email if empty"
                value={draft.portalAccessEmail}
                onChange={(e) => set({ portalAccessEmail: e.target.value })}
              />
            </div>
            <p className="text-xs rounded-md border border-border/60 bg-background/80 px-2.5 py-2 text-foreground/90">
              {portalInviteDestination ? (
                <>
                  <span className="font-medium text-foreground">Invitation will be sent to: </span>
                  <span className="font-mono">{portalInviteDestination}</span>
                  <span className="text-muted-foreground"> (portal email if set, otherwise contact email)</span>
                </>
              ) : (
                <span className="text-destructive">Add a contact email or portal email — nothing is on file to send to.</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {patient.portalPinHash
                ? "Patient has completed portal setup (PIN created)."
                : patient.portalInviteSentAt
                  ? "An invitation email was sent previously. Sending again will email the current portal/contact address."
                  : "Sending an invitation saves portal settings above, then emails the patient a secure link."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={inviteMutation.isPending || !draft.portalEnabled || !portalInviteDestination}
                onClick={() => inviteMutation.mutate(false)}
              >
                Send invitation
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={inviteMutation.isPending || !draft.portalEnabled || !portalInviteDestination}
                onClick={() => inviteMutation.mutate(true)}
              >
                Resend (new link)
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profile photo</p>
          <input
            ref={galleryPhotoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            data-testid="demographics-page-profile-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhotoMutation.mutate(f);
            }}
          />
          {/* Fallback input for mobile browsers that support capture; desktop often ignores this. */}
          <input ref={cameraPhotoInputRef} type="file" accept="image/*" capture="user" className="hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploadPhotoMutation.isPending}
                  data-testid="demographics-page-profile-photo-trigger"
                >
                  {uploadPhotoMutation.isPending ? "Uploading…" : "Upload or replace photo"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    if (canUseCamera) setCameraOpen(true);
                    else cameraPhotoInputRef.current?.click();
                  }}
                >
                  Take picture
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => galleryPhotoInputRef.current?.click()}>
                  Upload photo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Take picture</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {cameraDevices.length > 1 && (
              <div className="space-y-2">
                <Label>Camera</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={cameraDeviceId}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setCameraDeviceId(next);
                    await startCamera(next);
                  }}
                >
                  {cameraDevices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 overflow-hidden">
              <div className="aspect-video w-full bg-black/90 flex items-center justify-center">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {cameraError && (
              <p className="text-sm text-destructive">
                {cameraError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCameraOpen(false)}
                disabled={uploadPhotoMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={captureAndUpload}
                disabled={uploadPhotoMutation.isPending || !!cameraError || !cameraStream}
                data-testid="demographics-page-profile-photo-capture"
              >
                {uploadPhotoMutation.isPending ? "Uploading…" : "Capture & upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="demographics-save">
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
