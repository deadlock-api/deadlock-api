import { Dialog } from "~/components/ui/dialog";

/**
 * The open/close shell every Team Builder detail dialog shares. The body is only mounted while
 * there is a value, which is also what resets its internal state between two different subjects —
 * no effect needed.
 */
export function DetailDialog<T>({
  value,
  onClose,
  children,
}: {
  value: T | null;
  onClose: () => void;
  children: (value: T) => React.ReactNode;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      {value !== null && children(value)}
    </Dialog>
  );
}
