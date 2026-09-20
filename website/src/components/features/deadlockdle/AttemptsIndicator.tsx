import { Inline } from "~/components/ui/stack";
import { StepMeter, StepMeterStep, type StepState } from "~/components/ui/step-meter";
import { Text } from "~/components/ui/text";

interface AttemptsIndicatorProps {
  total: number;
  used: number;
  status: "playing" | "won" | "lost";
}

export function attemptState(index: number, used: number, isWin: boolean, isPlaying: boolean): StepState {
  if (index < used) return isWin && index === used - 1 ? "correct" : "done";
  return isPlaying && index === used ? "current" : "empty";
}

export function AttemptsIndicator({ total, used, status }: AttemptsIndicatorProps) {
  return (
    <Inline gap={3} wrap="nowrap" className="font-mono text-xs tracking-widest uppercase">
      <Inline gap={2} wrap="nowrap">
        <Text tone="muted" variant="caption" aria-hidden="true">
          [
        </Text>
        <StepMeter variant="squares" aria-label={`${used} of ${total} attempts used`}>
          {Array.from({ length: total }, (_, i) => (
            <StepMeterStep key={i} state={attemptState(i, used, status === "won", status === "playing")} />
          ))}
        </StepMeter>
        <Text tone="muted" variant="caption" aria-hidden="true">
          ]
        </Text>
      </Inline>
      <Text tone="muted" variant="caption">
        {status === "won" ? "SOLVED" : status === "lost" ? "FAILED" : `${total - used} LEFT`}
      </Text>
    </Inline>
  );
}
