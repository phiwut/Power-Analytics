import { useCallback, useRef, useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFile: (file: File) => void;
  busy?: boolean;
  compact?: boolean;
  title?: string;
  compactTitle?: string;
  description?: string;
}

export function FileDropzone({
  onFile,
  busy,
  compact,
  title = "Drop a measurement file",
  compactTitle = "Load a different file",
  description = "Supports TXT and CSV exports from power quality analyzers, energy meters and data loggers. Tab, semicolon and comma separators detected automatically. German and English number formats supported.",
}: FileDropzoneProps) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-xl border-2 border-dashed transition-all",
        over ? "border-primary bg-primary/5" : "border-border bg-card",
        compact ? "p-4" : "p-12",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.csv,.tsv,text/plain,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className={cn("flex items-center gap-4", compact ? "" : "flex-col text-center")}>
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-primary/10",
            compact ? "size-10" : "size-16",
          )}
        >
          {busy ? (
            <Loader2 className={cn("animate-spin text-primary", compact ? "size-5" : "size-7")} />
          ) : compact ? (
            <FileText className="size-5 text-primary" />
          ) : (
            <Upload className="size-7 text-primary" />
          )}
        </div>
        <div className={cn(compact ? "" : "space-y-2")}>
          <h3 className={cn("font-semibold", compact ? "text-sm" : "text-lg")}>
            {busy ? "Parsing file…" : compact ? compactTitle : title}
          </h3>
          {!compact && (
            <p className="text-sm text-muted-foreground max-w-md">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
