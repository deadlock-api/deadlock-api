import { Check, CircleAlert, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "~/components/ui/button";

export type ActionButtonStatus = "idle" | "busy" | "done" | "failed";

type ActionButtonProps = Omit<ComponentProps<typeof Button>, "loading" | "loadingLabel" | "asChild"> & {
  /** Where the action is: `busy` spins and ignores presses, `done` and `failed` swap the icon and the label. */
  status?: ActionButtonStatus;
  /** The action's glyph at rest. */
  icon?: LucideIcon;
  /** What the spinner announces while busy: "Copying". */
  busyLabel?: string;
  /** The label once it worked: "Copied". */
  doneLabel?: string;
  /** The label when it did not: "Copy failed". */
  failedLabel?: string;
};

/**
 * A button for an action that takes a moment and can fail (share, copy or save a file): the status shows in the
 * button itself, a spinner while busy, a check mark and `doneLabel` once done, an alert and `failedLabel` when not.
 * The parent owns the status (`useShareImage` and `useCopyToClipboard` report one) and announces the outcome in one
 * polite live region of its own, so a row of these is not read out twice.
 *
 * Unavailable (the browser cannot do it): pass `aria-disabled` and `aria-describedby` pointing at the reason. It stays
 * focusable so the reason is heard, and ignores presses.
 */
export function ActionButton({
  status = "idle",
  icon: Icon,
  busyLabel = "Working",
  doneLabel = "Done",
  failedLabel = "Failed",
  children = "Run",
  onClick,
  ...props
}: ActionButtonProps) {
  const unavailable = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const glyph = status === "done" ? Check : status === "failed" ? CircleAlert : Icon;
  return (
    <Button
      type="button"
      data-slot="action-button"
      data-status={status}
      {...props}
      loading={status === "busy"}
      loadingLabel={busyLabel}
      aria-disabled={unavailable || status === "busy" || undefined}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {status !== "busy" && glyph && <GlyphIcon icon={glyph} />}
      {status === "done" ? doneLabel : status === "failed" ? failedLabel : children}
    </Button>
  );
}

function GlyphIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" />;
}
