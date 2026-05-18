import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  truncated: boolean;
  building: boolean;
}

export function ChatGptPromptModal({ open, onOpenChange, prompt, truncated, building }: Props) {
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!open) setShowPrompt(false);
  }, [open]);

  useEffect(() => {
    if (open && showPrompt && textareaRef) {
      textareaRef.focus();
      textareaRef.select();
    }
  }, [open, showPrompt, textareaRef]);

  const copyToClipboard = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({
        title: "Prompt copied",
        description: "The prompt is now in your clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the text manually from the text area.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Prompt copied</DialogTitle>
          <DialogDescription>
            Key measurement and analysis values have been copied to your clipboard as a compact prompt.
            Open ChatGPT and paste the prompt there.
          </DialogDescription>
        </DialogHeader>

        {truncated && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            The prompt was truncated to fit the character limit. Some details may have been shortened.
          </div>
        )}

        {showPrompt && (
          <Textarea
            ref={setTextareaRef}
            value={prompt}
            readOnly
            className="min-h-[220px] font-mono text-xs"
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowPrompt(true)}>
            Show prompt
          </Button>
          <Button variant="outline" onClick={copyToClipboard} disabled={!prompt || building}>
            <Copy className="size-4 mr-1.5" />
            Copy again
          </Button>
          <Button asChild disabled={building}>
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
              <ExternalLink className="size-4 mr-1.5" />
              Open ChatGPT
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
