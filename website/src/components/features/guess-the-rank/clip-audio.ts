import { readStoredJson, writeLocalStorage } from "~/lib/local-storage";

// The viewer's volume and mute carry over from one clip to the next, to the other clips on the page, and to the next
// visit.

const STORAGE_KEY = "guess-the-rank:clip-audio";

interface ClipAudio {
  volume: number;
  muted: boolean;
}

function isClipAudio(value: unknown): value is ClipAudio {
  if (typeof value !== "object" || value === null) return false;
  const { volume, muted } = value as Record<string, unknown>;
  return typeof volume === "number" && volume >= 0 && volume <= 1 && typeof muted === "boolean";
}

/** Kept in memory as well, so the setting still carries over between clips when storage is unavailable. */
let current: ClipAudio | null = null;

function stored(): ClipAudio | null {
  if (current) return current;
  const value = readStoredJson<unknown>(STORAGE_KEY, null);
  current = isClipAudio(value) ? value : null;
  return current;
}

const mounted = new Set<HTMLVideoElement>();

function apply(video: HTMLVideoElement, audio: ClipAudio) {
  // Only on a change, so the volumechange this fires does not set the others again.
  if (video.volume !== audio.volume) video.volume = audio.volume;
  if (video.muted !== audio.muted) video.muted = audio.muted;
}

/** Ref for a clip's `<video>`: it starts at the volume and mute the viewer last chose and follows later changes. */
export function applyClipAudio(video: HTMLVideoElement) {
  const audio = stored();
  if (audio) apply(video, audio);
  mounted.add(video);
  return () => {
    mounted.delete(video);
  };
}

/** `onVolumeChange` for a clip: remembers the viewer's choice for the clips after it. */
export function rememberClipAudio(event: React.SyntheticEvent<HTMLVideoElement>) {
  const { volume, muted } = event.currentTarget;
  current = { volume, muted };
  writeLocalStorage(STORAGE_KEY, JSON.stringify(current));
  for (const video of mounted) apply(video, current);
}
