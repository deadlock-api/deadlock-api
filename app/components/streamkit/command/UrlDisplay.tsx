import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";

interface UrlDisplayProps {
  generatedUrl: string;
}

export function UrlDisplay({ generatedUrl }: UrlDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedUrl]);

  return (
    <div>
      <h3 className="block text-sm font-medium text-foreground">Generated URL</h3>
      {generatedUrl ? (
        <div className="relative mt-1">
          <div className="break-all rounded-md border border-border bg-muted p-3 pr-24 text-sm text-muted-foreground">
            {generatedUrl}
          </div>
          <Button
            size="sm"
            onClick={handleCopy}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          No URL available yet. Fill in the fields to generate a URL.
        </div>
      )}
    </div>
  );
}
