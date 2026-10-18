import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { Inline } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

interface CommandPreviewProps {
  preview: string | null;
  previewError: string | null;
  loading?: boolean;
  onRetry?: () => void;
}

/**
 * What the bot would answer. The answer, the failure or the empty state sit in one polite live region that stays
 * mounted, so each new answer is announced; while the next one loads the last answer stays (the query keeps it), and
 * only a first load shows the loading line, at the height of one line of text.
 */
export function CommandPreview({ preview, previewError, loading, onRetry }: CommandPreviewProps) {
  return (
    <Section as="h3" size="sm" title="Command Preview" className="gap-1">
      <Card tone="muted" size="sm">
        <CardContent className="min-h-5 text-sm text-muted-foreground">
          {loading && (
            <Inline>
              <Spinner size="sm" label="Loading preview" />
              <span aria-hidden="true">Loading preview…</span>
            </Inline>
          )}
          <output className="block">
            {loading ? null : previewError ? (
              <Text tone="destructive">
                {previewError}{" "}
                {onRetry && (
                  <Button variant="link" size="inline" onClick={onRetry}>
                    Try again
                  </Button>
                )}
              </Text>
            ) : preview ? (
              <pre className="whitespace-pre-wrap">{preview}</pre>
            ) : (
              "No preview yet."
            )}
          </output>
        </CardContent>
      </Card>
    </Section>
  );
}
