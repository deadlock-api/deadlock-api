import { useCallback, useEffect, useRef } from "react";

import { getAnalytics } from "~/lib/analytics";

// Guess the Rank's product analytics (PostHog, through the site's `getAnalytics`: production only, cookieless). Every
// event is `guess_the_rank_<name>` and carries the day; round events carry the round and the clip's id. The actual
// rank is only ever sent after the guess for that round (`result_revealed` onwards).

type Properties = Record<string, string | number | boolean | null | readonly number[]>;

export function trackGuessTheRank(name: string, properties: Properties) {
  void getAnalytics().then((posthog) => posthog?.capture(`guess_the_rank_${name}`, properties));
}

/** Where a clip is watched: before its guess, on its answer, or on the day's results. */
export type ClipPhase = "before_guess" | "after_guess" | "summary";

/** What the viewer did with a clip so far. */
export interface WatchStats {
  seconds_watched: number;
  percent_seen: number;
  seeks: number;
  plays: number;
  replays: number;
}

/** Play and pause events of one kind are sent at most this often; seeks while scrubbing are merged into one. */
const MIN_EVENT_GAP_MS = 1000;
const SEEK_SETTLE_MS = 600;
/** A timeupdate further from the last one than this is a jump (a seek), not playback. */
const MAX_PLAYBACK_STEP_S = 1.5;

interface ClipState {
  /** Seconds played, without the jumps of a seek. */
  watched: number;
  /** Whole seconds of the clip that played at least once. */
  seen: Set<number>;
  seeks: number;
  plays: number;
  replays: number;
  duration: number;
  lastTime: number | null;
  ended: boolean;
  seeking: boolean;
  lastSent: Record<string, number>;
  pendingSeek: { from: number; to: number; timer: ReturnType<typeof setTimeout> } | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Tracks how one clip is watched, without an event per timeupdate: the returned handlers go on the `Video`, the
 * running totals (time watched, share of the clip seen, seeks, replays) are read with `stats()` when the guess is
 * sent. Play, pause, seek, end, replay and load errors are events of their own, throttled.
 */
export function useClipAnalytics(base: { date: string; round: number; video_id: string }, phase: ClipPhase) {
  const state = useRef<ClipState>({
    watched: 0,
    seen: new Set(),
    seeks: 0,
    plays: 0,
    replays: 0,
    duration: 0,
    lastTime: null,
    ended: false,
    seeking: false,
    lastSent: {},
    pendingSeek: null,
  });
  const context = useRef({ ...base, phase });
  useEffect(() => {
    context.current = { ...base, phase };
  });

  const send = useCallback((name: string, properties: Properties = {}, throttle = false) => {
    const s = state.current;
    const now = Date.now();
    if (throttle && now - (s.lastSent[name] ?? 0) < MIN_EVENT_GAP_MS) return;
    s.lastSent[name] = now;
    trackGuessTheRank(name, { ...context.current, ...properties });
  }, []);

  const flushSeek = useCallback(() => {
    const pending = state.current.pendingSeek;
    if (!pending) return;
    clearTimeout(pending.timer);
    state.current.pendingSeek = null;
    send("video_seeked", { from_s: round1(pending.from), to_s: round1(pending.to) });
  }, [send]);

  // A seek still settling when the clip goes away is sent, not lost.
  useEffect(() => flushSeek, [flushSeek]);

  const stats = useCallback((): WatchStats => {
    const s = state.current;
    const seconds = s.duration > 0 ? Math.ceil(s.duration) : 0;
    return {
      seconds_watched: round1(s.watched),
      percent_seen: seconds > 0 ? Math.min(100, Math.round((s.seen.size / seconds) * 100)) : 0,
      seeks: s.seeks,
      plays: s.plays,
      replays: s.replays,
    };
  }, []);

  const handlers = {
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      state.current.duration = event.currentTarget.duration;
    },
    onPlay: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const s = state.current;
      s.plays += 1;
      if (s.ended) {
        s.ended = false;
        s.replays += 1;
        send("video_replay", { replays: s.replays });
      }
      send("video_play", { at_s: round1(event.currentTarget.currentTime), plays: s.plays }, true);
    },
    onPause: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      // The pause that comes with the end of the clip is `video_ended`.
      if (video.ended) return;
      send("video_pause", { at_s: round1(video.currentTime), seconds_watched: round1(state.current.watched) }, true);
    },
    onSeeking: () => {
      const s = state.current;
      s.seeking = true;
      s.ended = false;
    },
    onSeeked: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const s = state.current;
      const to = event.currentTarget.currentTime;
      s.seeking = false;
      s.seeks += 1;
      const from = s.pendingSeek?.from ?? s.lastTime ?? 0;
      if (s.pendingSeek) clearTimeout(s.pendingSeek.timer);
      s.pendingSeek = { from, to, timer: setTimeout(flushSeek, SEEK_SETTLE_MS) };
      s.lastTime = to;
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const s = state.current;
      const now = event.currentTarget.currentTime;
      if (!s.seeking && s.lastTime !== null) {
        const step = now - s.lastTime;
        if (step > 0 && step < MAX_PLAYBACK_STEP_S) {
          s.watched += step;
          for (let second = Math.floor(s.lastTime); second <= Math.floor(now); second++) s.seen.add(second);
        }
      }
      s.lastTime = now;
    },
    onEnded: () => {
      const s = state.current;
      s.ended = true;
      send("video_ended", { seconds_watched: round1(s.watched), plays: s.plays });
    },
    onError: (event: React.SyntheticEvent<HTMLVideoElement>) => {
      send("error", { kind: "video_load", code: event.currentTarget.error?.code ?? null });
    },
  };

  return { handlers, stats };
}
