import { Loader2 } from "lucide-react";

interface CommandPreviewProps {
  preview: string | null;
  previewError: string | null;
  loading?: boolean;
}

export function CommandPreview({ preview, previewError, loading }: CommandPreviewProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-foreground">Command Preview</h3>
      <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading preview...</span>
          </div>
        ) : previewError ? (
          <div className="text-destructive">{previewError}</div>
        ) : preview ? (
          <pre className="whitespace-pre-wrap">{preview}</pre>
        ) : (
          "No preview available yet. Fill in the fields to generate a preview."
        )}
      </div>
    </div>
  );
}
