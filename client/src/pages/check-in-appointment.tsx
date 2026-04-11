import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
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
import { EmergencyContactRelationshipSelect } from "@/components/emergency-contact-relationship-select";
import { ArrowLeft } from "lucide-react";
import type { Appointment, Patient } from "@shared/schema";
import { useTranslation } from "react-i18next";

/**
 * Full-page check-in flow (replaces the former modal on Appointments).
 */
export default function CheckInAppointmentPage() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/appointments/check-in/:appointmentId");
  const appointmentId = params?.appointmentId;
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();

  const [patientForm, setPatientForm] = useState<Partial<Patient>>({});
  const [paymentCopay, setPaymentCopay] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReceived, setPaymentReceived] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const {
    data: selectedAppt,
    isLoading: apptLoading,
    error: apptError,
  } = useQuery<Appointment>({
    queryKey: ["/api/appointments", appointmentId],
    queryFn: async () => {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load appointment");
      return res.json();
    },
    enabled: !!appointmentId && !!token,
  });

  const {
    data: selectedPatient,
    isLoading: patientLoading,
    error: patientError,
  } = useQuery<Patient>({
    queryKey: ["/api/patients", selectedAppt?.patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${selectedAppt!.patientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load patient");
      return res.json();
    },
    enabled: !!selectedAppt?.patientId && !!token,
  });

  const canCheckIn =
    selectedAppt &&
    selectedPatient &&
    (selectedAppt.status === "scheduled" || selectedAppt.status === "confirmed");

  useEffect(() => {
    if (!selectedAppt || !selectedPatient) return;
    // Do not preselect a country in demographics edits during check-in.
    setPatientForm({ ...selectedPatient, country: null });
    setPaymentCopay(selectedAppt.checkInCopayAmount != null ? String(selectedAppt.checkInCopayAmount) : "");
    setPaymentMethod(selectedAppt.checkInPaymentMethod ?? "");
    setPaymentReceived(selectedAppt.checkInAmountReceived != null ? String(selectedAppt.checkInAmountReceived) : "");
    setPaymentNotes(selectedAppt.checkInPaymentNotes ?? "");
  }, [selectedAppt?.id, selectedPatient?.id]);

  const completeCheckInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAppt || !selectedPatient) throw new Error("Missing data");
      const p = patientForm;
      if (!String(p.firstName ?? "").trim() || !String(p.lastName ?? "").trim()) {
        throw new Error("First and last name are required");
      }
      const patientPayload: Record<string, unknown> = {
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        phone: p.phone ?? null,
        email: p.email ?? null,
        address: p.address ?? null,
        city: p.city ?? null,
        country: p.country ?? null,
        nationalId: p.nationalId ?? null,
        bloodGroup: p.bloodGroup ?? null,
        allergies: p.allergies ?? null,
        nextOfKinName: p.nextOfKinName ?? null,
        nextOfKinPhone: p.nextOfKinPhone ?? null,
        nextOfKinRelation: p.nextOfKinRelation ?? null,
      };
      const pr = await fetch(`/api/patients/${selectedPatient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patientPayload),
      });
      if (!pr.ok) {
        const err = await pr.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update patient");
      }
      const ar = await fetch(`/api/appointments/${selectedAppt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: "checked_in",
          checkInCopayAmount: paymentCopay.trim() || null,
          checkInPaymentMethod: paymentMethod.trim() || null,
          checkInAmountReceived: paymentReceived.trim() || null,
          checkInPaymentNotes: paymentNotes.trim() || null,
        }),
      });
      if (!ar.ok) {
        const err = await ar.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update appointment");
      }
      return ar.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: i18n.t("pages.checkIn.toastCheckedIn"),
        description: i18n.t("pages.checkIn.toastCheckedInDesc"),
      });
      navigate("/appointments");
    },
    onError: (e: Error) =>
      toast({ title: i18n.t("pages.checkIn.toastError"), description: e.message, variant: "destructive" }),
  });

  const loading = apptLoading || patientLoading;
  const goBack = () => navigate("/appointments");

  if (!appointmentId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("pages.checkIn.invalidLink")}</p>
        <Button variant="ghost" className="px-0 mt-2 justify-start" onClick={goBack}>
          {t("pages.checkIn.backToAppointments")}
        </Button>
      </div>
    );
  }

  if (!loading && (apptError || patientError)) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-destructive">
          {apptError ? t("pages.checkIn.couldNotLoadAppointment") : t("pages.checkIn.couldNotLoadPatient")}
        </p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          {t("pages.checkIn.backToAppointments")}
        </Button>
      </div>
    );
  }

  if (!loading && selectedAppt && selectedPatient && !canCheckIn) {
    return (
      <div className="p-6 max-w-lg space-y-4">
        <p className="text-muted-foreground">
          {t("pages.checkIn.cannotCheckInPrefix")} <strong>{selectedAppt.status}</strong>
          {t("pages.checkIn.cannotCheckInSuffix")}
        </p>
        <Button variant="outline" onClick={goBack}>
          {t("pages.checkIn.backToAppointments")}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-16 max-w-3xl mx-auto space-y-6" data-testid="check-in-appointment-page">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={goBack} data-testid="check-in-back">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("pages.checkIn.back")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.checkIn.heading")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("pages.checkIn.subheading")}
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8">{t("pages.checkIn.loading")}</p>
      ) : selectedPatient ? (
        <>
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-3 border-b pb-2">{t("pages.checkIn.sectionDemographics")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.firstName")}</Label>
                  <Input
                    value={patientForm.firstName ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.lastName")}</Label>
                  <Input
                    value={patientForm.lastName ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.dateOfBirth")}</Label>
                  <Input
                    type="date"
                    value={patientForm.dateOfBirth ? String(patientForm.dateOfBirth).slice(0, 10) : ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.gender")}</Label>
                  <Select
                    value={patientForm.gender ?? "male"}
                    onValueChange={(v) => setPatientForm((f) => ({ ...f, gender: v as Patient["gender"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("pages.checkIn.genderMale")}</SelectItem>
                      <SelectItem value="female">{t("pages.checkIn.genderFemale")}</SelectItem>
                      <SelectItem value="other">{t("pages.checkIn.genderOther")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.phone")}</Label>
                  <Input
                    value={patientForm.phone ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("pages.checkIn.email")}</Label>
                  <Input
                    value={patientForm.email ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={patientForm.address ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>City/Town</Label>
                  <Input
                    value={patientForm.city ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <CountrySelect
                    value={patientForm.country ?? ""}
                    onValueChange={(code) => setPatientForm((f) => ({ ...f, country: code }))}
                    data-testid="check-in-select-country"
                  />
                </div>
                <div className="space-y-1">
                  <Label>National ID</Label>
                  <Input
                    value={patientForm.nationalId ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, nationalId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Blood group</Label>
                  <Input
                    value={patientForm.bloodGroup ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, bloodGroup: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Allergies (text)</Label>
                  <Textarea
                    value={patientForm.allergies ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, allergies: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Next of kin name</Label>
                  <Input
                    value={patientForm.nextOfKinName ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, nextOfKinName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Next of kin phone</Label>
                  <Input
                    value={patientForm.nextOfKinPhone ?? ""}
                    onChange={(e) => setPatientForm((f) => ({ ...f, nextOfKinPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Next of kin relation</Label>
                  <EmergencyContactRelationshipSelect
                    value={patientForm.nextOfKinRelation ?? ""}
                    onValueChange={(v) => setPatientForm((f) => ({ ...f, nextOfKinRelation: v }))}
                    data-testid="checkin-select-next-of-kin-relationship"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-3 border-b pb-2">Payment information (editable)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Copay / expected amount</Label>
                  <Input value={paymentCopay} onChange={(e) => setPaymentCopay(e.target.value)} placeholder="e.g. 500" />
                </div>
                <div className="space-y-1">
                  <Label>Payment method</Label>
                  <Select value={paymentMethod || "__unset__"} onValueChange={(v) => setPaymentMethod(v === "__unset__" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">—</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                      <SelectItem value="Insurance">Insurance</SelectItem>
                      <SelectItem value="Waived">Waived</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Amount received</Label>
                  <Input
                    value={paymentReceived}
                    onChange={(e) => setPaymentReceived(e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Payment notes</Label>
                  <Textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    rows={2}
                    placeholder="Receipt #, insurance auth, etc."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={goBack}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => completeCheckInMutation.mutate()}
              disabled={completeCheckInMutation.isPending}
              data-testid="reception-complete-check-in"
            >
              {completeCheckInMutation.isPending ? "Saving…" : "Complete check in"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
