import { Check, Copy } from "lucide-react";
import { type ComponentProps, useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type CopyButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  text: string;
  iconOnly?: boolean;
};

export function CopyButton({ text, iconOnly, children = "Copy", className, variant, size, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (iconOnly) {
    return (
      <Button
        type="button"
        onClick={handleCopy}
        variant={variant ?? "ghost"}
        size={size ?? "icon"}
        className={cn("size-7 shrink-0", className)}
        {...props}
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </Button>
    );
  }

  return (
    <Button onClick={handleCopy} variant={variant} size={size} className={className} {...props}>
      {copied ? "Copied!" : children}
    </Button>
  );
}
