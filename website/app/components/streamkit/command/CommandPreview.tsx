interface CommandPreviewProps {
  preview: string | null;
  previewError: string | null;
  loading?: boolean;
}

export function CommandPreview({ preview, previewError, loading }: CommandPreviewProps) {
  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground">Command Preview</h3>
      <div className="mt-1 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
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
