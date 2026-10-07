import { useState } from "react";

/**
 * The drag-and-drop behavior of a `DropZone`. `over` is true while something is dragged over the zone; crossing its
 * children does not reset it. `disabled` refuses drops (a zone that is busy), so the browser does not open the file.
 */
export function useDropZone({
  onDrop,
  disabled = false,
}: {
  onDrop: (event: React.DragEvent<HTMLElement>) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);

  const dropZoneProps = {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!disabled && event.dataTransfer.items.length > 0) setOver(true);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setOver(false);
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setOver(false);
      if (!disabled) void onDrop(event);
    },
  };

  return { over, dropZoneProps };
}
