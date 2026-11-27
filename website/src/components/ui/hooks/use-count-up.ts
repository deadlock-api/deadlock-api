import { type RefObject, useEffect, useState } from "react";

/** A number written as text ("2,842", "51.1%", "163.1K"): what comes before and after it, and how it is printed. */
interface CountableNumber {
  prefix: string;
  value: number;
  suffix: string;
  decimals: number;
  grouped: boolean;
}

const NUMBER = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\D*)$/;

/** The number inside `text`, or null when the text is not one number with an optional prefix and suffix. */
export function parseCountable(text: string): CountableNumber | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const [, prefix = "", whole = "", fraction = "", suffix = ""] = match;
  // Only a sign before it and a unit symbol after it: "Ascendant 4", "Oct 14" or "30:51" are words or two numbers.
  if (!/^[+-]?$/.test(prefix) || !/^(%|[KMB]|x)?$/.test(suffix)) return null;
  const value = Number(`${whole.replaceAll(",", "")}${fraction ? `.${fraction}` : ""}`);
  if (!Number.isFinite(value)) return null;
  return { prefix, value, suffix, decimals: fraction.length, grouped: whole.includes(",") };
}

/** `number` printed like the original text. */
export function formatCountable(number: CountableNumber, value: number): string {
  const digits = value.toFixed(number.decimals);
  const [whole = "", fraction] = digits.split(".");
  const wholeText = number.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${number.prefix}${wholeText}${fraction ? `.${fraction}` : ""}${number.suffix}`;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts a number in text up from zero the first time the element behind `ref` scrolls into view, for a headline figure. Returns
 * the text to show: `text` itself on the server, during hydration, for anything that is not a single number, under
 * reduced motion, and for an element already on screen when the page loads (so what the server sent never changes
 * under the reader). Print the real value for assistive technology beside it: the shown text passes through
 * intermediate numbers.
 */
export function useCountUp(ref: RefObject<Element | null>, text: string | null, durationMs = 1200): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    const number = text == null ? null : parseCountable(text);
    if (!element || !number || number.value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let armed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        if (!entry.isIntersecting) {
          // Only an element that starts off screen counts: one in view at load keeps the server's text.
          armed = true;
          return;
        }
        if (!armed) {
          observer.disconnect();
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min((now - start) / durationMs, 1);
          setShown(t >= 1 ? null : formatCountable(number, number.value * easeOut(t)));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        setShown(formatCountable(number, 0));
        frame = requestAnimationFrame(step);
      },
      // The middle of the screen: a figure counts once it is well in view, not as its first pixel scrolls in.
      { rootMargin: "-20% 0px -20% 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, text, durationMs]);
  return shown ?? text;
}
