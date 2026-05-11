import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useOrganizationSettings } from "@/lib/organization-settings";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { CountrySelect } from "@/components/country-select";
import { StateSelect } from "@/components/state-select";
import { EmergencyContactRelationshipSelect } from "@/components/emergency-contact-relationship-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Camera, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Patient, User as UserType } from "@shared/schema";
import { readApiJsonOrThrow } from "@/lib/api-response";
import { normalizePatientRow } from "@/lib/patient-photo";

const emptyForm = () => ({
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "male" as "male" | "female" | "other",
  nationalId: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  country: "",
  bloodGroup: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  nextOfKinRelation: "",
  primaryProviderId: "",
  insuranceCarrier: "",
  insurancePolicyNumber: "",
  insuranceGroupNumber: "",
  billingGuarantorName: "",
  billingGuarantorPhone: "",
  billingGuarantorRelation: "",
  billingNotes: "",
  portalEnabled: false,
  portalAccessEmail: "",
});

export default function RegisterPatientPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { patientIdentifierLabel, defaultCountry } = useOrganizationSettings();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState(emptyForm);
  const countryDefaultAppliedRef = useRef(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
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
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    const dc = defaultCountry.trim();
    if (!countryDefaultAppliedRef.current && dc) {
      countryDefaultAppliedRef.current = true;
      setFormData((prev) => (prev.country ? prev : { ...prev, country: dc }));
    }
  }, [defaultCountry]);

  const clearProfilePhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setProfilePhotoFile(null);
    if (galleryPhotoInputRef.current) galleryPhotoInputRef.current.value = "";
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = "";
  };

  const onProfilePhotoPick = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("pages.registerPatient.errFileLargeTitle"),
        description: t("pages.registerPatient.errFileLargeDesc"),
        variant: "destructive",
      });
      return;
    }
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setProfilePhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const backHref = useMemo(
    () => (user?.role === "reception" ? "/appointments" : "/patients"),
    [user?.role]
  );
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
      setCameraError(t("pages.registerPatient.errCameraUnsupported"));
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
        const activeId = activeTrack?.getSettings?.().deviceId;
        if (activeId) setCameraDeviceId(activeId);
      }
    } catch (e: any) {
      setCameraError(e?.message || t("pages.registerPatient.errCameraAccess"));
      await stopCamera();
    }
  }

  async function capturePhotoFromCamera() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (!w || !h) {
      toast({
        title: t("pages.registerPatient.errCameraNotReadyTitle"),
        description: t("pages.registerPatient.errCameraNotReadyDesc"),
        variant: "destructive",
      });
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
      toast({
        title: t("pages.registerPatient.errCaptureTitle"),
        description: t("pages.registerPatient.errCaptureDesc"),
        variant: "destructive",
      });
      return;
    }
    const capturedFile = new File([blob], `new-patient-profile-${Date.now()}.jpg`, { type: "image/jpeg" });
    onProfilePhotoPick(capturedFile);
    setCameraOpen(false);
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

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t("pages.registerPatient.errUsersLoad"));
      return res.json();
    },
    enabled: !!token && !!user,
  });

  const clinicians = users.filter((u) => u.role === "clinician");

  const createMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyForm>) => {
      const mrn = `MRN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      // Explicit fields only — never spread the whole form (avoids stray keys / legacy `allergies` leaking into the API).
      const payload = {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        mrn,
        isActive: true as const,
        facilityId: user?.facilityId ?? undefined,
        country: data.country,
        primaryProviderId: data.primaryProviderId || undefined,
        nationalId: data.nationalId || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        address: data.address || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        bloodGroup: data.bloodGroup || undefined,
        nextOfKinName: data.nextOfKinName || undefined,
        nextOfKinPhone: data.nextOfKinPhone || undefined,
        nextOfKinRelation: data.nextOfKinRelation || undefined,
        insuranceCarrier: data.insuranceCarrier || undefined,
        insurancePolicyNumber: data.insurancePolicyNumber || undefined,
        insuranceGroupNumber: data.insuranceGroupNumber || undefined,
        billingGuarantorName: data.billingGuarantorName || undefined,
        billingGuarantorPhone: data.billingGuarantorPhone || undefined,
        billingGuarantorRelation: data.billingGuarantorRelation || undefined,
        billingNotes: data.billingNotes || undefined,
        portalEnabled: data.portalEnabled,
        portalAccessEmail: data.portalAccessEmail.trim() || undefined,
      };
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t("pages.registerPatient.errRegisterPatient"));
      }
      return (await res.json()) as { id: string };
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!String(formData.country).trim()) {
        toast({
          title: t("pages.registerPatient.toastCountryTitle"),
          description: t("pages.registerPatient.toastCountryDesc"),
          variant: "destructive",
        });
        return;
      }
      if (!String(formData.state).trim()) {
        toast({
          title: t("pages.registerPatient.toastStateTitle"),
          description: t("pages.registerPatient.toastStateDesc"),
          variant: "destructive",
        });
        return;
      }
      if (
        formData.portalEnabled &&
        !String(formData.portalAccessEmail).trim() &&
        !String(formData.email).trim()
      ) {
        toast({
          title: t("pages.registerPatient.toastPortalEmailTitle"),
          description: t("pages.registerPatient.toastPortalEmailDesc"),
          variant: "destructive",
        });
        return;
      }
      const created = await createMutation.mutateAsync(formData);
      let photoNote: string | null = null;
      if (profilePhotoFile && token) {
        const fd = new FormData();
        fd.append("photo", profilePhotoFile);
        const up = await fetch(`/api/patients/${created.id}/profile-photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        try {
          const updated = normalizePatientRow(await readApiJsonOrThrow<Patient>(up));
          queryClient.setQueryData<Patient>(["/api/patients", created.id], updated);
        } catch (e) {
          photoNote = e instanceof Error ? e.message : t("pages.registerPatient.errPhotoUpload");
        }
      }
      // Refresh list cache only (do not invalidate ["/api/patients", id] — would refetch and race with photo setQueryData).
      void queryClient.invalidateQueries({ queryKey: ["/api/patients", ""], exact: true });
      if (photoNote) {
        toast({
          title: t("pages.registerPatient.toastRegisteredTitle"),
          description: t("pages.registerPatient.toastRegisteredPhotoWarn", { note: photoNote ?? "" }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("pages.registerPatient.toastRegisteredTitle"),
          description: profilePhotoFile
            ? t("pages.registerPatient.toastRegisteredWithPhoto")
            : t("pages.registerPatient.toastRegisteredNoPhoto"),
        });
      }
      clearProfilePhoto();
      setFormData(emptyForm());
      if (user?.role === "reception") {
        navigate("/appointments");
      } else {
        navigate(`/patients/${created.id}?chartEntry=browse`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("pages.registerPatient.errRegisterPatient");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  if (!user) {
    return null;
  }

  const set = (patch: Partial<typeof formData>) => setFormData((f) => ({ ...f, ...patch }));

  return (
    <div className="p-6 pb-16 max-w-4xl mx-auto space-y-6" data-testid="register-patient-page">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <a className="inline-flex items-center gap-2" data-testid="register-patient-back">
              <ArrowLeft className="w-4 h-4" />
              {user.role === "reception"
                ? t("pages.registerPatient.backToAppointments")
                : t("pages.registerPatient.backToPatients")}
            </a>
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <SectionTitleWithHint
            hint={t("pages.registerPatient.pageHint", { label: patientIdentifierLabel })}
          >
            {t("pages.registerPatient.title")}
          </SectionTitleWithHint>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitleWithHint hint={t("pages.registerPatient.identityHint")}>
                {t("pages.registerPatient.identityTitle")}
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelFirstName")}</Label>
                <Input
                  required
                  value={formData.firstName}
                  onChange={(e) => set({ firstName: e.target.value })}
                  data-testid="reg-input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelLastName")}</Label>
                <Input
                  required
                  value={formData.lastName}
                  onChange={(e) => set({ lastName: e.target.value })}
                  data-testid="reg-input-last-name"
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelDob")}</Label>
                <Input
                  required
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => set({ dateOfBirth: e.target.value })}
                  data-testid="reg-input-dob"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelGender")}</Label>
                <Select value={formData.gender} onValueChange={(v: "male" | "female" | "other") => set({ gender: v })}>
                  <SelectTrigger data-testid="reg-select-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t("pages.registerPatient.genderMale")}</SelectItem>
                    <SelectItem value="female">{t("pages.registerPatient.genderFemale")}</SelectItem>
                    <SelectItem value="other">{t("pages.registerPatient.genderOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelNationalId")}</Label>
                <Input value={formData.nationalId} onChange={(e) => set({ nationalId: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelBloodGroup")}</Label>
                <Select
                  value={formData.bloodGroup || "__none"}
                  onValueChange={(v) => set({ bloodGroup: v === "__none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("pages.registerPatient.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t("pages.registerPatient.bloodNotSpecified")}</SelectItem>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 shrink-0" aria-hidden />
              <SectionTitleWithHint hint={t("pages.registerPatient.profilePhotoHint")}>
                {t("pages.registerPatient.profilePhotoTitle")}
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
                {photoPreviewUrl ? (
                  <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-8 w-8 opacity-50" aria-hidden />
                )}
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                <input
                  ref={galleryPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  id="reg-profile-photo"
                  data-testid="reg-input-profile-photo"
                  onChange={(e) => onProfilePhotoPick(e.target.files?.[0])}
                />
                <input ref={cameraPhotoInputRef} type="file" accept="image/*" capture="user" className="hidden" />
                <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="secondary" size="sm">
                        {t("pages.registerPatient.choosePhoto")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onSelect={() => {
                          if (canUseCamera) setCameraOpen(true);
                          else cameraPhotoInputRef.current?.click();
                        }}
                      >
                        {t("pages.registerPatient.takePicture")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => galleryPhotoInputRef.current?.click()}>
                        {t("pages.registerPatient.uploadPhoto")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {profilePhotoFile && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearProfilePhoto} className="gap-1">
                      <X className="h-3.5 w-3.5" />
                      {t("pages.registerPatient.remove")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("pages.registerPatient.dialogTakePicture")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {cameraDevices.length > 1 && (
                <div className="space-y-2">
                  <Label>{t("pages.registerPatient.labelCamera")}</Label>
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
                        {d.label || t("pages.registerPatient.cameraNamed", { n: idx + 1 })}
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
              {cameraError ? <p className="text-sm text-destructive">{cameraError}</p> : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setCameraOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={capturePhotoFromCamera}
                  disabled={!!cameraError || !cameraStream}
                  data-testid="reg-profile-photo-capture"
                >
                  {t("pages.registerPatient.capture")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>{t("pages.registerPatient.contactTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelPhone")}</Label>
                <Input value={formData.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelEmail")}</Label>
                <Input type="email" value={formData.email} onChange={(e) => set({ email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelStreet")}</Label>
              <Input value={formData.address} onChange={(e) => set({ address: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelCityTown")}</Label>
                <Input value={formData.city} onChange={(e) => set({ city: e.target.value })} />
              </div>
              <div
                className="space-y-2"
                onMouseDownCapture={() => {
                  if (!formData.country) {
                    toast({
                      title: t("pages.registerPatient.toastPickCountryFirstTitle"),
                      description: t("pages.registerPatient.toastPickCountryFirstDesc"),
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Label>{t("pages.registerPatient.labelState")}</Label>
                <StateSelect
                  countryCode={formData.country}
                  value={formData.state}
                  onValueChange={(state) => set({ state })}
                  data-testid="reg-select-state"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelCountry")}</Label>
              <CountrySelect
                value={formData.country}
                onValueChange={(code) => set({ country: code, state: "" })}
                data-testid="reg-select-country"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pages.registerPatient.portalTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("pages.registerPatient.portalIntro")}</p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="reg-portal-enabled"
                checked={formData.portalEnabled}
                onCheckedChange={(v) => set({ portalEnabled: v === true })}
                data-testid="reg-portal-enabled"
              />
              <div className="space-y-1">
                <Label htmlFor="reg-portal-enabled" className="font-medium cursor-pointer">
                  {t("pages.registerPatient.portalCheckbox")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("pages.registerPatient.portalCheckboxHint")}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.portalEmailLabel")}</Label>
              <Input
                type="email"
                placeholder={t("pages.registerPatient.portalEmailPlaceholder")}
                value={formData.portalAccessEmail}
                onChange={(e) => set({ portalAccessEmail: e.target.value })}
                data-testid="reg-portal-email"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitleWithHint hint={t("pages.registerPatient.emergencyHint")}>
                {t("pages.registerPatient.emergencyTitle")}
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelKinName")}</Label>
              <Input value={formData.nextOfKinName} onChange={(e) => set({ nextOfKinName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelKinPhone")}</Label>
              <Input value={formData.nextOfKinPhone} onChange={(e) => set({ nextOfKinPhone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelKinRelationship")}</Label>
              <EmergencyContactRelationshipSelect
                value={formData.nextOfKinRelation}
                onValueChange={(v) => set({ nextOfKinRelation: v })}
                data-testid="reg-select-next-of-kin-relationship"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitleWithHint hint={t("pages.registerPatient.billingHint")}>
                {t("pages.registerPatient.billingTitle")}
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelInsurance")}</Label>
                <Input
                  value={formData.insuranceCarrier}
                  onChange={(e) => set({ insuranceCarrier: e.target.value })}
                  placeholder={t("pages.registerPatient.insurancePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelPolicy")}</Label>
                <Input value={formData.insurancePolicyNumber} onChange={(e) => set({ insurancePolicyNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelGroup")}</Label>
              <Input value={formData.insuranceGroupNumber} onChange={(e) => set({ insuranceGroupNumber: e.target.value })} />
            </div>
            <div className="border-t pt-4 grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelGuarantorName")}</Label>
                <Input value={formData.billingGuarantorName} onChange={(e) => set({ billingGuarantorName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelGuarantorPhone")}</Label>
                <Input value={formData.billingGuarantorPhone} onChange={(e) => set({ billingGuarantorPhone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.registerPatient.labelGuarantorRelationship")}</Label>
                <Select
                  value={formData.billingGuarantorRelation || "__none"}
                  onValueChange={(v) => set({ billingGuarantorRelation: v === "__none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("pages.registerPatient.selectRelationship")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t("pages.registerPatient.bloodNotSpecified")}</SelectItem>
                    <SelectItem value="Self">{t("pages.registerPatient.guarantorSelf")}</SelectItem>
                    <SelectItem value="Parent">{t("pages.registerPatient.guarantorParent")}</SelectItem>
                    <SelectItem value="Employer">{t("pages.registerPatient.guarantorEmployer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.registerPatient.labelBillingNotes")}</Label>
              <Textarea
                value={formData.billingNotes}
                onChange={(e) => set({ billingNotes: e.target.value })}
                placeholder={t("pages.registerPatient.billingNotesPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitleWithHint hint={t("pages.registerPatient.careTeamHint")}>
                {t("pages.registerPatient.careTeamTitle")}
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md">
              <Label>{t("pages.registerPatient.labelPrimaryProvider")}</Label>
              <Select
                value={formData.primaryProviderId || "__none"}
                onValueChange={(v) => set({ primaryProviderId: v === "__none" ? "" : v })}
              >
                <SelectTrigger data-testid="reg-select-primary-provider">
                  <SelectValue placeholder={t("pages.registerPatient.selectClinician")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("pages.registerPatient.noneShort")}</SelectItem>
                  {clinicians.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="secondary" asChild>
            <Link href={backHref}>
              <a>{t("common.cancel")}</a>
            </Link>
          </Button>
          <Button type="submit" disabled={createMutation.isPending} data-testid="reg-submit-patient">
            {createMutation.isPending ? t("pages.registerPatient.saving") : t("pages.registerPatient.registerSubmit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
