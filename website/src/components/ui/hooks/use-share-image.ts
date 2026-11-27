import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type ShareImageAction = "share" | "copy" | "save";
/** `busy` while it runs; `done` or `failed` for a moment after; `idle` again after that or a cancelled share. */
export type ShareImageStatus = "idle" | "busy" | "done" | "failed";
/** What the action came to: a share the reader backed out of is `cancelled`, not a failure. */
export type ShareImageResult = "done" | "cancelled" | "failed";

export interface ShareImageSupport {
  /** The system share sheet takes files (`navigator.canShare({ files })`): phones, and a few desktop browsers. */
  share: boolean;
  /** The clipboard takes a PNG (`ClipboardItem`). */
  copy: boolean;
}

let detected: ShareImageSupport | undefined;

function detectSupport(): ShareImageSupport {
  if (detected) return detected;
  let share = false;
  try {
    const probe = new File([new Uint8Array(0)], "probe.png", { type: "image/png" });
    share = typeof navigator.share === "function" && (navigator.canShare?.({ files: [probe] }) ?? false);
  } catch {
    share = false;
  }
  const clipboardItem = typeof ClipboardItem === "undefined" ? undefined : ClipboardItem;
  const copy =
    clipboardItem !== undefined &&
    typeof navigator.clipboard?.write === "function" &&
    (typeof clipboardItem.supports !== "function" || clipboardItem.supports("image/png"));
  detected = { share, copy };
  return detected;
}

const subscribe = () => () => {};

/**
 * What this browser can do with an image: `null` on the server and while hydrating (the server cannot know), the
 * answer from the first client render after.
 */
export function useShareImageSupport(): ShareImageSupport | null {
  return useSyncExternalStore(subscribe, detectSupport, () => null);
}

const IDLE: Record<ShareImageAction, ShareImageStatus> = { share: "idle", copy: "idle", save: "idle" };

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Shares, copies and saves an image (a `Blob`) and reports each action's status for `resetAfter` milliseconds, so a
 * control can show it running, done or failed. Headless: no toast, no markup. `support` says which actions the
 * browser has (null until hydrated); calling one it lacks fails. Every action resolves to a `ShareImageResult` and never
 * throws; a second call while one of the same kind runs is ignored (`failed`).
 *
 * Call `share` and `copy` straight from the press, with the image already made where possible: the browser allows
 * them only during a user gesture. `copy` also takes a promise of the image, which keeps the gesture while it resolves.
 */
export function useShareImage({ resetAfter = 2500 }: { resetAfter?: number } = {}) {
  const support = useShareImageSupport();
  const [status, setStatus] = useState(IDLE);
  const timers = useRef<Partial<Record<ShareImageAction, ReturnType<typeof setTimeout>>>>({});
  const running = useRef(new Set<ShareImageAction>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  const run = useCallback(
    async (action: ShareImageAction, task: () => Promise<void>): Promise<ShareImageResult> => {
      if (running.current.has(action)) return "failed";
      running.current.add(action);
      clearTimeout(timers.current[action]);
      setStatus((current) => ({ ...current, [action]: "busy" }));
      let result: ShareImageResult = "done";
      try {
        await task();
      } catch (error) {
        result = isAbort(error) ? "cancelled" : "failed";
      }
      running.current.delete(action);
      setStatus((current) => ({ ...current, [action]: result === "cancelled" ? "idle" : result }));
      if (result !== "cancelled") {
        timers.current[action] = setTimeout(
          () => setStatus((current) => ({ ...current, [action]: "idle" })),
          resetAfter,
        );
      }
      return result;
    },
    [resetAfter],
  );

  /** Opens the system share sheet with the image as a file named `filename`; `text` goes along where the app takes it. */
  const share = useCallback(
    (image: Blob, { filename, title, text }: { filename: string; title?: string; text?: string }) =>
      run("share", async () => {
        const file = new File([image], filename, { type: image.type || "image/png" });
        await navigator.share({ files: [file], title, text });
      }),
    [run],
  );

  /** Puts the image on the clipboard as a PNG. */
  const copy = useCallback(
    (image: Blob | Promise<Blob>) =>
      run("copy", async () => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      }),
    [run],
  );

  /** Saves the image to disk as `filename`. */
  const save = useCallback(
    (image: Blob, filename: string) =>
      run("save", async () => {
        const url = URL.createObjectURL(image);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    [run],
  );

  return { support, status, share, copy, save };
}
