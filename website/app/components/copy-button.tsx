import { type ComponentProps, useCallback, useState } from "react";

import { Button } from "~/components/ui/button";

interface CopyButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  text: string;
}

export function CopyButton({ text, children = "Copy", ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button onClick={handleCopy} {...props}>
      {copied ? "Copied!" : children}
    </Button>
  );
}
