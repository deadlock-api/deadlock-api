import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";

import { createFilter } from "./createFilter";

export const SortDirectionFilter = createFilter<{
  value: "desc" | "asc";
  onChange: (dir: "desc" | "asc") => void;
}>({
  useDescription(props) {
    return { sortDir: props.value === "desc" ? "descending" : "ascending" };
  },
  Render({ value, onChange }) {
    const isDesc = value === "desc";
    return (
      <button
        type="button"
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.08] bg-secondary px-3 text-sm text-muted-foreground transition-all hover:border-white/[0.14] hover:bg-accent hover:text-foreground"
        onClick={() => onChange(isDesc ? "asc" : "desc")}
      >
        {isDesc ? <ArrowDownNarrowWide className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}
        <span>{isDesc ? "DESC" : "ASC"}</span>
      </button>
    );
  },
});
