import { HighlightedCode } from "~/components/HighlightedCode";

export function SchemaPreview({ sqlContent }: { sqlContent: string }) {
  return (
    <HighlightedCode
      code={sqlContent}
      language="sql"
      className="rounded-md border border-white/[0.06] bg-black/40 p-3 text-[11px]"
    />
  );
}
