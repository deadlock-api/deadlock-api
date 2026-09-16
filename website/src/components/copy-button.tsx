import { Check, Copy } from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type CopyButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  /** A function defers the value to click time, for text that only exists in the browser like the page URL. */
  text: string | (() => string);
  iconOnly?: boolean;
};

export function CopyButton({ text, iconOnly, children = "Copy", className, variant, size, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = useCallback(
    async (event: React.MouseEvent) => {
      // Copying must not also activate a clickable ancestor, like an expandable table row.
      event.stopPropagation();
      clearTimeout(resetTimer.current);
      setCopied(false);
      try {
        await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
        setCopied(true);
        resetTimer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Could not copy to the clipboard. Please try again.");
      }
    },
    [text],
  );

  if (iconOnly) {
    return (
      <Button
        type="button"
        onClick={handleCopy}
        variant={variant ?? "ghost"}
        size={size ?? "icon"}
        className={cn("size-7 shrink-0", className)}
        aria-label={copied ? "Copied" : (props["aria-label"] ?? props.title ?? "Copy")}
        {...props}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    );
  }

  return (
    <Button type="button" onClick={handleCopy} variant={variant} size={size} className={className} {...props}>
      {copied ? "Copied!" : children}
    </Button>
  );
}
