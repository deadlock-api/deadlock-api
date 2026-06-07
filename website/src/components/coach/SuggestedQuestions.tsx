import { CoachIcon } from "~/lib/coach/icons";
import type { SuggestedQuestionsBlock } from "~/lib/coach/report";

import { useAsk } from "./ask-context";

export function SuggestedQuestions({ block }: { block: SuggestedQuestionsBlock }) {
  const { ask, busy } = useAsk();
  const questions = block.questions ?? [];
  if (questions.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CoachIcon name="message-circle" className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{block.title ?? "Ask me to go deeper"}</p>
      </div>
      <div className="flex flex-col gap-2">
        {questions.map((q) => (
          <button
            key={q.text}
            type="button"
            disabled={!ask || busy}
            onClick={() => ask?.(q.text)}
            className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CoachIcon
              name={q.icon ?? "arrow-right"}
              className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
            />
            <span className="min-w-0 flex-1">{q.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
