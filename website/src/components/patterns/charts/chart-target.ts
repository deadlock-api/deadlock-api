import { cn } from "~/lib/utils";

type Props = Record<string, unknown> & { className?: string };

/**
 * One drawn element for two canvas behaviours, as `useChartZoom` and `useChartProbe` on a map: their `targetProps`
 * merged. Each `on*` handler runs `first`'s, then `second`'s unless the first handled the event (`preventDefault`):
 * zoomed, the arrow keys pan the map under the probe; unzoomed, they step the probe. Other props are `first`'s where
 * both set one; the classes are joined.
 */
export function mergeChartTargetProps<A extends Props, B extends Props>(first: A, second: B): A & B {
  const merged: Props = { ...second, ...first, className: cn(first.className, second.className) };
  for (const [key, own] of Object.entries(first)) {
    const other = second[key];
    if (!key.startsWith("on") || typeof own !== "function" || typeof other !== "function") continue;
    merged[key] = (event: { defaultPrevented: boolean }) => {
      own(event);
      if (!event.defaultPrevented) other(event);
    };
  }
  return merged as A & B;
}
