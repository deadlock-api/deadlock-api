import { CopyButton } from "~/components/ui/copy-button";

interface UrlDisplayProps {
  generatedUrl: string;
}

export function UrlDisplay({ generatedUrl }: UrlDisplayProps) {
  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground">Generated URL</h3>
      {generatedUrl ? (
        <div className="relative mt-1">
          <div className="break-all rounded-md border border-border bg-muted p-3 pr-24 text-sm text-muted-foreground">
            {generatedUrl}
          </div>
          <CopyButton
            size="sm"
            text={generatedUrl}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          />
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          No URL available yet. Fill in the fields to generate a URL.
        </div>
      )}
    </div>
  );
}
