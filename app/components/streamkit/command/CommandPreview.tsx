interface CommandPreviewProps {
  preview: string | null;
  previewError: string | null;
}

export function CommandPreview({ preview, previewError }: CommandPreviewProps) {
  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground">Command Preview</h3>
      <div className="mt-1 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
        {previewError ? (
          <div className="text-destructive">{previewError}</div>
        ) : (
          <div>
            {preview ? (
              <pre className="whitespace-pre-wrap">{preview}</pre>
            ) : (
              "No preview available yet. Fill in the fields to generate a preview."
            )}
          </div>
        )}
      </div>
    </div>
  );
}
