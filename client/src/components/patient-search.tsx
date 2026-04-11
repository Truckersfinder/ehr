import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useOrganizationSettings } from "@/lib/organization-settings";
import type { Patient } from "@shared/schema";

const DEBOUNCE_MS = 300;

export function PatientSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { token } = useAuth();
  const { patientIdentifierLabel } = useOrganizationSettings();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  /** Re-open when typing after popover was closed (e.g. Escape) while input stays focused */
  useEffect(() => {
    if (query.trim().length > 0) {
      setOpen(true);
    }
  }, [query]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(
        `/api/patients?search=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token]);

  const handleSelect = (patient: Patient) => {
    setLocation(`/patients/${patient.id}?fromSearch=1`);
    setQuery("");
    setOpen(false);
    setResults([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex-1 max-w-xs min-w-[9rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder={t("patientSearch.placeholderDetail")}
            aria-label={t("patientSearch.ariaLabel")}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (v.trim().length > 0) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="pl-9 h-9 bg-muted/50"
            data-testid="patient-search-input"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !query.trim() ? (
          <p className="py-4 px-3 text-sm text-muted-foreground text-center">
            Type a patient name or {patientIdentifierLabel} to search
          </p>
        ) : results.length === 0 ? (
          <p className="py-4 px-3 text-sm text-muted-foreground text-center">
            No patients found
          </p>
        ) : (
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {results.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(patient)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-sm",
                    "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none"
                  )}
                  data-testid={`patient-search-result-${patient.id}`}
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
      </PopoverContent>
    </Popover>
  );
}
