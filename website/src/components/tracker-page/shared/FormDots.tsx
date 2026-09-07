import type { FormResult } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_DOT_CLASS, WIN_DOT_CLASS } from "./colors";

export function FormDots({ form, className }: { form: FormResult[]; className?: string }) {
  if (form.length === 0) return null;
  const wins = form.filter((result) => result === "win").length;
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      title={`Last ${form.length}: ${wins}W – ${form.length - wins}L, newest first`}
    >
      {form.map((result, i) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          className={cn("h-3 w-1.5 rounded-full", result === "win" ? WIN_DOT_CLASS : LOSS_DOT_CLASS)}
        />
      ))}
    </div>
  );
}
