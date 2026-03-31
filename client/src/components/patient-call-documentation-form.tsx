import { useMutation, useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/query-keys";
import type { PatientCallReasonOption } from "@shared/patient-call-reasons";

type Outcome = "picked_up" | "did_not_pick_up" | "left_message";

const FALLBACK_CALL_REASONS: PatientCallReasonOption[] = [
  { value: "appointment_reminder", label: "Appointment reminder" },
  { value: "results_follow_up", label: "Lab / imaging results follow-up" },
  { value: "medication_follow_up", label: "Medication follow-up" },
  { value: "care_plan_check_in", label: "Care plan check-in" },
  { value: "billing_insurance", label: "Billing / insurance clarification" },
  { value: "referral_coordination", label: "Referral coordination" },
  { value: "no_show_follow_up", label: "No-show follow-up" },
  { value: "wellness_outreach", label: "Wellness outreach" },
  { value: "other", label: "Other" },
];

type Props = {
  token: string | null;
  userId: string | undefined;
  patientId: string;
  labOrderId?: string;
  imagingOrderId?: string;
  appointmentId?: string;
  reasonForCall: string;
  outcome: Outcome | "";
  discussion: string;
  onReasonForCallChange: (v: string) => void;
  onOutcomeChange: (v: Outcome | "") => void;
  onDiscussionChange: (v: string) => void;
  onCancel?: () => void;
  onSaved?: () => void;
  saveLabel?: string;
};

export function PatientCallDocumentationForm({
  token,
  userId,
  patientId,
  labOrderId,
  imagingOrderId,
  appointmentId,
  reasonForCall,
  outcome,
  discussion,
  onReasonForCallChange,
  onOutcomeChange,
  onDiscussionChange,
  onCancel,
  onSaved,
  saveLabel = "Save contact",
}: Props) {
  const { toast } = useToast();
  const { data: callReasons = FALLBACK_CALL_REASONS } = useQuery<PatientCallReasonOption[]>({
    queryKey: ["/api/patient-call-reasons"],
    queryFn: async () => {
      const res = await fetch("/api/patient-call-reasons");
      if (!res.ok) return FALLBACK_CALL_REASONS;
      const data = (await res.json().catch(() => FALLBACK_CALL_REASONS)) as PatientCallReasonOption[];
      return Array.isArray(data) && data.length > 0 ? data : FALLBACK_CALL_REASONS;
    },
    enabled: true,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!reasonForCall.trim()) throw new Error("Please select reason for call");
      if (!outcome) throw new Error("Please select call outcome");
      if (!userId) throw new Error("User not available");
      const res = await fetch("/api/follow-up-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          labOrderId,
          imagingOrderId,
          appointmentId,
          contactedBy: userId,
          reasonForCall: reasonForCall.trim(),
          outcome,
          discussion: discussion.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Failed to save contact");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.followUpContacts.root });
      toast({ title: "Contact documented" });
      onSaved?.();
    },
    onError: (e: Error) => toast({ title: "Could not save contact", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Reason for call *</Label>
        <Select value={reasonForCall || undefined} onValueChange={onReasonForCallChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select reason" />
          </SelectTrigger>
          <SelectContent>
            {callReasons.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Call outcome *</Label>
        <Select value={outcome} onValueChange={(v: Outcome) => onOutcomeChange(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="picked_up">Patient picked up</SelectItem>
            <SelectItem value="did_not_pick_up">Did not pick up</SelectItem>
            <SelectItem value="left_message">Left a message</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Discussion notes</Label>
        <Textarea
          value={discussion}
          onChange={(e) => onDiscussionChange(e.target.value)}
          placeholder="Document what was discussed with the patient…"
          rows={4}
          className="resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          disabled={!reasonForCall.trim() || !outcome || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

