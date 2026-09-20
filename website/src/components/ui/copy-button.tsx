import { Check, Copy } from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/components/ui/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

type CopyButtonProps = ComponentProps<typeof Button> & {
  /** A function defers the value to click time, for text that only exists in the browser like the page URL. */
  text: string | (() => string);
  /** `label` shows the icon and the children; `icon` shows the icon alone and needs an `aria-label` or `title`. */
  display?: "label" | "icon";
  /** What the label reads for two seconds after a copy. */
  copiedLabel?: React.ReactNode;
};

export function CopyButton({
  text,
  display = "label",
  copiedLabel = "Copied",
  children = "Copy",
  className,
  variant,
  size,
  onClick,
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  const iconDisplay = display === "icon";

  return (
    <Button
      type="button"
      variant={variant ?? (iconDisplay ? "ghost" : "default")}
      size={size ?? (iconDisplay ? "icon" : "default")}
      data-slot="copy-button"
      data-state={copied ? "copied" : "idle"}
      className={cn("shrink-0", iconDisplay && !size && "size-7", className)}
      {...props}
      aria-label={
        iconDisplay ? (copied ? "Copied" : (props["aria-label"] ?? props.title ?? "Copy")) : props["aria-label"]
      }
      onClick={async (event) => {
        // Copying must not also activate a clickable ancestor, like an expandable table row.
        event.stopPropagation();
        onClick?.(event);
        if (!(await copy(typeof text === "function" ? text() : text))) {
          toast.error("Could not copy to the clipboard. Please try again.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {!iconDisplay && (copied ? copiedLabel : children)}
    </Button>
  );
}
