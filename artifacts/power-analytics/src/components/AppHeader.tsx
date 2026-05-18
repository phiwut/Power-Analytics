import { Activity, Moon, Sun, Download, FileJson, FileSpreadsheet, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  fileName?: string;
  rowCount?: number;
  onExportPdf?: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  dark: boolean;
  onToggleDark: () => void;
  onLoadSample?: () => void;
  onAskChatGpt?: () => void;
}

export function AppHeader({
  fileName,
  rowCount,
  onExportPdf,
  onExportCsv,
  onExportJson,
  dark,
  onToggleDark,
  onLoadSample,
  onAskChatGpt,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Activity className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm tracking-tight truncate">
              Power Analytics
            </h1>
            {fileName ? (
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {fileName} · {rowCount?.toLocaleString()} rows
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Power quality &amp; load analysis
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onLoadSample && !fileName && (
            <Button variant="outline" size="sm" onClick={onLoadSample}>
              Load sample
            </Button>
          )}
          {fileName && onExportPdf && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default">
                  <Download className="size-4 mr-1.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Download report</DropdownMenuLabel>
                <DropdownMenuItem onClick={onExportPdf}>
                  <FileText className="size-4 mr-2" />
                  PDF report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Findings</DropdownMenuLabel>
                <DropdownMenuItem onClick={onExportCsv}>
                  <FileSpreadsheet className="size-4 mr-2" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJson}>
                  <FileJson className="size-4 mr-2" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {fileName && onAskChatGpt && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAskChatGpt}
              title="Copy a compact analysis summary for ChatGPT."
            >
              <MessageCircle className="size-4 mr-1.5" />
              Ask ChatGPT
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onToggleDark}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
