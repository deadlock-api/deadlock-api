import { CopyableUrl } from "~/components/patterns/code/CopyableCode";
import { Section } from "~/components/patterns/page/Section";

interface UrlDisplayProps {
  generatedUrl: string;
}

export function UrlDisplay({ generatedUrl }: UrlDisplayProps) {
  return (
    <Section as="h3" size="sm" title="Generated URL" className="gap-1">
      <CopyableUrl
        value={generatedUrl}
        overflow="wrap"
        placeholder="No URL available yet. Fill in the fields to generate a URL."
      />
    </Section>
  );
}
