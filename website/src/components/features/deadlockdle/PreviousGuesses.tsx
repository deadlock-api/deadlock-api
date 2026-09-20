import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { Heading } from "~/components/ui/heading";
import { Inline, Stack } from "~/components/ui/stack";

export function PreviousGuesses({ guesses, answer }: { guesses: string[]; answer: string }) {
  if (guesses.length === 0) return null;
  return (
    <Stack gap={1.5}>
      <Heading as="h2" size="eyebrow" font="mono">
        Previous Guesses
      </Heading>
      <Inline gap={2}>
        {guesses.map((guess) => (
          <TerminalBadge
            key={guess}
            variant={guess.toLowerCase() === answer.toLowerCase() ? "positive" : "negative"}
            className="normal-case"
          >
            {guess}
          </TerminalBadge>
        ))}
      </Inline>
    </Stack>
  );
}
