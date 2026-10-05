import { useCallback, useEffect, useRef, useState } from "react";

export type SoundState = "idle" | "loading" | "playing" | "error";

export interface SoundPlayback {
  /** What the caller asked to play: one clip, or a sequence such as a conversation. */
  id: string;
  /** Which clip of the sequence is loading or playing. */
  index: number;
  state: "loading" | "playing";
  /** Seconds the current clip lasts, once it has loaded. */
  duration: number;
}

const CACHE_SIZE = 64;

/**
 * One player for a page of sounds: playing anything stops what played before. Clips are fetched whole and decoded
 * with Web Audio rather than streamed through an `<audio>` element, whose ranged requests iOS Safari could leave
 * pending forever; the audio context is created and resumed inside the press, which is what unlocks sound on iOS.
 * `play(id, urls)` plays the URLs one after another; `toggle` stops `id` when it is the one playing.
 */
export function useSoundPlayer({ volume = 1 }: { volume?: number } = {}) {
  const [playback, setPlayback] = useState<SoundPlayback | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const runRef = useRef(0);
  const cacheRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const halt = useCallback(() => {
    runRef.current += 1;
    const source = sourceRef.current;
    sourceRef.current = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
  }, []);

  useEffect(
    () => () => {
      halt();
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [halt],
  );

  const load = useCallback((context: AudioContext, url: string) => {
    const cache = cacheRef.current;
    const cached = cache.get(url);
    if (cached) return cached;
    const pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return pending;
  }, []);

  const stop = useCallback(() => {
    halt();
    setPlayback(null);
  }, [halt]);

  const play = useCallback(
    (id: string, urls: string | readonly string[]) => {
      const list = typeof urls === "string" ? [urls] : urls;
      halt();
      const run = runRef.current;
      setFailedId(null);
      if (list.length === 0) {
        setPlayback(null);
        return;
      }
      if (!contextRef.current) {
        const context = new AudioContext();
        const gain = context.createGain();
        gain.gain.value = volumeRef.current;
        gain.connect(context.destination);
        contextRef.current = context;
        gainRef.current = gain;
      }
      const context = contextRef.current;
      void context.resume();

      const step = async (index: number) => {
        if (runRef.current !== run) return;
        if (index >= list.length) {
          setPlayback(null);
          return;
        }
        setPlayback({ id, index, state: "loading", duration: 0 });
        let buffer: AudioBuffer;
        try {
          buffer = await load(context, list[index]);
        } catch {
          if (runRef.current !== run) return;
          setPlayback(null);
          setFailedId(id);
          return;
        }
        if (runRef.current !== run || !gainRef.current) return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gainRef.current);
        source.onended = () => {
          if (sourceRef.current === source) sourceRef.current = null;
          void step(index + 1);
        };
        sourceRef.current = source;
        source.start();
        setPlayback({ id, index, state: "playing", duration: buffer.duration });
      };
      void step(0);
    },
    [halt, load],
  );

  const toggle = useCallback(
    (id: string, urls: string | readonly string[]) => {
      if (playback?.id === id) stop();
      else play(id, urls);
    },
    [playback, play, stop],
  );

  /** The state of `id`, for its button: a sequence counts as playing while any of its clips does. */
  const stateOf = useCallback(
    (id: string): SoundState => {
      if (playback?.id === id) return playback.state;
      return failedId === id ? "error" : "idle";
    },
    [playback, failedId],
  );

  return { playback, play, stop, toggle, stateOf };
}
