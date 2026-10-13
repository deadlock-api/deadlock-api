import { useCallback, useRef, useState } from "react";

/**
 * Saves a file to the user's disk. A cross-origin URL ignores `<a download>` and opens in the tab instead, so the file
 * is fetched (its host has to allow CORS) and saved from a blob under `filename`. `download` resolves to whether it
 * worked; it never throws.
 */
export function useDownload() {
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const pending = useRef(false);

  const download = useCallback(async (href: string, filename?: string) => {
    if (pending.current) return false;
    pending.current = true;
    setStatus("loading");
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? new URL(href, window.location.href).pathname.split("/").pop() ?? "download";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("idle");
      return true;
    } catch {
      setStatus("failed");
      return false;
    } finally {
      pending.current = false;
    }
  }, []);

  return { loading: status === "loading", failed: status === "failed", download };
}
