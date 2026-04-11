import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@shared/schema";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { useOrganizationSettings } from "@/lib/organization-settings";

const DEBOUNCE_MS = 300;

type PatientSearchComboboxProps = {
  token: string | null;
  /** Currently selected patient, or null */
  value: Patient | null;
  onChange: (patient: Patient | null) => void;
  disabled?: boolean;
  placeholder?: string;
  triggerTestId?: string;
};

export function PatientSearchCombobox({
  token,
  value,
  onChange,
  disabled,
  placeholder,
  triggerTestId = "patient-combobox-trigger",
}: PatientSearchComboboxProps) {
  const { patientIdentifierLabel } = useOrganizationSettings();
  const resolvedPlaceholder = placeholder ?? `Search by name or ${patientIdentifierLabel}…`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const authToken = token ?? getStoredAuthToken();
    if (!authToken) {
      setResults([]);
      setLoading(false);
      setError("Session expired. Please refresh and sign in again.");
      return;
    }
    setLoading(true);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/patients?search=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then(async (res) => {
          if (res.ok) return res.json();
          const j = await res.json().catch(() => ({}));
          const msg = (j as { message?: string }).message || `Search failed (${res.status})`;
          throw new Error(msg);
        })
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch((e: Error) => {
          setResults([]);
          setError(e.message);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token, open]);

  const handleSelect = (patient: Patient) => {
    onChange(patient);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setResults([]);
    }
  };

  return (
    <div className="flex gap-2 items-start">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal text-left h-auto min-h-10 py-2 px-3",
              !value && "text-muted-foreground"
            )}
            data-testid={triggerTestId}
          >
            {value ? (
              <span className="truncate">
                <span className="font-medium text-foreground">
                  {value.firstName} {value.lastName}
                </span>
                <span className="text-muted-foreground font-mono text-sm ml-2">
                  {patientIdentifierLabel} {value.mrn}
                </span>
              </span>
            ) : (
              resolvedPlaceholder
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="p-2 border-b border-border">
            <Input
              placeholder={`Type name or ${patientIdentifierLabel}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              data-testid="patient-combobox-search"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="py-6 px-3 text-sm text-destructive text-center">{error}</p>
            ) : !query.trim() ? (
              <p className="py-6 px-3 text-sm text-muted-foreground text-center">Type to search patients</p>
            ) : results.length === 0 ? (
              <p className="py-6 px-3 text-sm text-muted-foreground text-center">No patients found</p>
            ) : (
              <ul className="py-1">
                {results.map((patient) => (
                  <li key={patient.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(patient)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-sm",
                        "hover:bg-accent hover:text-accent-foreground focus:bg-accent outline-none"
                      )}
                      data-testid={`patient-combobox-result-${patient.id}`}
                    >
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {patientIdentifierLabel}: {patient.mrn}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 mt-0.5"
          aria-label="Clear patient"
          onClick={() => onChange(null)}
          data-testid="patient-combobox-clear"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
