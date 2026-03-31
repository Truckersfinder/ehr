import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { apiGetJson, apiPatchJson, apiPostJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { fetchPatientById, searchPatientsByQuery } from "@/lib/patients-api";
import { useAuth } from "@/lib/auth";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Upload, FileText, ImageIcon, FlaskConical, User } from "lucide-react";
import { DocumentFileUpload } from "@/components/document-file-upload";
import { fetchPatientRecordDocumentTypes, patientRecordDocumentTypesQueryKey } from "@/lib/patient-record-document-types-api";
import type { Patient, LabOrder, ImagingOrder } from "@shared/schema";
import { PATIENT_RECORD_DOCUMENT_TYPES, type PatientRecordDocumentTypeOption } from "@shared/patient-record-document-types";

function isExternalOrder(o: { internalExternal?: string | null }) {
  const v = o.internalExternal ?? "internal";
  return String(v).toLowerCase() === "external";
}

const DEBOUNCE_MS = 300;

export default function UploadResultsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const patientIdFromUrl = useMemo(() => params.get("patientId"), [params]);
  const docTypeFromUrl = useMemo(() => params.get("docType"), [params]);
  const labOrderIdFromUrl = useMemo(() => params.get("labOrderId"), [params]);
  const imagingOrderIdFromUrl = useMemo(() => params.get("imagingOrderId"), [params]);
  const titleFromUrl = useMemo(() => params.get("title"), [params]);
  const modalityFromUrl = useMemo(() => params.get("modality"), [params]);

  const { user, token } = useAuth();
  const { toast } = useToast();
  const authToken = token ?? getStoredAuthToken();
  const receptionBackPath = "/patient-follow-up";
  const defaultBackPath = "/upload-results";
  const backPath = user?.role === "reception" ? receptionBackPath : defaultBackPath;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [docType, setDocType] = useState<"lab_result" | "imaging" | "patient_document" | null>(null);
  const [labOrderId, setLabOrderId] = useState<string>("");
  const [imagingOrderId, setImagingOrderId] = useState<string>("");
  const [recordDocumentType, setRecordDocumentType] = useState<string>("");
  const [form, setForm] = useState({
    title: "",
    result: "",
    resultValue: "",
    referenceRange: "",
    documentUrl: "",
    modality: "X-Ray",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const consumedDeepLinkRef = useRef(false);

  /** Pre-select patient when opened from toolbar with ?patientId= */
  useEffect(() => {
    if (!patientIdFromUrl || !authToken) return;
    fetchPatientById(patientIdFromUrl, authToken).then((p) => {
      if (p) {
        setSelectedPatient(p);
        setQuery("");
        setResults([]);
      }
    });
  }, [patientIdFromUrl, authToken]);

  /** Optionally pre-select doc type + order association when linked from follow-up lists. */
  useEffect(() => {
    if (!selectedPatient?.id) return;
    if (!docTypeFromUrl) return;
    if (consumedDeepLinkRef.current) return;
    const dt = String(docTypeFromUrl);
    if (dt !== "lab_result" && dt !== "imaging" && dt !== "patient_document") return;
    consumedDeepLinkRef.current = true;
    // Only auto-set if not already chosen in UI.
    if (docType == null) {
      setDocType(dt as any);
    }
    if (dt === "lab_result" && typeof labOrderIdFromUrl === "string" && labOrderIdFromUrl) {
      setLabOrderId(labOrderIdFromUrl);
    }
    if (dt === "imaging" && typeof imagingOrderIdFromUrl === "string" && imagingOrderIdFromUrl) {
      setImagingOrderId(imagingOrderIdFromUrl);
    }
    if (typeof titleFromUrl === "string" && titleFromUrl) {
      setForm((f) => ({ ...f, title: titleFromUrl }));
    }
    if (dt === "imaging" && typeof modalityFromUrl === "string" && modalityFromUrl) {
      setForm((f) => ({ ...f, modality: modalityFromUrl }));
    }
  }, [selectedPatient?.id, docTypeFromUrl, labOrderIdFromUrl, imagingOrderIdFromUrl, titleFromUrl, modalityFromUrl, docType]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchPatientsByQuery(query.trim(), authToken)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, authToken]);

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: selectedPatient?.id
      ? queryKeys.labOrders.list(selectedPatient.id)
      : (["lab-orders", "upload", "idle"] as const),
    queryFn: () => apiGetJson<LabOrder[]>(`/api/lab-orders?patientId=${selectedPatient!.id}`, authToken),
    enabled: !!selectedPatient?.id && docType === "lab_result",
  });

  const pendingExternalLabOrders = labOrders.filter(
    (o) =>
      isExternalOrder(o) &&
      o.status !== "resulted" &&
      o.status !== "completed" &&
      o.status !== "cancelled",
  );

  const { data: imagingOrders = [] } = useQuery<ImagingOrder[]>({
    queryKey: selectedPatient?.id
      ? queryKeys.imagingOrders.list(selectedPatient.id)
      : (["imaging-orders", "upload", "idle"] as const),
    queryFn: () => apiGetJson<ImagingOrder[]>(`/api/imaging-orders?patientId=${selectedPatient!.id}`, authToken),
    enabled: !!selectedPatient?.id && docType === "imaging",
  });

  /** External imaging orders still awaiting upload / completion */
  const pendingExternalImagingOrders = imagingOrders.filter((o) => isExternalOrder(o) && o.status === "ordered");

  const { data: patientRecordDocumentTypes = [] } = useQuery<PatientRecordDocumentTypeOption[]>({
    queryKey: patientRecordDocumentTypesQueryKey,
    queryFn: () => fetchPatientRecordDocumentTypes(authToken),
    enabled: docType === "patient_document",
    staleTime: 60 * 60 * 1000,
  });
  const availablePatientRecordDocumentTypes =
    patientRecordDocumentTypes.length > 0 ? patientRecordDocumentTypes : PATIENT_RECORD_DOCUMENT_TYPES;

  /** When an external imaging order is chosen, prefill title and modality from the order */
  useEffect(() => {
    if (docType !== "imaging" || !imagingOrderId) return;
    const o = imagingOrders.find((x) => x.id === imagingOrderId);
    if (o) {
      setForm((f) => ({ ...f, title: o.title, modality: o.modality }));
    }
  }, [docType, imagingOrderId, imagingOrders]);

  const updateLabMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return apiPatchJson(`/api/lab-orders/${id}`, data, authToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labOrders.root });
      toast({ title: "Lab result uploaded; order marked complete" });
      resetAndGoBack();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createDocMutation = useMutation({
    mutationFn: async (payload: {
      patientId: string;
      documentType: "lab_result" | "imaging" | "patient_document";
      title: string;
      documentUrl?: string;
      labOrderId?: string;
      recordDocumentType?: string;
    }) => {
      return apiPostJson("/api/patient-documents", { ...payload, uploadedBy: user?.id }, authToken);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patientDocuments.root });
      queryClient.invalidateQueries({
        queryKey: queryKeys.patientDocuments.list(variables.patientId),
      });
      toast({ title: "Document uploaded" });
      resetAndGoBack();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateImagingOrderMutation = useMutation({
    mutationFn: async (payload: { id: string; status: "completed"; completedAt: string; documentUrl?: string }) => {
      const { id, ...body } = payload;
      return apiPatchJson(`/api/imaging-orders/${id}`, body, authToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imagingOrders.root });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetAndGoBack() {
    setSelectedPatient(null);
    setDocType(null);
    setLabOrderId("");
    setImagingOrderId("");
    setRecordDocumentType("");
    setForm({ title: "", result: "", resultValue: "", referenceRange: "", documentUrl: "", modality: "X-Ray" });
    navigate(backPath);
  }

  function backFromDetailStep() {
    if (user?.role === "reception") {
      navigate(backPath);
      return;
    }
    // For non-reception users, "Back" should return to the previous Uploads step.
    setDocType(null);
    setLabOrderId("");
    setImagingOrderId("");
    setRecordDocumentType("");
    setForm((f) => ({ ...f, title: "", result: "", resultValue: "", referenceRange: "", documentUrl: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    if (docType === "lab_result") {
      if (!labOrderId) {
        toast({
          title: "Lab order is required",
          description: "Please select the external lab order this result belongs to.",
          variant: "destructive",
        });
        return;
      }
      if (!pendingExternalLabOrders.some((o) => o.id === labOrderId)) {
        toast({
          title: "Invalid lab order",
          description: "Choose an open external lab order from the list.",
          variant: "destructive",
        });
        return;
      }
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
    } else if (docType === "imaging") {
      if (!imagingOrderId) {
        toast({
          title: "Imaging order is required",
          description: "Please select the external imaging order this upload completes.",
          variant: "destructive",
        });
        return;
      }
      if (!pendingExternalImagingOrders.some((o) => o.id === imagingOrderId)) {
        toast({
          title: "Invalid imaging order",
          description: "Choose an open external imaging order from the list.",
          variant: "destructive",
        });
        return;
      }
      const ord = imagingOrders.find((o) => o.id === imagingOrderId);
      if (!ord || !isExternalOrder(ord) || ord.status !== "ordered") {
        toast({
          title: "Invalid imaging order",
          description: "Select an open external imaging order from the list.",
          variant: "destructive",
        });
        return;
      }
      try {
        await updateImagingOrderMutation.mutateAsync({
          id: imagingOrderId,
          status: "completed",
          completedAt: new Date().toISOString(),
          documentUrl: form.documentUrl || undefined,
        });
        toast({ title: "Imaging uploaded; order marked complete" });
        resetAndGoBack();
      } catch {
        /* errors handled via mutation onError */
      }
    } else if (docType === "patient_document") {
      if (!recordDocumentType.trim()) {
        toast({
          title: "Document type is required",
          description: "Choose the type of medical record document you are uploading.",
          variant: "destructive",
        });
        return;
      }
      createDocMutation.mutate({
        patientId: selectedPatient.id,
        documentType: "patient_document",
        title: form.title || "Patient document",
        documentUrl: form.documentUrl || undefined,
        recordDocumentType: recordDocumentType.trim(),
      });
    }
  }

  const isPatientDocumentFlow = docType === "patient_document";

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6" data-testid="upload-results-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {!selectedPatient
            ? "Uploads"
            : isPatientDocumentFlow
              ? "Upload document"
              : "Uploads"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {!selectedPatient
            ? "Search for the patient whose outside lab, imaging, or document you are uploading."
            : isPatientDocumentFlow
              ? "Add a file and classification to the patient's medical record."
              : "Upload outside lab results, imaging, or patient documents."}
        </p>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedPatient(null);
                navigate(backPath);
              }}
            >
              Change patient
            </Button>
          </CardHeader>
          <CardContent>
            <Label className="text-muted-foreground block mb-3">Select document type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col gap-1"
                onClick={() => setDocType("lab_result")}
                data-testid="upload-results-choose-lab-result"
              >
                <FlaskConical className="w-5 h-5" />
                <span>Lab result</span>
                <span className="text-xs text-muted-foreground font-normal">External lab orders awaiting result</span>
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
            <Button variant="ghost" size="sm" onClick={backFromDetailStep}>Back</Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {docType === "lab_result" && (
                <>
                  <div className="space-y-2">
                    <Label>Associate with external lab order *</Label>
                    <Select value={labOrderId} onValueChange={setLabOrderId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select external lab order" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingExternalLabOrders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.testName} ({o.testCode || "—"})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pendingExternalLabOrders.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No open external orders for this patient.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Select the external order this result belongs to. On upload, the order is marked resulted and any file is attached to the chart.
                      </p>
                    )}
                  </div>
                  {user?.role !== "reception" && (
                    <>
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
                </>
              )}
              {docType === "imaging" && (
                <>
                  <div className="space-y-2">
                    <Label>Associate with external imaging order *</Label>
                    <Select
                      value={imagingOrderId || undefined}
                      onValueChange={(id) => {
                        setImagingOrderId(id);
                        const o = imagingOrders.find((x) => x.id === id);
                        if (o) {
                          setForm((f) => ({ ...f, title: o.title, modality: o.modality }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select external imaging order" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingExternalImagingOrders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.title} · {o.modality}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pendingExternalImagingOrders.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No open external imaging orders for this patient. Create an external imaging order first (e.g. from the chart or imaging center), then upload the result here.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Select the external order this upload completes. On upload, the order is marked complete and any file is attached to the chart.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Chest X-Ray report"
                      required
                    />
                  </div>
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
                </>
              )}
              {docType === "patient_document" && (
                <>
                  <div className="space-y-2">
                    <Label>Document type *</Label>
                    <Select value={recordDocumentType || undefined} onValueChange={setRecordDocumentType}>
                      <SelectTrigger data-testid="upload-document-type-select">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePatientRecordDocumentTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Standard categories for documents filed in the medical record.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Referral letter" required />
                  </div>
                </>
              )}
              <DocumentFileUpload
                value={form.documentUrl}
                onChange={(url) => setForm((f) => ({ ...f, documentUrl: url ?? "" }))}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={backFromDetailStep}>Back</Button>
                <Button
                  type="submit"
                  disabled={
                    updateLabMutation.isPending ||
                    createDocMutation.isPending ||
                    updateImagingOrderMutation.isPending ||
                    (docType === "lab_result" && (!labOrderId || pendingExternalLabOrders.length === 0)) ||
                    (docType === "imaging" && (!imagingOrderId || pendingExternalImagingOrders.length === 0)) ||
                    (docType === "patient_document" && !recordDocumentType.trim())
                  }
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {updateLabMutation.isPending || createDocMutation.isPending || updateImagingOrderMutation.isPending
                    ? "Uploading..."
                    : "Upload"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
