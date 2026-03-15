import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Pill, FileText, History, ShieldCheck, ListChecks, Plus, ClipboardList, FileCheck, FlaskConical, ImageIcon, Mic, Sparkles, Pencil, Activity, AlertTriangle, Loader2, LayoutGrid, User, CalendarDays, Phone, Mail, MapPin, Heart,
} from "lucide-react";
import { format } from "date-fns";
import type { Patient, Encounter, Prescription, LabOrder, PatientProblem, PatientNote, FamilyMember, FamilyMemberCondition, ImagingResult, ImagingOrder, PatientDocument, Vitals, PatientAllergy } from "@shared/schema";
import { FAMILY_RELATIONSHIPS, COMMON_INHERITED_CONDITIONS_AFRICA } from "@/lib/family-history-constants";
import { DOSE_OPTIONS, FREQUENCY_OPTIONS, DURATION_OPTIONS } from "@/lib/medication-order-options";
import { COMMON_LAB_TESTS_AFRICA } from "@/lib/common-lab-tests-africa";
import { COMMON_MEDICATIONS_AFRICA } from "@/lib/common-medications-africa";
import { COMMON_IMAGING_AFRICA } from "@/lib/common-imaging-africa";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DocumentFileUpload } from "@/components/document-file-upload";

const ALLERGY_REACTION_TYPES = [
  "Anaphylaxis",
  "Angioedema",
  "Rash",
  "Hives / Urticaria",
  "Bronchospasm",
  "Gastrointestinal",
  "Dermatitis",
  "Rhinitis",
  "Conjunctivitis",
  "Other",
  "Not specified",
];

export default function PatientDetailPage() {
  const [, params] = useRoute("/patients/:id");
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const id = params?.id;
  const authToken = token ?? (typeof localStorage !== "undefined" ? localStorage.getItem("ehr_token") : null);

  const [addProblemOpen, setAddProblemOpen] = useState(false);
  const [newProblem, setNewProblem] = useState("");
  const [newProblemStartDate, setNewProblemStartDate] = useState("");
  const [newProblemSymptoms, setNewProblemSymptoms] = useState("");
  const [addPastProblemOpen, setAddPastProblemOpen] = useState(false);
  const [newPastProblem, setNewPastProblem] = useState("");
  const [newPastProblemStartDate, setNewPastProblemStartDate] = useState("");
  const [newPastProblemResolution, setNewPastProblemResolution] = useState<"current" | "resolved">("resolved");
  const [editProblemOpen, setEditProblemOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<PatientProblem | null>(null);
  const [editProblemForm, setEditProblemForm] = useState({ problem: "", problemStartDate: "", symptoms: "", resolution: "resolved" as "current" | "resolved" });
  const [addFamilyMemberOpen, setAddFamilyMemberOpen] = useState(false);
  const [newFamilyRelationship, setNewFamilyRelationship] = useState<string>("");
  const [newFamilyRelationshipOther, setNewFamilyRelationshipOther] = useState("");
  const [addConditionOpen, setAddConditionOpen] = useState(false);
  const [addConditionFamilyMember, setAddConditionFamilyMember] = useState<FamilyMember | null>(null);
  const [newConditionSelect, setNewConditionSelect] = useState("");
  const [newConditionOther, setNewConditionOther] = useState("");
  const [newConditionNotes, setNewConditionNotes] = useState("");
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("Progress Note");
  const [editNoteOpen, setEditNoteOpen] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [noteListening, setNoteListening] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "",
    heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "",
  });
  const [editVitalsOpen, setEditVitalsOpen] = useState(false);
  const [editVitals, setEditVitals] = useState<Vitals | null>(null);
  const [editVitalsForm, setEditVitalsForm] = useState({
    temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "",
    heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "",
    recordedAt: "",
  });
  const [newAllergyOpen, setNewAllergyOpen] = useState(false);
  const [newAllergyForm, setNewAllergyForm] = useState({ allergen: "", severity: "LOW" as "LOW" | "MEDIUM" | "HIGH", reactionType: "Not specified", reactionTypeOther: "" });
  const [allergenSuggestions, setAllergenSuggestions] = useState<string[]>([]);
  const [allergenSuggestLoading, setAllergenSuggestLoading] = useState(false);
  const [allergenSuggestOpen, setAllergenSuggestOpen] = useState(false);
  const allergenSuggestDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [noteAiLoading, setNoteAiLoading] = useState(false);
  const noteRecognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [orderComposerType, setOrderComposerType] = useState<"lab" | "medication" | "imaging" | null>(null);
  const [newOrderForm, setNewOrderForm] = useState({ testName: "", testCode: "", priority: "routine", internalExternal: "internal" as "internal" | "external" });
  const [newImagingOrderForm, setNewImagingOrderForm] = useState({ title: "", modality: "X-Ray", internalExternal: "internal" as "internal" | "external", patientProblemId: "" });
  const [newMedOrderOpen, setNewMedOrderOpen] = useState(false);
  const [newMedOrderForm, setNewMedOrderForm] = useState({
    medicationName: "", dosage: "", frequency: "once daily", duration: "", instructions: "",
    patientProblemId: "",
  });
  const [mainTab, setMainTab] = useState("overview");

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", id],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: encounters = [] } = useQuery<Encounter[]>({
    queryKey: ["/api/encounters", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/encounters?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: ["/api/prescriptions", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: problems = [] } = useQuery<PatientProblem[]>({
    queryKey: ["/api/patients", id, "problems"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/problems`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery<PatientNote[]>({
    queryKey: ["/api/patients", id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/notes`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: vitalsList = [] } = useQuery<Vitals[]>({
    queryKey: ["/api/patients", id, "vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/vitals`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: patientAllergies = [] } = useQuery<PatientAllergy[]>({
    queryKey: ["/api/patients", id, "allergies"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/allergies`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: familyHistory, isLoading: familyHistoryLoading } = useQuery<{ members: FamilyMember[]; conditions: FamilyMemberCondition[] }>({
    queryKey: ["/api/patients", id, "family-history"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/family-history`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });
  const familyMembersList = familyHistory?.members ?? [];
  const familyConditionsList = familyHistory?.conditions ?? [];

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: ["/api/lab-orders", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/lab-orders?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: imagingOrders = [] } = useQuery<ImagingOrder[]>({
    queryKey: ["/api/imaging-orders", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/imaging-orders?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: imagingResults = [] } = useQuery<ImagingResult[]>({
    queryKey: ["/api/imaging-results", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/imaging-results?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: patientDocuments = [] } = useQuery<PatientDocument[]>({
    queryKey: ["/api/patient-documents", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/patient-documents?patientId=${id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const [newImagingOpen, setNewImagingOpen] = useState(false);
  const [newImagingForm, setNewImagingForm] = useState({ modality: "X-Ray", title: "", description: "", documentUrl: "" });

  const addImagingMutation = useMutation({
    mutationFn: async (data: typeof newImagingForm) => {
      const res = await fetch("/api/imaging-results", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          modality: data.modality.trim(),
          title: data.title.trim(),
          description: data.description.trim() || undefined,
          documentUrl: data.documentUrl.trim() || undefined,
          uploadedBy: user?.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imaging-results", `?patientId=${id}`] });
      toast({ title: "Imaging result added" });
      setNewImagingOpen(false);
      setNewImagingForm({ modality: "X-Ray", title: "", description: "", documentUrl: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addProblemMutation = useMutation({
    mutationFn: async (payload: { problem: string; status?: "active" | "past"; problemStartDate?: string; symptoms?: string; resolution?: "current" | "resolved" }) => {
      const body: Record<string, unknown> = { problem: payload.problem, status: payload.status ?? "active" };
      if (payload.problemStartDate) body.problemStartDate = payload.problemStartDate;
      if (payload.symptoms !== undefined) body.symptoms = payload.symptoms?.trim() || null;
      if (payload.status === "past" && payload.resolution) body.resolution = payload.resolution;
      const res = await fetch(`/api/patients/${id}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (res.ok && res.status === 201) {
          queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
          return { id: "", problem: payload.problem, status: payload.status ?? "active", createdAt: new Date().toISOString() };
        }
        throw new Error(`Server error (${res.status}). Open the app at http://localhost:5000 so API and UI use the same origin.`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data as { id: string; problem: string; status: string; createdAt: string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: variables.status === "past" ? "Past problem added" : "Problem added" });
      setAddProblemOpen(false);
      setNewProblem("");
      setNewProblemStartDate("");
      setNewProblemSymptoms("");
      setAddPastProblemOpen(false);
      setNewPastProblem("");
      setNewPastProblemStartDate("");
      setNewPastProblemResolution("resolved");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateProblemMutation = useMutation({
    mutationFn: async ({ problemId, problem, problemStartDate, symptoms, resolution, status }: { problemId: string; problem: string; problemStartDate?: string; symptoms?: string; resolution?: "current" | "resolved"; status?: "active" | "past" }) => {
      const body: Record<string, unknown> = { problem: problem.trim(), problemStartDate: problemStartDate || null, symptoms: symptoms !== undefined ? (symptoms?.trim() || null) : undefined, resolution: resolution || null };
      if (status !== undefined) body.status = status;
      const res = await fetch(`/api/patients/${id}/problems/${problemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response" : `Server error (${res.status}).`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: "Problem updated" });
      setEditProblemOpen(false);
      setEditProblem(null);
      setEditProblemForm({ problem: "", problemStartDate: "", symptoms: "", resolution: "resolved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveProblemMutation = useMutation({
    mutationFn: async (problemId: string) => {
      const res = await fetch(`/api/patients/${id}/problems/${problemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ status: "past", resolution: "resolved" }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response" : `Server error (${res.status}).`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: "Problem marked as resolved and moved to History" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addFamilyMemberMutation = useMutation({
    mutationFn: async (relationship: string) => {
      const res = await fetch(`/api/patients/${id}/family-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ relationship: relationship.trim() }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response from server" : `Server error (${res.status}). Ensure the app is running on the same origin (e.g. http://localhost:5000).`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data as { id: string; patientId: string; relationship: string; createdAt: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-history"] });
      toast({ title: "Family member added" });
      setAddFamilyMemberOpen(false);
      setNewFamilyRelationship("");
      setNewFamilyRelationshipOther("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addFamilyConditionMutation = useMutation({
    mutationFn: async ({ familyMemberId, condition, notes }: { familyMemberId: string; condition: string; notes?: string }) => {
      const res = await fetch(`/api/family-members/${familyMemberId}/conditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ condition: condition.trim(), notes: notes?.trim() || undefined }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response" : `Server error (${res.status}). Open the app at http://localhost:5000.`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-history"] });
      toast({ title: "Condition added" });
      setAddConditionOpen(false);
      setAddConditionFamilyMember(null);
      setNewConditionSelect("");
      setNewConditionOther("");
      setNewConditionNotes("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const NOTE_TYPES = ["Progress Note", "SOAP Note", "Nursing Note", "H&P", "Discharge Summary", "Consult Note", "Procedure Note", "Admission Note"];

  useEffect(() => {
    if (!newNoteOpen) return;
    const Win = typeof window !== "undefined" ? window : ({} as Window);
    const SR = (Win as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      || (Win as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result?.isFinal && result[0]?.transcript) {
          const transcript = result[0].transcript;
          setNewNoteContent((prev) => (prev ? prev + " " + transcript : transcript));
        }
      }
    };
    rec.onend = () => setNoteListening(false);
    rec.onerror = () => setNoteListening(false);
    noteRecognitionRef.current = { start: () => { rec.start(); setNoteListening(true); }, stop: () => { rec.stop(); } };
    return () => {
      try { rec.abort(); } catch { /* ignore */ }
      noteRecognitionRef.current = null;
      setNoteListening(false);
    };
  }, [newNoteOpen]);

  const toggleNoteDictation = () => {
    if (noteListening) {
      noteRecognitionRef.current?.stop();
    } else {
      if (!noteRecognitionRef.current) {
        toast({ title: "Dictation not supported", description: "Use a browser that supports speech recognition (e.g. Chrome).", variant: "destructive" });
        return;
      }
      noteRecognitionRef.current.start();
      toast({ title: "Listening...", description: "Speak into the microphone. Click the mic again to stop." });
    }
  };

  const handleAiSuggestNote = async () => {
    setNoteAiLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-note", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ text: newNoteContent, noteKind: newNoteType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "AI suggestion failed");
      if (data.suggested) setNewNoteContent(data.suggested);
      else toast({ title: "No suggestion", description: "AI did not return text.", variant: "destructive" });
    } catch (e) {
      toast({ title: "AI help unavailable", description: e instanceof Error ? e.message : "Could not get suggestion.", variant: "destructive" });
    } finally {
      setNoteAiLoading(false);
    }
  };

  const addNoteMutation = useMutation({
    mutationFn: async (payload: { content: string; noteKind: string }) => {
      const res = await fetch(`/api/patients/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ content: payload.content, noteKind: payload.noteKind }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response" : `Server error (${res.status}). Open the app at http://localhost:5000.`);
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "notes"] });
      toast({ title: "Note signed and saved" });
      setNewNoteOpen(false);
      setNewNoteContent("");
      setNewNoteType("Progress Note");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (payload: { noteId: string; content: string }) => {
      const res = await fetch(`/api/patients/${id}/notes/${payload.noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ content: payload.content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update note");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "notes"] });
      toast({ title: "Note updated" });
      setEditNoteOpen(false);
      setEditNoteId(null);
      setEditNoteContent("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordVitalsMutation = useMutation({
    mutationFn: async (data: typeof vitalsForm) => {
      const res = await fetch(`/api/patients/${id}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          temperature: data.temperature || undefined,
          bloodPressureSystolic: data.bloodPressureSystolic || undefined,
          bloodPressureDiastolic: data.bloodPressureDiastolic || undefined,
          heartRate: data.heartRate || undefined,
          respiratoryRate: data.respiratoryRate || undefined,
          oxygenSaturation: data.oxygenSaturation || undefined,
          weight: data.weight || undefined,
          height: data.height || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to record vitals");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "vitals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "latest-vitals"] });
      toast({ title: "Vitals recorded" });
      setVitalsForm({ temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "", heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateVitalsMutation = useMutation({
    mutationFn: async ({ vitalId, data }: { vitalId: string; data: typeof editVitalsForm }) => {
      const payload: Record<string, unknown> = {};
      if (data.temperature !== "") payload.temperature = data.temperature;
      if (data.bloodPressureSystolic !== "") payload.bloodPressureSystolic = data.bloodPressureSystolic;
      if (data.bloodPressureDiastolic !== "") payload.bloodPressureDiastolic = data.bloodPressureDiastolic;
      if (data.heartRate !== "") payload.heartRate = data.heartRate;
      if (data.respiratoryRate !== "") payload.respiratoryRate = data.respiratoryRate;
      if (data.oxygenSaturation !== "") payload.oxygenSaturation = data.oxygenSaturation;
      if (data.weight !== "") payload.weight = data.weight;
      if (data.height !== "") payload.height = data.height;
      if (data.recordedAt !== "") payload.recordedAt = data.recordedAt;
      const res = await fetch(`/api/patients/${id}/vitals/${vitalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update vitals");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "vitals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "latest-vitals"] });
      toast({ title: "Vitals updated" });
      setEditVitalsOpen(false);
      setEditVitals(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addAllergyMutation = useMutation({
    mutationFn: async (payload: { allergen: string; severity: "LOW" | "MEDIUM" | "HIGH"; reactionType?: string }) => {
      const res = await fetch(`/api/patients/${id}/allergies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ ...payload, reactionType: payload.reactionType === "Not specified" ? undefined : payload.reactionType }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add allergy");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "allergies"] });
      toast({ title: "Allergy added" });
      setNewAllergyOpen(false);
      setNewAllergyForm({ allergen: "", severity: "LOW", reactionType: "Not specified", reactionTypeOther: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAllergyMutation = useMutation({
    mutationFn: async (allergyId: string) => {
      const res = await fetch(`/api/patients/${id}/allergies/${allergyId}`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed to remove allergy");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "allergies"] });
      toast({ title: "Allergy removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!newAllergyOpen) {
      setAllergenSuggestions([]);
      return;
    }
    const q = newAllergyForm.allergen.trim();
    if (q.length < 2) {
      setAllergenSuggestions([]);
      setAllergenSuggestLoading(false);
      return;
    }
    setAllergenSuggestLoading(true);
    if (allergenSuggestDebounceRef.current) clearTimeout(allergenSuggestDebounceRef.current);
    allergenSuggestDebounceRef.current = setTimeout(() => {
      fetch(`/api/allergies/suggest?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data: { suggestions?: string[] }) => setAllergenSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []))
        .catch(() => setAllergenSuggestions([]))
        .finally(() => setAllergenSuggestLoading(false));
    }, 300);
    return () => {
      if (allergenSuggestDebounceRef.current) clearTimeout(allergenSuggestDebounceRef.current);
    };
  }, [newAllergyOpen, newAllergyForm.allergen, authToken]);

  const addOrderMutation = useMutation({
    mutationFn: async (data: { testName: string; testCode: string; priority: string; internalExternal: "internal" | "external" }) => {
      const res = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          orderedBy: user?.id,
          testName: data.testName,
          testCode: data.testCode || undefined,
          priority: data.priority,
          internalExternal: data.internalExternal || "internal",
          status: "ordered",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders", `?patientId=${id}`] });
      toast({ title: "Lab order created" });
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewOrderForm({ testName: "", testCode: "", priority: "routine", internalExternal: "internal" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addImagingOrderMutation = useMutation({
    mutationFn: async (data: { title: string; modality: string; internalExternal: "internal" | "external"; patientProblemId?: string }) => {
      const res = await fetch("/api/imaging-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          orderedBy: user?.id,
          title: data.title.trim(),
          modality: data.modality.trim(),
          internalExternal: data.internalExternal || "internal",
          patientProblemId: data.patientProblemId?.trim() || undefined,
          status: "ordered",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imaging-orders", `?patientId=${id}`] });
      toast({ title: "Imaging order created" });
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewImagingOrderForm({ title: "", modality: "X-Ray", internalExternal: "internal", patientProblemId: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPrescriptionMutation = useMutation({
    mutationFn: async (data: typeof newMedOrderForm) => {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          prescribedBy: user?.id,
          patientProblemId: data.patientProblemId?.trim() || undefined,
          medicationName: data.medicationName.trim(),
          dosage: data.dosage.trim(),
          frequency: data.frequency.trim(),
          duration: data.duration.trim() || undefined,
          instructions: data.instructions.trim() || undefined,
          status: "active",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions", `?patientId=${id}`] });
      toast({ title: "Medication order created" });
      setNewMedOrderOpen(false);
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewMedOrderForm({ medicationName: "", dosage: "", frequency: "once daily", duration: "", instructions: "", patientProblemId: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const role = user?.role?.toLowerCase?.() ?? "";
  const isClinician = role === "clinician";
  const canOrder = role === "clinician" || role === "nurse";
  const canAddNote = role === "clinician" || role === "nurse";

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Patient not found.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    completed: "bg-chart-3/10 text-chart-3",
    in_progress: "bg-chart-4/10 text-chart-4",
    scheduled: "bg-accent text-accent-foreground",
    cancelled: "bg-destructive/10 text-destructive",
    active: "bg-chart-3/10 text-chart-3",
    dispensed: "bg-primary/10 text-primary",
    ordered: "bg-chart-4/10 text-chart-4",
    processing: "bg-chart-2/10 text-chart-2",
    collected: "bg-chart-5/10 text-chart-5",
    paid: "bg-chart-3/10 text-chart-3",
    pending: "bg-chart-4/10 text-chart-4",
    partial: "bg-chart-5/10 text-chart-5",
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" data-testid="patient-detail-page">
      <Tabs value={mainTab} onValueChange={setMainTab} className="flex flex-1 min-w-0 overflow-hidden">
        <nav className="w-52 flex-shrink-0 border border-border rounded-lg bg-muted/30 flex flex-col overflow-y-auto py-4">
          <div className="px-3 space-y-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Review</p>
              <TabsList className="flex flex-col gap-0.5 h-auto p-0 bg-transparent rounded-none">
                <TabsTrigger value="overview" data-testid="tab-overview" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <LayoutGrid className="w-4 h-4 shrink-0" /> Overview
                </TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <History className="w-4 h-4 shrink-0" /> History
                </TabsTrigger>
                <TabsTrigger value="immunization" data-testid="tab-immunization" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <ShieldCheck className="w-4 h-4 shrink-0" /> Immunization
                </TabsTrigger>
                <TabsTrigger value="results" data-testid="tab-results" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <FileCheck className="w-4 h-4 shrink-0" /> Results
                </TabsTrigger>
                <TabsTrigger value="allergy" data-testid="tab-allergy" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Allergy
                </TabsTrigger>
              </TabsList>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Visit documentation</p>
              <TabsList className="flex flex-col gap-0.5 h-auto p-0 bg-transparent rounded-none">
                <TabsTrigger value="problems" data-testid="tab-problems" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <ListChecks className="w-4 h-4 shrink-0" /> Problems List
                </TabsTrigger>
                <TabsTrigger value="vitals" data-testid="tab-vitals" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <Activity className="w-4 h-4 shrink-0" /> Vitals
                </TabsTrigger>
                <TabsTrigger value="medication" data-testid="tab-medication" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <Pill className="w-4 h-4 shrink-0" /> Medication
                </TabsTrigger>
                <TabsTrigger value="orders" data-testid="tab-orders" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <ClipboardList className="w-4 h-4 shrink-0" /> Orders
                </TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes" className="w-full justify-start gap-2 rounded-md px-3 py-2 h-auto bg-transparent hover:bg-accent data-[state=active]:bg-accent data-[state=active]:font-medium">
                  <FileText className="w-4 h-4 shrink-0" /> Notes
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </nav>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
        <TabsContent value="overview" className="space-y-6 mt-0 data-[state=inactive]:hidden">
          <Card className="border-muted">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Patient demographics</h3>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-medium">{patient.firstName} {patient.lastName}</span>
                {patient.mrn && <span className="text-muted-foreground">{patient.mrn}</span>}
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  {patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : ""} · {Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))} years
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                  DOB: {format(new Date(patient.dateOfBirth), "MMM d, yyyy")}
                </span>
                {patient.nationalId && <span className="text-muted-foreground">ID: {patient.nationalId}</span>}
                {patient.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    {patient.email}
                  </span>
                )}
                {patient.address && (
                  <span className="flex items-center gap-1.5 text-muted-foreground truncate max-w-[220px]">
                    <MapPin className="w-4 h-4 shrink-0" />
                    {patient.address}{patient.city ? `, ${patient.city}` : ""}
                  </span>
                )}
                {patient.bloodGroup && (
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-destructive shrink-0" />
                    Blood: {patient.bloodGroup}
                  </span>
                )}
                {vitalsList.length > 0 && (() => {
                  const v = vitalsList[0];
                  const parts = [];
                  if (v.temperature != null) parts.push(`Temp ${v.temperature} °C`);
                  if (v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null) parts.push(`BP ${v.bloodPressureSystolic ?? "—"}/${v.bloodPressureDiastolic ?? "—"}`);
                  if (v.heartRate != null) parts.push(`HR ${v.heartRate}`);
                  if (v.weight != null) parts.push(`${v.weight} kg`);
                  if (v.height != null) parts.push(`${v.height} cm`);
                  return parts.length > 0 ? <span className="flex items-center gap-1.5 text-muted-foreground"><Activity className="w-4 h-4 shrink-0" /> {parts.join(" · ")}</span> : null;
                })()}
                {patientAllergies.some((a) => a.severity === "HIGH") && (
                  <span className="flex items-center gap-1.5 text-destructive font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Allergies: {patientAllergies.filter((a) => a.severity === "HIGH").map((a) => a.allergen).join(", ")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">Snapshot of the patient chart at a glance. Use the section headers to go to the full page.</p>

          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setMainTab("history")}
                className="text-base font-semibold text-primary underline underline-offset-2 hover:no-underline flex items-center gap-2 mb-2"
              >
                <History className="w-4 h-4 shrink-0" /> History
              </button>
              <div className="text-sm text-muted-foreground space-y-1">
                {(() => {
                  const current = problems.filter((p) => p.status !== "past");
                  const past = problems.filter((p) => p.status === "past");
                  return (
                    <>
                      {current.length > 0 && (
                        <p>Current problems: {current.map((p) => p.problem).join(", ")}</p>
                      )}
                      {past.length > 0 && <p>Past problems: {past.length} recorded</p>}
                      {familyMembersList.length > 0 && <p>Family history: {familyMembersList.length} member(s)</p>}
                      {current.length === 0 && past.length === 0 && familyMembersList.length === 0 && (
                        <p>No history recorded.</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setMainTab("immunization")}
                className="text-base font-semibold text-primary underline underline-offset-2 hover:no-underline flex items-center gap-2 mb-2"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" /> Immunization
              </button>
              <p className="text-sm text-muted-foreground">Immunization history. Records can be added when immunization tracking is enabled.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setMainTab("results")}
                className="text-base font-semibold text-primary underline underline-offset-2 hover:no-underline flex items-center gap-2 mb-2"
              >
                <FileCheck className="w-4 h-4 shrink-0" /> Results
              </button>
              <div className="text-sm text-muted-foreground space-y-1">
                {(() => {
                  const labResulted = labOrders.filter((o) => o.status === "resulted" || o.status === "completed");
                  const labDocs = patientDocuments.filter((d) => d.documentType === "lab_result");
                  const hasLabs = labResulted.length > 0 || labDocs.length > 0;
                  return (
                    <>
                      {hasLabs && (
                        <p>Labs: {labResulted.length + labDocs.length} result(s)</p>
                      )}
                      {imagingResults.length > 0 && <p>Imaging: {imagingResults.length} result(s)</p>}
                      {!hasLabs && imagingResults.length === 0 && <p>No results yet.</p>}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setMainTab("allergy")}
                className="text-base font-semibold text-primary underline underline-offset-2 hover:no-underline flex items-center gap-2 mb-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" /> Allergy
              </button>
              <div className="text-sm text-muted-foreground">
                {patientAllergies.length > 0 ? (
                  <ul className="space-y-1">
                    {patientAllergies.map((a) => (
                      <li key={a.id} className={a.severity === "HIGH" ? "text-destructive font-medium" : ""}>
                        {a.allergen} {a.severity && <span className="text-muted-foreground">({a.severity})</span>}
                      </li>
                    ))}
                  </ul>
                ) : patient?.allergies ? (
                  <p className="whitespace-pre-wrap">{patient.allergies}</p>
                ) : (
                  <p>No allergies documented.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problems" className="space-y-3 mt-0 data-[state=inactive]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Documented problems for this patient</span>
            {canAddNote && (
              <Button size="sm" onClick={() => setAddProblemOpen(true)} data-testid="button-add-problem">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Problem
              </Button>
            )}
          </div>
          {(() => {
            const activeProblems = problems.filter((p) => p.status !== "past");
            return activeProblems.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No active problems. {canAddNote ? "Use Add Problem to add one. Resolved problems appear in History → Medical history." : ""}</CardContent></Card>
            ) : (
              <ul className="space-y-2">
                {activeProblems.map((p) => {
                  const startDate = (p as PatientProblem & { problemStartDate?: string | null }).problemStartDate;
                  const symptoms = (p as PatientProblem & { symptoms?: string | null }).symptoms;
                  return (
                    <Card key={p.id}>
                      <CardContent className="py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {canAddNote ? (
                            <button
                              type="button"
                              className="text-sm text-primary underline underline-offset-2 hover:no-underline text-left font-medium"
                              onClick={() => {
                                setEditProblem(p);
                                setEditProblemForm({
                                  problem: p.problem,
                                  problemStartDate: startDate ? String(startDate).slice(0, 10) : "",
                                  symptoms: symptoms ? String(symptoms) : "",
                                  resolution: "current",
                                });
                                setEditProblemOpen(true);
                              }}
                            >
                              {p.problem}
                            </button>
                          ) : (
                            <span className="text-sm font-medium">{p.problem}</span>
                          )}
                          {(startDate || symptoms) && (
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {startDate && <p>Started: {format(new Date(startDate), "MMM d, yyyy")}</p>}
                              {symptoms && <p className="whitespace-pre-wrap">Symptoms: {symptoms}</p>}
                            </div>
                          )}
                        </div>
                        {canAddNote && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="text-[10px] bg-chart-3/20 text-chart-3">
                              Active
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveProblemMutation.mutate(p.id)}
                              disabled={resolveProblemMutation.isPending}
                              data-testid={`button-resolve-problem-${p.id}`}
                            >
                              Resolve
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </ul>
            );
          })()}
        </TabsContent>

        <TabsContent value="vitals" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Document office visit vitals</span>
          </div>
          {canAddNote && (
            <Card>
              <CardContent className="p-5">
                <h4 className="text-sm font-medium mb-4">Record vitals</h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    recordVitalsMutation.mutate(vitalsForm);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Temp (°C)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.temperature} onChange={(e) => setVitalsForm((f) => ({ ...f, temperature: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">BP Systolic</Label>
                      <Input type="number" value={vitalsForm.bloodPressureSystolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">BP Diastolic</Label>
                      <Input type="number" value={vitalsForm.bloodPressureDiastolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Heart rate</Label>
                      <Input type="number" value={vitalsForm.heartRate} onChange={(e) => setVitalsForm((f) => ({ ...f, heartRate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Resp rate</Label>
                      <Input type="number" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm((f) => ({ ...f, respiratoryRate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">SpO2 (%)</Label>
                      <Input type="number" value={vitalsForm.oxygenSaturation} onChange={(e) => setVitalsForm((f) => ({ ...f, oxygenSaturation: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Weight (kg)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.weight} onChange={(e) => setVitalsForm((f) => ({ ...f, weight: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height (cm)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.height} onChange={(e) => setVitalsForm((f) => ({ ...f, height: e.target.value }))} />
                    </div>
                  </div>
                  <Button type="submit" disabled={recordVitalsMutation.isPending}>
                    {recordVitalsMutation.isPending ? "Recording..." : "Record vitals"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          {vitalsList.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Recent vitals</h4>
              <div className="space-y-2">
                {vitalsList.slice(0, 5).map((v) => (
                  <Card key={v.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {canAddNote ? (
                          <button
                            type="button"
                            className="text-primary underline underline-offset-2 hover:no-underline font-medium text-left"
                            onClick={() => {
                              setEditVitals(v);
                              const d = v.recordedAt ? new Date(v.recordedAt) : new Date();
                              const recordedAtStr = format(d, "yyyy-MM-dd") + "T" + format(d, "HH:mm");
                              setEditVitalsForm({
                                temperature: v.temperature != null ? String(v.temperature) : "",
                                bloodPressureSystolic: v.bloodPressureSystolic != null ? String(v.bloodPressureSystolic) : "",
                                bloodPressureDiastolic: v.bloodPressureDiastolic != null ? String(v.bloodPressureDiastolic) : "",
                                heartRate: v.heartRate != null ? String(v.heartRate) : "",
                                respiratoryRate: v.respiratoryRate != null ? String(v.respiratoryRate) : "",
                                oxygenSaturation: v.oxygenSaturation != null ? String(v.oxygenSaturation) : "",
                                weight: v.weight != null ? String(v.weight) : "",
                                height: v.height != null ? String(v.height) : "",
                                recordedAt: recordedAtStr,
                              });
                              setEditVitalsOpen(true);
                            }}
                          >
                            {v.recordedAt ? format(new Date(v.recordedAt), "MMM d, yyyy HH:mm") : "Edit vitals"}
                          </button>
                        ) : v.recordedAt ? (
                          <span className="text-muted-foreground">{format(new Date(v.recordedAt), "MMM d, yyyy HH:mm")}</span>
                        ) : null}
                        {v.temperature != null && <span>Temp: {v.temperature} °C</span>}
                        {(v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null) && (
                          <span>BP: {v.bloodPressureSystolic ?? "—"} / {v.bloodPressureDiastolic ?? "—"}</span>
                        )}
                        {v.heartRate != null && <span>HR: {v.heartRate}</span>}
                        {v.respiratoryRate != null && <span>RR: {v.respiratoryRate}</span>}
                        {v.oxygenSaturation != null && <span>SpO2: {v.oxygenSaturation}%</span>}
                        {v.weight != null && <span>Weight: {v.weight} kg</span>}
                        {v.height != null && <span>Height: {v.height} cm</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <Dialog open={editVitalsOpen} onOpenChange={(open) => { setEditVitalsOpen(open); if (!open) setEditVitals(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit vitals</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editVitals) updateVitalsMutation.mutate({ vitalId: editVitals.id, data: editVitalsForm });
                }}
                className="space-y-4 py-2"
              >
                <div className="space-y-2">
                  <Label>Date & time</Label>
                  <Input
                    type="datetime-local"
                    value={editVitalsForm.recordedAt}
                    onChange={(e) => setEditVitalsForm((f) => ({ ...f, recordedAt: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Temp (°C)</Label>
                    <Input type="number" step="0.1" value={editVitalsForm.temperature} onChange={(e) => setEditVitalsForm((f) => ({ ...f, temperature: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">BP Systolic</Label>
                    <Input type="number" value={editVitalsForm.bloodPressureSystolic} onChange={(e) => setEditVitalsForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">BP Diastolic</Label>
                    <Input type="number" value={editVitalsForm.bloodPressureDiastolic} onChange={(e) => setEditVitalsForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Heart rate</Label>
                    <Input type="number" value={editVitalsForm.heartRate} onChange={(e) => setEditVitalsForm((f) => ({ ...f, heartRate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Resp rate</Label>
                    <Input type="number" value={editVitalsForm.respiratoryRate} onChange={(e) => setEditVitalsForm((f) => ({ ...f, respiratoryRate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">SpO2 (%)</Label>
                    <Input type="number" value={editVitalsForm.oxygenSaturation} onChange={(e) => setEditVitalsForm((f) => ({ ...f, oxygenSaturation: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input type="number" step="0.1" value={editVitalsForm.weight} onChange={(e) => setEditVitalsForm((f) => ({ ...f, weight: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Height (cm)</Label>
                    <Input type="number" step="0.1" value={editVitalsForm.height} onChange={(e) => setEditVitalsForm((f) => ({ ...f, height: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditVitalsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateVitalsMutation.isPending}>
                    {updateVitalsMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="medication" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Medications and prescriptions</span>
            {canOrder && (
              <Button size="sm" onClick={() => setNewMedOrderOpen(true)} data-testid="button-new-med-order">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New Order
              </Button>
            )}
          </div>
          {prescriptions.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No medications on record. {canOrder ? "Use New Order to add a medication." : ""}</CardContent></Card>
          ) : prescriptions.map((rx) => {
            const linkedProblem = (rx as Prescription & { patientProblemId?: string | null }).patientProblemId
              ? problems.find((p) => p.id === (rx as Prescription & { patientProblemId?: string }).patientProblemId)
              : null;
            return (
            <Card key={rx.id} data-testid={`card-rx-${rx.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium">{rx.medicationName} {rx.dosage}</p>
                    <p className="text-xs text-muted-foreground">{rx.frequency}{rx.duration ? ` · ${rx.duration}` : ""}</p>
                    {linkedProblem && (
                      <p className="text-xs text-muted-foreground mt-1">For: {linkedProblem.problem}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[rx.status] || ""}`}>{rx.status}</Badge>
                </div>
                {rx.instructions && <p className="text-sm text-muted-foreground">{rx.instructions}</p>}
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="orders" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Lab and clinical orders</span>
            {canOrder && (
              <Button size="sm" onClick={() => setNewOrderOpen(true)} data-testid="button-new-order">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New Order
              </Button>
            )}
          </div>
          {labOrders.length === 0 && imagingOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No orders. {canOrder ? "Use New Order to add one." : ""}</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {labOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-medium">{order.testName}</p>
                        <p className="text-xs text-muted-foreground">{order.testCode || ""} · {order.priority}{(order as LabOrder & { internalExternal?: string }).internalExternal === "external" ? " · External" : ""}</p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${statusColors[order.status] || ""}`}>{order.status}</Badge>
                    </div>
                    {order.result && <p className="text-sm mt-1">{order.result}</p>}
                  </CardContent>
                </Card>
              ))}
              {imagingOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-medium">{order.title}</p>
                        <p className="text-xs text-muted-foreground">{order.modality}{order.internalExternal === "external" ? " · External" : ""}</p>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${order.status === "resulted" || order.status === "completed" ? "bg-chart-3/10 text-chart-3" : ""}`}>{order.status === "completed" ? "resulted" : order.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Signed clinical notes</span>
            {canAddNote && (
              <Button size="sm" onClick={() => setNewNoteOpen(true)} data-testid="button-new-note">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New Note
              </Button>
            )}
          </div>
          {notes.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No notes. {canAddNote ? "Use New Note to add a signed note." : ""}</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {(note as PatientNote & { noteKind?: string }).noteKind ?? "Progress Note"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {note.authorRole === "nursing" ? "Nursing" : "Clinician"}
                        </Badge>
                        {(note as PatientNote & { status?: string }).status === "edited" && (
                          <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400">Edited</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {note.signedAt ? format(new Date(note.signedAt), "MMM d, yyyy HH:mm") : ""}
                        </span>
                        {canAddNote && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditNoteId(note.id);
                              setEditNoteContent(note.content);
                              setEditNoteOpen(true);
                            }}
                            title="Edit note"
                            data-testid={`button-edit-note-${note.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Tabs defaultValue="medical" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="medical">Medical history</TabsTrigger>
              <TabsTrigger value="family">Family history</TabsTrigger>
              <TabsTrigger value="social">Social history</TabsTrigger>
            </TabsList>
            <TabsContent value="medical" className="space-y-3 mt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Current and past problems</span>
                {canAddNote && (
                  <Button size="sm" variant="outline" onClick={() => setAddPastProblemOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add past problem
                  </Button>
                )}
              </div>
              {(() => {
                const current = problems.filter((p) => p.status !== "past");
                const past = problems.filter((p) => p.status === "past");
                return (
                  <div className="space-y-4">
                    {current.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Current problems</p>
                        <ul className="space-y-2">
                          {current.map((p) => (
                            <Card key={p.id}><CardContent className="py-3"><span className="text-sm">{p.problem}</span></CardContent></Card>
                          ))}
                        </ul>
                      </div>
                    )}
                    {past.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Past problems</p>
                        <ul className="space-y-2">
                          {past.map((p) => {
                            const startDate = (p as PatientProblem & { problemStartDate?: string | null }).problemStartDate;
                            const resolution = (p as PatientProblem & { resolution?: string | null }).resolution;
                            const sym = (p as PatientProblem & { symptoms?: string | null }).symptoms;
                            return (
                              <Card key={p.id}>
                                <CardContent className="py-3">
                                  {canAddNote ? (
                                    <button
                                      type="button"
                                      className="text-sm text-primary underline underline-offset-2 hover:no-underline text-left font-medium"
                                      onClick={() => {
                                        setEditProblem(p);
                                        setEditProblemForm({
                                          problem: p.problem,
                                          problemStartDate: startDate ? String(startDate).slice(0, 10) : "",
                                          symptoms: sym ? String(sym) : "",
                                          resolution: (resolution === "current" ? "current" : "resolved") as "current" | "resolved",
                                        });
                                        setEditProblemOpen(true);
                                      }}
                                    >
                                      {p.problem}
                                    </button>
                                  ) : (
                                    <span className="text-sm">{p.problem}</span>
                                  )}
                                  {(startDate || resolution || sym) && (
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                      {startDate && <p>Started: {format(new Date(startDate), "MMM d, yyyy")}</p>}
                                      {resolution && <p>{resolution === "current" ? "Still current" : "Resolved"}</p>}
                                      {sym && <p className="whitespace-pre-wrap">Symptoms: {sym}</p>}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {current.length === 0 && past.length === 0 && (
                      <Card><CardContent className="p-8 text-center text-muted-foreground">No current or past problems recorded. {canAddNote ? "Add a past problem above." : ""}</CardContent></Card>
                    )}
                  </div>
                );
              })()}
            </TabsContent>
            <TabsContent value="family" className="space-y-3 mt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Family members and inherited/familial conditions</span>
                {canAddNote && (
                  <Button size="sm" onClick={() => setAddFamilyMemberOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add family member
                  </Button>
                )}
              </div>
              {familyHistoryLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : familyMembersList.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No family members added. {canAddNote ? "Add a family member to record conditions." : ""}</CardContent></Card>
              ) : (
                <div className="space-y-4">
                  {familyMembersList.map((member) => {
                    const conditions = familyConditionsList.filter((c) => c.familyMemberId === member.id);
                    return (
                      <Card key={member.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="font-medium">{member.relationship}</p>
                            {canAddNote && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAddConditionFamilyMember(member);
                                  setNewConditionSelect("");
                                  setNewConditionOther("");
                                  setNewConditionNotes("");
                                  setAddConditionOpen(true);
                                }}
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add condition
                              </Button>
                            )}
                          </div>
                          {conditions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No conditions recorded</p>
                          ) : (
                            <ul className="space-y-1">
                              {conditions.map((c) => (
                                <li key={c.id} className="text-sm flex items-center gap-2">
                                  <span>{c.condition}</span>
                                  {c.notes && <span className="text-muted-foreground">— {c.notes}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="social" className="mt-4">
              <Card><CardContent className="p-8 text-center text-muted-foreground">Social history. Records can be added when this section is enabled.</CardContent></Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="immunization" className="mt-4">
          <Card><CardContent className="p-8 text-center text-muted-foreground">Immunization history. Records can be added when immunization tracking is enabled.</CardContent></Card>
        </TabsContent>

        <TabsContent value="allergy" className="space-y-4 mt-4 data-[state=inactive]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Known allergies and intolerances. HIGH severity allergies appear in red in the demographics section.</span>
            {canAddNote && (
              <Button onClick={() => setNewAllergyOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> New Allergy
              </Button>
            )}
          </div>
          <Dialog open={newAllergyOpen} onOpenChange={setNewAllergyOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Allergy</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Allergen</Label>
                  <Popover open={allergenSuggestOpen} onOpenChange={setAllergenSuggestOpen}>
                    <PopoverTrigger asChild>
                      <div className="relative">
                        <Input
                          value={newAllergyForm.allergen}
                          onChange={(e) => setNewAllergyForm((f) => ({ ...f, allergen: e.target.value }))}
                          onFocus={() => setAllergenSuggestOpen(true)}
                          placeholder="Search or type allergen (e.g. Penicillin, Peanuts)"
                        />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      {allergenSuggestLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : allergenSuggestions.length > 0 ? (
                        <ul className="max-h-[200px] overflow-auto py-1">
                          {allergenSuggestions.map((s) => (
                            <li key={s}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted outline-none"
                                onClick={() => {
                                  setNewAllergyForm((f) => ({ ...f, allergen: s }));
                                  setAllergenSuggestOpen(false);
                                }}
                              >
                                {s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : newAllergyForm.allergen.trim().length >= 2 ? (
                        <p className="py-4 px-3 text-sm text-muted-foreground text-center">No suggestions. You can enter your own.</p>
                      ) : null}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select
                    value={newAllergyForm.severity}
                    onValueChange={(v) => setNewAllergyForm((f) => ({ ...f, severity: v as "LOW" | "MEDIUM" | "HIGH" }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reaction type</Label>
                  <Select
                    value={newAllergyForm.reactionType}
                    onValueChange={(v) => setNewAllergyForm((f) => ({ ...f, reactionType: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALLERGY_REACTION_TYPES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newAllergyForm.reactionType === "Other" && (
                    <div className="pt-1">
                      <Label className="text-xs text-muted-foreground">Describe reaction (optional)</Label>
                      <Input
                        value={newAllergyForm.reactionTypeOther}
                        onChange={(e) => setNewAllergyForm((f) => ({ ...f, reactionTypeOther: e.target.value }))}
                        placeholder="e.g. Swelling of lips, nausea"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewAllergyOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    const reactionType =
                      newAllergyForm.reactionType === "Other" && newAllergyForm.reactionTypeOther.trim()
                        ? newAllergyForm.reactionTypeOther.trim()
                        : newAllergyForm.reactionType === "Not specified"
                          ? undefined
                          : newAllergyForm.reactionType;
                    addAllergyMutation.mutate({
                      allergen: newAllergyForm.allergen.trim(),
                      severity: newAllergyForm.severity,
                      reactionType,
                    });
                  }}
                  disabled={!newAllergyForm.allergen.trim() || addAllergyMutation.isPending}
                >
                  {addAllergyMutation.isPending ? "Adding..." : "Add allergy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {patientAllergies.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Documented allergies</h4>
              <ul className="space-y-2">
                {patientAllergies.map((a) => (
                  <Card key={a.id} className={a.severity === "HIGH" ? "border-destructive/50" : ""}>
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.severity === "HIGH" && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                        <span className={a.severity === "HIGH" ? "text-destructive font-medium" : ""}>{a.allergen}</span>
                        <Badge variant={a.severity === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">{a.severity}</Badge>
                        {a.reactionType && (
                          <span className="text-xs text-muted-foreground">{a.reactionType}</span>
                        )}
                      </div>
                      {canAddNote && (
                        <Button size="sm" variant="ghost" onClick={() => deleteAllergyMutation.mutate(a.id)} disabled={deleteAllergyMutation.isPending}>Remove</Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </ul>
            </div>
          ) : null}
          {patient?.allergies && patientAllergies.length === 0 && (
            <Card className="border-muted">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Legacy allergies (from patient record)</p>
                <p className="text-sm whitespace-pre-wrap">{patient.allergies}</p>
                <p className="text-xs text-muted-foreground mt-2">Add allergies above with severity so HIGH severity ones show in the demographics section.</p>
              </CardContent>
            </Card>
          )}
          {patientAllergies.length === 0 && !patient?.allergies && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No allergies documented. {canAddNote ? "Add an allergy above." : ""}</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4 mt-4 data-[state=inactive]:hidden">
          <Tabs defaultValue="labs" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="labs" className="gap-2"><FlaskConical className="w-3.5 h-3.5" /> Labs</TabsTrigger>
              <TabsTrigger value="imaging" className="gap-2"><ImageIcon className="w-3.5 h-3.5" /> Imaging</TabsTrigger>
            </TabsList>
            <TabsContent value="labs" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">Completed lab results appear here once resulted in the Laboratory or uploaded via Upload Results.</p>
              {labOrders.filter((o) => o.status === "resulted" || o.status === "completed").length === 0 && patientDocuments.filter((d) => d.documentType === "lab_result").length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No lab results yet. Lab orders are resulted in Laboratory or upload external results via Upload Results.</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {labOrders.filter((o) => o.status === "resulted" || o.status === "completed").map((order) => (
                    <Card key={order.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-medium">{order.testName}</p>
                            <p className="text-xs text-muted-foreground">{order.testCode || ""} · Resulted {order.completedAt ? format(new Date(order.completedAt), "MMM d, yyyy") : ""}</p>
                          </div>
                          {order.isCritical && <Badge variant="destructive" className="text-[10px]">Critical</Badge>}
                        </div>
                        {order.result && <p className="text-sm mt-1">{order.result}</p>}
                        {order.resultValue && <p className="text-xs text-muted-foreground mt-1">Values: {order.resultValue}</p>}
                        {order.referenceRange && <p className="text-xs text-muted-foreground">Ref: {order.referenceRange}</p>}
                        {(order as LabOrder & { documentUrl?: string }).documentUrl && (
                          <a href={(order as LabOrder & { documentUrl?: string }).documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">View document</a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {patientDocuments.filter((d) => d.documentType === "lab_result").map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="p-5">
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">Uploaded lab result</p>
                        {doc.documentUrl && (
                          <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">View document</a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="imaging" className="space-y-3 mt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Scans and uploaded imaging (X-Ray, CT, MRI, etc.)</span>
                {canOrder && (
                  <Button size="sm" onClick={() => setNewImagingOpen(true)} data-testid="button-new-imaging">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Upload / Add imaging
                  </Button>
                )}
              </div>
              {imagingResults.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No imaging results. Use Upload / Add imaging to attach a scan or document.</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {imagingResults.map((img) => (
                    <Card key={img.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-medium">{img.title}</p>
                          <Badge variant="secondary" className="text-[10px]">{img.modality}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{img.performedAt ? format(new Date(img.performedAt), "MMM d, yyyy") : ""}</p>
                        {img.description && <p className="text-sm mt-2">{img.description}</p>}
                        {img.documentUrl && (
                          <a href={img.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">View document</a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
          </div>
        </div>
      </Tabs>

      <Dialog open={addProblemOpen} onOpenChange={(open) => { if (!open) { setNewProblemStartDate(""); setNewProblemSymptoms(""); } setAddProblemOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Problem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Problem description</Label>
              <Input
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                placeholder="e.g. Hypertension, Type 2 diabetes"
                data-testid="input-problem"
              />
            </div>
            <div className="space-y-2">
              <Label>Date problem started</Label>
              <Input
                type="date"
                value={newProblemStartDate}
                onChange={(e) => setNewProblemStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Symptoms</Label>
              <Textarea
                value={newProblemSymptoms}
                onChange={(e) => setNewProblemSymptoms(e.target.value)}
                placeholder="Describe symptoms the patient is having..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddProblemOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addProblemMutation.mutate({
                problem: newProblem,
                status: "active",
                problemStartDate: newProblemStartDate.trim() || undefined,
                symptoms: newProblemSymptoms.trim() || undefined,
              })}
              disabled={!newProblem.trim() || addProblemMutation.isPending}
              data-testid="button-submit-problem"
            >
              {addProblemMutation.isPending ? "Adding..." : "Add Problem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPastProblemOpen} onOpenChange={(open) => { setAddPastProblemOpen(open); if (!open) { setNewPastProblemStartDate(""); setNewPastProblemResolution("resolved"); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add past problem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Past problem description</Label>
              <Input
                value={newPastProblem}
                onChange={(e) => setNewPastProblem(e.target.value)}
                placeholder="e.g. Resolved UTI, Childhood asthma"
              />
            </div>
            <div className="space-y-2">
              <Label>Date problem started</Label>
              <Input
                type="date"
                value={newPastProblemStartDate}
                onChange={(e) => setNewPastProblemStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={newPastProblemResolution} onValueChange={(v) => setNewPastProblemResolution(v as "current" | "resolved")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Still current</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddPastProblemOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addProblemMutation.mutate({
                problem: newPastProblem,
                status: "past",
                problemStartDate: newPastProblemStartDate.trim() || undefined,
                resolution: newPastProblemResolution,
              })}
              disabled={!newPastProblem.trim() || addProblemMutation.isPending}
            >
              {addProblemMutation.isPending ? "Adding..." : "Add past problem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editProblemOpen} onOpenChange={(open) => { if (!open) { setEditProblem(null); setEditProblemForm({ problem: "", problemStartDate: "", symptoms: "", resolution: "resolved" }); } setEditProblemOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit problem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Problem description</Label>
              <Input
                value={editProblemForm.problem}
                onChange={(e) => setEditProblemForm((f) => ({ ...f, problem: e.target.value }))}
                placeholder="e.g. Hypertension"
              />
            </div>
            <div className="space-y-2">
              <Label>Date problem started</Label>
              <Input
                type="date"
                value={editProblemForm.problemStartDate}
                onChange={(e) => setEditProblemForm((f) => ({ ...f, problemStartDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Symptoms</Label>
              <Textarea
                value={editProblemForm.symptoms}
                onChange={(e) => setEditProblemForm((f) => ({ ...f, symptoms: e.target.value }))}
                placeholder="Symptoms the patient is having..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editProblemForm.resolution} onValueChange={(v) => setEditProblemForm((f) => ({ ...f, resolution: v as "current" | "resolved" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Still current</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditProblemOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editProblem && updateProblemMutation.mutate({
                problemId: editProblem.id,
                problem: editProblemForm.problem,
                problemStartDate: editProblemForm.problemStartDate.trim() || undefined,
                symptoms: editProblemForm.symptoms,
                resolution: editProblemForm.resolution,
                status: editProblemForm.resolution === "resolved" ? "past" : undefined,
              })}
              disabled={!editProblem || !editProblemForm.problem.trim() || updateProblemMutation.isPending}
            >
              {updateProblemMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addFamilyMemberOpen} onOpenChange={setAddFamilyMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add family member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select value={newFamilyRelationship} onValueChange={setNewFamilyRelationship}>
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {FAMILY_RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newFamilyRelationship === "Other" && (
              <div className="space-y-2">
                <Label>Specify relationship</Label>
                <Input
                  value={newFamilyRelationshipOther}
                  onChange={(e) => setNewFamilyRelationshipOther(e.target.value)}
                  placeholder="e.g. Grandmother, Uncle"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddFamilyMemberOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addFamilyMemberMutation.mutate(newFamilyRelationship === "Other" ? newFamilyRelationshipOther.trim() : newFamilyRelationship)}
              disabled={
                !newFamilyRelationship ||
                (newFamilyRelationship === "Other" ? !newFamilyRelationshipOther.trim() : false) ||
                addFamilyMemberMutation.isPending
              }
            >
              {addFamilyMemberMutation.isPending ? "Adding..." : "Add family member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addConditionOpen} onOpenChange={(open) => { if (!open) setAddConditionFamilyMember(null); setAddConditionOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add condition for {addConditionFamilyMember?.relationship}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={newConditionSelect} onValueChange={setNewConditionSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_INHERITED_CONDITIONS_AFRICA.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newConditionSelect === "Other" && (
              <div className="space-y-2">
                <Label>Specify condition</Label>
                <Input
                  value={newConditionOther}
                  onChange={(e) => setNewConditionOther(e.target.value)}
                  placeholder="Enter condition"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={newConditionNotes}
                onChange={(e) => setNewConditionNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddConditionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addConditionFamilyMember && addFamilyConditionMutation.mutate({
                familyMemberId: addConditionFamilyMember.id,
                condition: newConditionSelect === "Other" ? newConditionOther.trim() : newConditionSelect,
                notes: newConditionNotes.trim() || undefined,
              })}
              disabled={
                !addConditionFamilyMember ||
                !newConditionSelect ||
                (newConditionSelect === "Other" ? !newConditionOther.trim() : false) ||
                addFamilyConditionMutation.isPending
              }
            >
              {addFamilyConditionMutation.isPending ? "Adding..." : "Add condition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newNoteOpen} onOpenChange={(open) => { setNewNoteOpen(open); if (!open) setNewNoteType("Progress Note"); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Note</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">This will be saved and signed as {user?.role === "nurse" ? "Nursing note" : "Clinician note"}.</p>
          <div className="space-y-2">
            <Label>Note type</Label>
            <div className="flex flex-wrap gap-2">
              {NOTE_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={newNoteType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewNoteType(type)}
                  data-testid={`note-type-${type.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Note content</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={noteAiLoading}
                onClick={handleAiSuggestNote}
                className="gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {noteAiLoading ? "Improving..." : "Improve with AI"}
              </Button>
            </div>
            <div className="relative w-full rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Enter note content... Use the microphone to dictate."
                rows={6}
                className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pr-12 pb-12 min-h-0"
                data-testid="input-note-content"
              />
              <Button
                type="button"
                variant={noteListening ? "default" : "outline"}
                size="icon"
                className="absolute bottom-2 right-2 h-9 w-9 rounded-full shrink-0"
                onClick={toggleNoteDictation}
                title={noteListening ? "Stop dictation" : "Start dictation"}
                data-testid="button-note-dictation"
              >
                <Mic className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewNoteOpen(false)}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate({ content: newNoteContent, noteKind: newNoteType })} disabled={!newNoteContent.trim() || addNoteMutation.isPending} data-testid="button-sign-note">
              {addNoteMutation.isPending ? "Signing..." : "Sign & Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editNoteOpen} onOpenChange={(open) => { setEditNoteOpen(open); if (!open) { setEditNoteId(null); setEditNoteContent(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit note</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Changes will be saved and the note status will be set to Edited.</p>
          <div className="space-y-2">
            <Label>Note content</Label>
            <Textarea
              value={editNoteContent}
              onChange={(e) => setEditNoteContent(e.target.value)}
              placeholder="Enter note content..."
              rows={6}
              className="resize-none"
              data-testid="input-edit-note-content"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setEditNoteOpen(false); setEditNoteId(null); setEditNoteContent(""); }}>Cancel</Button>
            <Button
              onClick={() => editNoteId && updateNoteMutation.mutate({ noteId: editNoteId, content: editNoteContent })}
              disabled={!editNoteContent.trim() || updateNoteMutation.isPending || !editNoteId}
              data-testid="button-save-edited-note"
            >
              {updateNoteMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newOrderOpen} onOpenChange={(open) => { setNewOrderOpen(open); if (!open) setOrderComposerType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {orderComposerType === null ? "New Order" : orderComposerType === "lab" ? "New lab order" : orderComposerType === "imaging" ? "New imaging order" : "New medication order"}
            </DialogTitle>
          </DialogHeader>
          {orderComposerType === null ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Choose the type of order to place.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("lab")}>
                  <span className="font-medium">Lab order</span>
                  <span className="text-xs text-muted-foreground">Blood tests, cultures, etc.</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("imaging")}>
                  <span className="font-medium">Imaging order</span>
                  <span className="text-xs text-muted-foreground">X-Ray, CT, MRI, etc.</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("medication")}>
                  <span className="font-medium">Medication order</span>
                  <span className="text-xs text-muted-foreground">Prescribe a medication</span>
                </Button>
              </div>
            </div>
          ) : orderComposerType === "lab" ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Test *</Label>
                  <Select
                    value={COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === newOrderForm.testName && t.testCode === newOrderForm.testCode) ? newOrderForm.testName : "other"}
                    onValueChange={(v) => {
                      if (v === "other") {
                        setNewOrderForm((f) => ({ ...f, testName: "", testCode: "" }));
                      } else {
                        const t = COMMON_LAB_TESTS_AFRICA.find((x) => x.testName === v);
                        if (t) setNewOrderForm((f) => ({ ...f, testName: t.testName, testCode: t.testCode }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select common lab test" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_LAB_TESTS_AFRICA.map((t) => (
                        <SelectItem key={t.testCode} value={t.testName}>{t.testName}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(newOrderForm.testName === "" || !COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === newOrderForm.testName)) && (
                  <>
                    <div className="space-y-2">
                      <Label>Test name</Label>
                      <Input
                        value={newOrderForm.testName}
                        onChange={(e) => setNewOrderForm((f) => ({ ...f, testName: e.target.value }))}
                        placeholder="e.g. CBC, BMP"
                        data-testid="input-order-test-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Test code</Label>
                      <Input
                        value={newOrderForm.testCode}
                        onChange={(e) => setNewOrderForm((f) => ({ ...f, testCode: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3"
                    value={newOrderForm.priority}
                    onChange={(e) => setNewOrderForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">Stat</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Where will this be done?</Label>
                  <Select
                    value={newOrderForm.internalExternal}
                    onValueChange={(v) => setNewOrderForm((f) => ({ ...f, internalExternal: v as "internal" | "external" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal (in-facility lab)</SelectItem>
                      <SelectItem value="external">External (outside lab)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addOrderMutation.mutate(newOrderForm)}
                  disabled={!newOrderForm.testName.trim() || addOrderMutation.isPending}
                  data-testid="button-submit-order"
                >
                  {addOrderMutation.isPending ? "Creating..." : "Create lab order"}
                </Button>
              </DialogFooter>
            </>
          ) : orderComposerType === "imaging" ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Associated problem</Label>
                  <Select
                    value={newImagingOrderForm.patientProblemId || "none"}
                    onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select problem (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.filter((p) => p.status !== "past").map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Link this imaging order to an active problem</p>
                </div>
                <div className="space-y-2">
                  <Label>Imaging study *</Label>
                  <Select
                    value={COMMON_IMAGING_AFRICA.some((i) => i.title === newImagingOrderForm.title && i.modality === newImagingOrderForm.modality) ? newImagingOrderForm.title : "other"}
                    onValueChange={(v) => {
                      if (v === "other") {
                        setNewImagingOrderForm((f) => ({ ...f, title: "", modality: "X-Ray" }));
                      } else {
                        const item = COMMON_IMAGING_AFRICA.find((x) => x.title === v);
                        if (item) setNewImagingOrderForm((f) => ({ ...f, title: item.title, modality: item.modality }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select common imaging" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_IMAGING_AFRICA.filter((i) => i.title !== "Other").map((item) => (
                        <SelectItem key={item.title} value={item.title}>{item.title} ({item.modality})</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(!newImagingOrderForm.title || !COMMON_IMAGING_AFRICA.some((i) => i.title === newImagingOrderForm.title)) && (
                  <>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newImagingOrderForm.title}
                        onChange={(e) => setNewImagingOrderForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Chest X-Ray"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Modality</Label>
                      <Select
                        value={newImagingOrderForm.modality}
                        onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, modality: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="X-Ray">X-Ray</SelectItem>
                          <SelectItem value="CT">CT</SelectItem>
                          <SelectItem value="MRI">MRI</SelectItem>
                          <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Where will this be done?</Label>
                  <Select
                    value={newImagingOrderForm.internalExternal}
                    onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, internalExternal: v as "internal" | "external" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal (in-facility)</SelectItem>
                      <SelectItem value="external">External (outside facility)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addImagingOrderMutation.mutate(newImagingOrderForm)}
                  disabled={!newImagingOrderForm.title.trim() || addImagingOrderMutation.isPending}
                  data-testid="button-submit-imaging-order"
                >
                  {addImagingOrderMutation.isPending ? "Creating..." : "Create imaging order"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Associated problem</Label>
                  <Select
                    value={newMedOrderForm.patientProblemId || "none"}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select problem (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.filter((p) => p.status !== "past").map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Link this order to a problem on the patient&apos;s list</p>
                </div>
                <div className="space-y-2">
                  <Label>Medication name *</Label>
                  <Select
                    value={COMMON_MEDICATIONS_AFRICA.includes(newMedOrderForm.medicationName) ? newMedOrderForm.medicationName : (newMedOrderForm.medicationName ? "other" : "")}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, medicationName: v === "other" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select or type below" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_MEDICATIONS_AFRICA.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newMedOrderForm.medicationName}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, medicationName: e.target.value }))}
                    placeholder="e.g. Amoxicillin"
                    data-testid="input-med-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dose *</Label>
                    <Select
                      value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? newMedOrderForm.dosage : "Other"}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, dosage: v === "Other" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dose" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOSE_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!newMedOrderForm.dosage || newMedOrderForm.dosage === "Other" || !DOSE_OPTIONS.includes(newMedOrderForm.dosage as any)) && (
                      <Input
                        value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? "" : newMedOrderForm.dosage}
                        onChange={(e) => setNewMedOrderForm((f) => ({ ...f, dosage: e.target.value }))}
                        placeholder="e.g. 500mg"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency *</Label>
                    <Select
                      value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? newMedOrderForm.frequency : "Other"}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, frequency: v === "Other" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((fr) => (
                          <SelectItem key={fr} value={fr}>{fr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!newMedOrderForm.frequency || newMedOrderForm.frequency === "Other" || !FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any)) && (
                      <Input
                        value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? "" : newMedOrderForm.frequency}
                        onChange={(e) => setNewMedOrderForm((f) => ({ ...f, frequency: e.target.value }))}
                        placeholder="e.g. twice daily"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select
                    value={DURATION_OPTIONS.includes(newMedOrderForm.duration as any) ? newMedOrderForm.duration : (newMedOrderForm.duration ? "Other" : "none")}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, duration: v === "Other" || v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {DURATION_OPTIONS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(newMedOrderForm.duration && !DURATION_OPTIONS.includes(newMedOrderForm.duration as any)) && (
                    <Input
                      value={newMedOrderForm.duration}
                      onChange={(e) => setNewMedOrderForm((f) => ({ ...f, duration: e.target.value }))}
                      placeholder="e.g. 7 days"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    value={newMedOrderForm.instructions}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder="Take with food, etc."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addPrescriptionMutation.mutate(newMedOrderForm)}
                  disabled={!newMedOrderForm.medicationName.trim() || !newMedOrderForm.dosage.trim() || !newMedOrderForm.frequency.trim() || addPrescriptionMutation.isPending}
                  data-testid="button-submit-med-order"
                >
                  {addPrescriptionMutation.isPending ? "Creating..." : "Create order"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newMedOrderOpen} onOpenChange={setNewMedOrderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New medication order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Associated problem</Label>
              <Select
                value={newMedOrderForm.patientProblemId || "none"}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select problem (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {problems.filter((p) => p.status !== "past").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Link this order to a problem on the patient&apos;s list</p>
            </div>
            <div className="space-y-2">
              <Label>Medication name *</Label>
              <Select
                value={COMMON_MEDICATIONS_AFRICA.includes(newMedOrderForm.medicationName) ? newMedOrderForm.medicationName : (newMedOrderForm.medicationName ? "other" : "")}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, medicationName: v === "other" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select or type below" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_MEDICATIONS_AFRICA.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="other">Other (enter below)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newMedOrderForm.medicationName}
                onChange={(e) => setNewMedOrderForm((f) => ({ ...f, medicationName: e.target.value }))}
                placeholder="e.g. Amoxicillin"
                data-testid="input-med-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dose *</Label>
                <Select
                  value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? newMedOrderForm.dosage : "Other"}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, dosage: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dose" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!newMedOrderForm.dosage || newMedOrderForm.dosage === "Other" || !DOSE_OPTIONS.includes(newMedOrderForm.dosage as any)) && (
                  <Input
                    value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? "" : newMedOrderForm.dosage}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, dosage: e.target.value }))}
                    placeholder="e.g. 500mg"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Frequency *</Label>
                <Select
                  value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? newMedOrderForm.frequency : "Other"}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, frequency: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((fr) => (
                      <SelectItem key={fr} value={fr}>{fr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!newMedOrderForm.frequency || newMedOrderForm.frequency === "Other" || !FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any)) && (
                  <Input
                    value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? "" : newMedOrderForm.frequency}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, frequency: e.target.value }))}
                    placeholder="e.g. twice daily"
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select
                value={DURATION_OPTIONS.includes(newMedOrderForm.duration as any) ? newMedOrderForm.duration : (newMedOrderForm.duration ? "Other" : "none")}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, duration: v === "Other" || v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(newMedOrderForm.duration && !DURATION_OPTIONS.includes(newMedOrderForm.duration as any)) && (
                <Input
                  value={newMedOrderForm.duration}
                  onChange={(e) => setNewMedOrderForm((f) => ({ ...f, duration: e.target.value }))}
                  placeholder="e.g. 7 days"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={newMedOrderForm.instructions}
                onChange={(e) => setNewMedOrderForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Take with food, etc."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewMedOrderOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addPrescriptionMutation.mutate(newMedOrderForm)}
              disabled={!newMedOrderForm.medicationName.trim() || !newMedOrderForm.dosage.trim() || !newMedOrderForm.frequency.trim() || addPrescriptionMutation.isPending}
              data-testid="button-submit-med-order"
            >
              {addPrescriptionMutation.isPending ? "Creating..." : "Create order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newImagingOpen} onOpenChange={setNewImagingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload / Add imaging result</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Modality *</Label>
              <Select
                value={newImagingForm.modality}
                onValueChange={(v) => setNewImagingForm((f) => ({ ...f, modality: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="X-Ray">X-Ray</SelectItem>
                  <SelectItem value="CT">CT</SelectItem>
                  <SelectItem value="MRI">MRI</SelectItem>
                  <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newImagingForm.title}
                onChange={(e) => setNewImagingForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chest X-Ray, Abdominal ultrasound"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newImagingForm.description}
                onChange={(e) => setNewImagingForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Findings or notes"
                rows={2}
                className="resize-none"
              />
            </div>
            <DocumentFileUpload
              value={newImagingForm.documentUrl}
              onChange={(url) => setNewImagingForm((f) => ({ ...f, documentUrl: url ?? "" }))}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewImagingOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addImagingMutation.mutate(newImagingForm)}
              disabled={!newImagingForm.title.trim() || addImagingMutation.isPending}
              data-testid="button-submit-imaging"
            >
              {addImagingMutation.isPending ? "Adding..." : "Add imaging result"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
