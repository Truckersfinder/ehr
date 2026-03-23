import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, FileText } from "lucide-react";

interface DocumentFileUploadProps {
  label?: string;
  value?: string;
  onChange: (url: string | undefined) => void;
  disabled?: boolean;
  accept?: string;
}

export function DocumentFileUpload({
  label = "Document (optional)",
  value,
  onChange,
  disabled,
  accept = ".pdf,.jpg,.jpeg,.png,.gif,.webp",
}: DocumentFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const { token } = useAuth();
  const authToken = token ?? getStoredAuthToken();
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authToken) return;
    setUploading(true);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      const data = await res.json();
      onChange(data.url);
    } catch (err) {
      onChange(undefined);
      setFileName(null);
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Could not upload file", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleClear = () => {
    onChange(undefined);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const displayName = fileName || (value ? "File attached" : null);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
          id="document-file-upload"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          {uploading ? (
            "Uploading..."
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {displayName ? "Change file" : "Choose file"}
            </>
          )}
        </Button>
        {displayName && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <FileText className="w-4 h-4" />
            {displayName}
          </span>
        )}
        {(value || displayName) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={handleClear}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Upload a report or image (PDF, JPG, PNG, etc.)
      </p>
    </div>
  );
}
