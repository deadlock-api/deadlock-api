import { HighlightedCode } from "~/components/HighlightedCode";

export function SchemaPreview({ sqlContent }: { sqlContent: string }) {
  return <HighlightedCode code={sqlContent} language="sql" className="bg-black/40 p-3 text-[11px]" />;
}
