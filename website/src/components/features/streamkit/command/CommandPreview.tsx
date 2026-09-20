import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Card, CardContent } from "~/components/ui/card";

interface CommandPreviewProps {
  preview: string | null;
  previewError: string | null;
  loading?: boolean;
}

export function CommandPreview({ preview, previewError, loading }: CommandPreviewProps) {
  return (
    <Section as="h3" size="sm" title="Command Preview" className="gap-1">
      <Card tone="muted" size="sm">
        <CardContent className="text-sm text-muted-foreground">
          {loading ? (
            <LoadingState size="sm" text="Loading preview…" label="preview" className="justify-start py-0" />
          ) : previewError ? (
            <div className="text-destructive">{previewError}</div>
          ) : preview ? (
            <pre className="whitespace-pre-wrap">{preview}</pre>
          ) : (
            "No preview available yet. Fill in the fields to generate a preview."
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
