import type { ColumnInfo } from "./types";

export function SchemaPreview({ columns }: { columns: ColumnInfo[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-white/[0.06] bg-black/40">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-black/60 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Column</th>
            <th className="px-3 py-1.5 font-medium">ClickHouse type</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.name} className="border-t border-white/[0.04]">
              <td className="px-3 py-1 font-mono whitespace-nowrap text-foreground">{c.name}</td>
              <td className="px-3 py-1 font-mono break-all text-muted-foreground">{c.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
