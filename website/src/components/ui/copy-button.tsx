import { Check, Copy } from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/components/ui/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

type CopyButtonProps = ComponentProps<typeof Button> & {
  /** A function defers the value to click time, for text that only exists in the browser like the page URL. */
  text: string | (() => string);
};

/** An `icon*` size shows the icon alone and needs an `aria-label` or `title`; any other size adds the children. */

export function CopyButton({ text, children = "Copy", className, variant, size, onClick, ...props }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  const iconDisplay = size?.startsWith("icon") ?? false;

  return (
    <Button
      type="button"
      variant={variant ?? (iconDisplay ? "ghost" : "default")}
      size={size}
      data-slot="copy-button"
      data-state={copied ? "copied" : "idle"}
      className={cn("shrink-0", className)}
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
      {!iconDisplay && (copied ? "Copied" : children)}
    </Button>
  );
}
