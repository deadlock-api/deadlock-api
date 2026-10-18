import { cn } from "~/lib/utils";

/**
 * The question of a quiz round, centred in the heading-sm step. It holds three lines on a column narrower than 28rem
 * and two from there, centring shorter questions in that space, so a question that wraps more than the last one moves
 * nothing under it. Focusable (`tabIndex -1`): a game moves focus here when the next round comes in, so the question
 * is read before its answers.
 */
export function QuizQuestion({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div data-slot="quiz-question" className="@container/question w-full min-w-0">
      <p
        tabIndex={-1}
        className={cn(
          "grid min-h-three-lines content-center px-2 text-center type-heading-sm text-balance @md/question:min-h-two-lines",
          className,
        )}
        {...props}
      />
    </div>
  );
}
