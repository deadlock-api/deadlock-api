import { useCallback, useRef, useState } from "react";

import { assignRef } from "~/components/ui/hooks/assign-ref";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { cn } from "~/lib/utils";

/**
 * Shows content of a fixed design size whole, however narrow the room: wider than the frame, it is scaled down to fit
 * (never up) and centred, and the frame takes the scaled height, so nothing is clipped, scrolled or left as empty
 * space. For a preview of something drawn at its own size elsewhere (a stream overlay, an image export). The content
 * keeps its layout size, so a measurement of it reads the real size. Server-rendered at full size; the first
 * measurement lands before paint.
 */
export function FitFrame({ className, style, children, ref, ...props }: React.ComponentProps<"div">) {
  const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null);
  const frameRef = useCallback(
    (node: HTMLDivElement | null) => {
      setFrameElement(node);
      assignRef(ref, node);
      return () => {
        assignRef(ref, null);
      };
    },
    [ref],
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const frame = useElementSize(frameElement);
  const content = useElementSize(contentRef, { box: "border" });
  const scale = frame.width > 0 && content.width > frame.width ? frame.width / content.width : 1;
  return (
    <div
      ref={frameRef}
      data-slot="fit-frame"
      data-scaled={scale < 1 || undefined}
      className={cn("flex w-full min-w-0 justify-center overflow-hidden", className)}
      style={scale < 1 ? { height: content.height * scale, ...style } : style}
      {...props}
    >
      <div
        ref={contentRef}
        data-slot="fit-frame-content"
        className="w-max shrink-0 origin-top self-start"
        style={scale < 1 ? { transform: `scale(${scale})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
