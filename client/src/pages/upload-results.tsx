import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Upload, FileText, ImageIcon, FlaskConical, User } from "lucide-react";
import { DocumentFileUpload } from "@/components/document-file-upload";
import type { Patient, LabOrder } from "@shared/schema";

const DEBOUNCE_MS = 300;

export default function UploadResultsPage() {
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const authToken = token ?? (typeof localStorage !== "undefined" ? localStorage.getItem("ehr_token") : null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [docType, setDocType] = useState<"lab_result" | "imaging" | "patient_document" | null>(null);
  const [labOrderId, setLabOrderId] = useState<string>("");
  const [form, setForm] = useState({
    title: "",
    result: "",
    resultValue: "",
    referenceRange: "",
    documentUrl: "",
    modality: "X-Ray",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/patients?search=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, authToken]);

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: ["/api/lab-orders", `?patientId=${selectedPatient?.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/lab-orders?patientId=${selectedPatient!.id}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedPatient?.id && docType === "lab_result",
  });

  const pendingLabOrders = labOrders.filter((o) => o.status !== "resulted" && o.status !== "completed" && o.status !== "cancelled");

  const updateLabMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/lab-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders"] });
      toast({ title: "Lab result uploaded; order marked complete" });
      resetAndGoBack();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createDocMutation = useMutation({
    mutationFn: async (payload: { patientId: string; documentType: "lab_result" | "imaging" | "patient_document"; title: string; documentUrl?: string; labOrderId?: string }) => {
      const res = await fetch("/api/patient-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ ...payload, uploadedBy: user?.id }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patient-documents"] });
      toast({ title: "Document uploaded" });
      resetAndGoBack();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createImagingMutation = useMutation({
    mutationFn: async (payload: { patientId: string; title: string; modality: string; documentUrl?: string }) => {
      const res = await fetch("/api/imaging-results", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ ...payload, uploadedBy: user?.id }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imaging-results"] });
      toast({ title: "Imaging result uploaded" });
      resetAndGoBack();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetAndGoBack() {
    setSelectedPatient(null);
    setDocType(null);
    setLabOrderId("");
    setForm({ title: "", result: "", resultValue: "", referenceRange: "", documentUrl: "", modality: "X-Ray" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    if (docType === "lab_result") {
      if (labOrderId) {
        updateLabMutation.mutate({
          id: labOrderId,
          data: {
            result: form.result,
            resultValue: form.resultValue || undefined,
            referenceRange: form.referenceRange || undefined,
            documentUrl: form.documentUrl || undefined,
            status: "resulted",
            completedAt: new Date().toISOString(),
          },
        });
      } else {
        createDocMutation.mutate({
          patientId: selectedPatient.id,
          documentType: "lab_result",
          title: form.title || "External lab result",
          documentUrl: form.documentUrl || undefined,
        });
      }
    } else if (docType === "imaging") {
      createImagingMutation.mutate({
        patientId: selectedPatient.id,
        title: form.title || "Imaging",
        modality: form.modality,
        documentUrl: form.documentUrl || undefined,
      });
    } else if (docType === "patient_document") {
      createDocMutation.mutate({
        patientId: selectedPatient.id,
        documentType: "patient_document",
        title: form.title || "Patient document",
        documentUrl: form.documentUrl || undefined,
      });
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" data-testid="upload-results-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Results</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload outside lab results, imaging, or patient documents. Search by patient name or MRN.</p>
      </div>

      {!selectedPatient ? (
        <Card>
          <CardHeader>
            <Label className="flex items-center gap-2">
              <Search className="w-4 h-4" /> Find patient (name or MRN)
            </Label>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Patient search (name or MRN)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-md"
              data-testid="upload-results-patient-search"
            />
            {loading && <p className="text-sm text-muted-foreground">Searching...</p>}
            {!loading && query.trim() && results.length === 0 && <p className="text-sm text-muted-foreground">No patients found</p>}
            {results.length > 0 && (
              <ul className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => { setSelectedPatient(p); setQuery(""); setResults([]); }}
                    >
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      <span className="text-muted-foreground font-mono text-xs">MRN: {p.mrn}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : !docType ? (
        <Card>
          <CardHeader>
            <p className="font-medium">{selectedPatient.firstName} {selectedPatient.lastName} · MRN: {selectedPatient.mrn}</p>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>Change patient</Button>
          </CardHeader>
          <CardContent>
            <Label className="text-muted-foreground block mb-3">Select document type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-1" onClick={() => setDocType("lab_result")}>
                <FlaskConical className="w-5 h-5" />
                <span>Lab result</span>
                <span className="text-xs text-muted-foreground font-normal">Outside lab or attach to order</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-1" onClick={() => setDocType("imaging")}>
                <ImageIcon className="w-5 h-5" />
                <span>Imaging</span>
                <span className="text-xs text-muted-foreground font-normal">Scan or report</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-1" onClick={() => setDocType("patient_document")}>
                <FileText className="w-5 h-5" />
                <span>Patient document</span>
                <span className="text-xs text-muted-foreground font-normal">Other document</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <p className="font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</p>
              <p className="text-sm text-muted-foreground">
                {docType === "lab_result" && "Lab result"}
                {docType === "imaging" && "Imaging"}
                {docType === "patient_document" && "Patient document"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDocType(null)}>Back</Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {docType === "lab_result" && (
                <>
                  <div className="space-y-2">
                    <Label>Associate with lab order (optional)</Label>
                    <Select value={labOrderId || "none"} onValueChange={(v) => setLabOrderId(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select if ordered in our clinic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Standalone (external lab only)</SelectItem>
                        {pendingLabOrders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.testName} ({o.testCode || "—"})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">If this result is for a lab we ordered but was done elsewhere, select it. The order will be marked complete and appear in Results.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Result summary</Label>
                    <Textarea value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} className="resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Result values</Label>
                      <Input value={form.resultValue} onChange={(e) => setForm((f) => ({ ...f, resultValue: e.target.value }))} placeholder="e.g. WBC: 7.2" />
                    </div>
                    <div className="space-y-2">
                      <Label>Reference range</Label>
                      <Input value={form.referenceRange} onChange={(e) => setForm((f) => ({ ...f, referenceRange: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}
              {(docType === "imaging" || docType === "patient_document") && (
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Chest X-Ray report" required={docType === "imaging"} />
                </div>
              )}
              {docType === "imaging" && (
                <div className="space-y-2">
                  <Label>Modality</Label>
                  <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}>
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
              )}
              <DocumentFileUpload
                value={form.documentUrl}
                onChange={(url) => setForm((f) => ({ ...f, documentUrl: url ?? "" }))}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setDocType(null)}>Back</Button>
                <Button type="submit" disabled={updateLabMutation.isPending || createDocMutation.isPending || createImagingMutation.isPending}>
                  <Upload className="w-4 h-4 mr-2" />
                  {updateLabMutation.isPending || createDocMutation.isPending || createImagingMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
