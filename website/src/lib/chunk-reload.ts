const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
];

const RELOAD_FLAG = "deadlock:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 10_000;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? `${err.name}: ${err.message}`
        : typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "";
  if (!msg) return false;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(msg));
}

export function reloadOnceForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? "0");
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode etc.) — fall through and reload anyway
  }
  window.location.reload();
  return true;
}

let installed = false;

export function installChunkReloadHandlers() {
  if (typeof window === "undefined") return;
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      reloadOnceForStaleChunk();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnceForStaleChunk();
    }
  });
}
