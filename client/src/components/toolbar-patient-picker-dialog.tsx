import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Patient } from "@shared/schema";

const DEBOUNCE_MS = 300;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  targetPath: "/laboratory" | "/upload-results";
};

export function ToolbarPatientPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  targetPath,
}: Props) {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/patients?search=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token, open]);

  const handleSelect = (patient: Patient) => {
    sessionStorage.setItem("ehr_active_patient_id", patient.id);
    navigate(`${targetPath}?patientId=${encodeURIComponent(patient.id)}`);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={`dialog-patient-picker-${targetPath.slice(1)}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription>
              Search by patient name or MRN, then select who this action is for.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Label htmlFor="toolbar-patient-search">Patient</Label>
          <Input
            id="toolbar-patient-search"
            placeholder="Search name or MRN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            data-testid="toolbar-patient-picker-input"
          />
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No patients found</p>
          )}
          {!loading && query.trim() && results.length > 0 && (
            <ul className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(p)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
                    )}
                    data-testid={`toolbar-patient-picker-result-${p.id}`}
                  >
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">MRN: {p.mrn}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
