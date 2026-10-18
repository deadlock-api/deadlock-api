import { Button } from "~/components/ui/button";
import { FloatingBar } from "~/components/ui/floating-bar";
import { Kbd } from "~/components/ui/kbd";
import { SelectionBox } from "~/components/ui/selection-box";
import { Inline } from "~/components/ui/stack";

import { type Box, MAX_TARGETS, useElementPicker } from "./use-element-picker";

interface ElementPickerProps {
  onPick: (elements: HTMLElement[]) => void;
  onCancel: () => void;
}

function boxStyle(box: Box) {
  return { top: box.top, insetInlineStart: box.left, width: box.width, height: box.height };
}

/**
 * The overlay that lets the reader point at what their feedback is about, with the mouse, a finger or the keys (see
 * `useElementPicker`). The bar on top takes the focus and says, through a polite status, what the keys highlight.
 */
export function ElementPicker({ onPick, onCancel }: ElementPickerProps) {
  const { bar, hovered, marquee, selected, boxes, status } = useElementPicker({ onPick, onCancel });

  return (
    <div className="pointer-events-none fixed inset-0 z-100" data-feedback-ui>
      {boxes.map((box) => (
        <SelectionBox
          key={box.key}
          state="selected"
          label={box.label}
          labelPosition={box.top < 28 ? "below" : "above"}
          style={boxStyle(box)}
        />
      ))}

      {/* The element under the pointer, or the one the arrow keys highlight. */}
      {hovered && !marquee && (
        <SelectionBox
          state="hovered"
          label={hovered.label}
          labelPosition={hovered.top < 28 ? "below" : "above"}
          style={boxStyle(hovered)}
        />
      )}

      {marquee && <SelectionBox state="marquee" style={boxStyle(marquee)} />}

      <FloatingBar
        ref={bar}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter Escape"
        tabIndex={-1}
        className="pointer-events-auto"
      >
        <span className="font-medium">Pick what your feedback is about</span>
        <Inline gap={1.5} wrap="nowrap" className="hidden text-muted-foreground pointer-fine:flex" aria-hidden="true">
          <Kbd>←↑↓→</Kbd>
          <Kbd>Space</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Esc</Kbd>
        </Inline>
        <Inline gap={2} wrap="nowrap">
          <Button variant="ghost" size="xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="xs"
            className="min-w-20 tabular-nums"
            disabled={selected.length === 0}
            onClick={() => onPick(selected)}
          >
            Done · {selected.length}/{MAX_TARGETS}
          </Button>
        </Inline>
        <output className="sr-only">{status}</output>
      </FloatingBar>
    </div>
  );
}
