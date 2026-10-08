/**
 * Runs `callback` once the browser is idle, at most `timeout` ms later; Safari has no requestIdleCallback, so there it
 * runs after `fallbackDelay` ms. Returns the cancel function, ready to be an Effect's cleanup.
 */
export function runWhenIdle(callback: () => void, timeout: number, fallbackDelay: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, fallbackDelay);
  return () => clearTimeout(id);
}
