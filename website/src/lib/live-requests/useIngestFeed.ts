import { useEffect, useState } from "react";

import type { IngestedMatch, IngestEntry, IngestFlush } from "./feed";
import { regionArea, WORLD_AREAS, type WorldArea } from "./server-regions";
import type { LiveListener } from "./useLiveRequests";

/**
 * The worker writes about once a minute, in flushes of very different sizes (a thousand matches, then one). Every
 * flush's sample joins one queue, and the queue drains at a rate in proportion to its length: all of it over about
 * one flush interval. It slows as it empties and never runs dry before the next flush refills it, so the list moves
 * as a steady stream, without the pause a flush played out on its own clock left behind a small one.
 */
const DRAIN_DEFAULT_MS = 60_000;
/** The drain horizon follows the flush interval, within these bounds. */
const DRAIN_MIN_MS = 30_000;
const DRAIN_MAX_MS = 150_000;
/** The slowest the list moves while matches wait: one every 3 s. */
const MIN_RATE = 1 / 3000;
/** Most matches waiting; beyond it the oldest waiting ones are skipped, so the list does not fall far behind. */
const MAX_QUEUE = 600;
/** How often matches are released: one or two at a time, each a render of the panel. */
const STEP_MS = 400;
/** Matches the list keeps; the oldest leave at the bottom. More than the tallest list shows. */
const MAX_ROWS = 16;
/**
 * The ages ("3 minutes ago") are measured against a clock that moves this often, so the rows already shown keep
 * their props between releases and are not rendered again.
 */
const CLOCK_MS = 15_000;
/** Flushes the rate and the chart cover: about half an hour. */
const MAX_FLUSHES = 30;
/** A match that ended within this long is "fresh"; older ones come from uploaded history. */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** A match as the list shows it. */
export interface ShownMatch extends IngestedMatch {
  /** Unique across flushes, for React keys. */
  key: string;
  /** When it ended, unix ms. */
  endedAt: number;
}

export interface IngestFeed {
  /** The newest matches first. */
  matches: ShownMatch[];
  /** The flushes seen, oldest first, at most half an hour of them. */
  flushes: IngestFlush[];
  /** Matches written per minute over `flushes`; null before there are two of them. */
  perMinute: number | null;
  /** Matches written since the page opened, counting up as their sample plays out. */
  counted: number;
  /** The sampled matches of the flushes seen, by the part of the world their server is in (plus unknown). */
  areas: Record<WorldArea | "unknown", number>;
  /** Share of the sampled matches that ended within a day; null before the first. */
  freshShare: number | null;
  /**
   * The clock the ages are measured against, unix ms, moving every 15 s; null before the first flush (and on the
   * server).
   */
  now: number | null;
}

const NO_AREAS = Object.fromEntries([...WORLD_AREAS, "unknown"].map((area) => [area, 0])) as IngestFeed["areas"];

const EMPTY: IngestFeed = {
  matches: [],
  flushes: [],
  perMinute: null,
  counted: 0,
  areas: NO_AREAS,
  freshShare: null,
  now: null,
};

interface Due {
  match: ShownMatch;
  /** Written matches this one stands for: the flush's total over its sample. */
  weight: number;
}

/** The typical time between flushes (the median of the recent ones), within the drain bounds. */
function drainMs(flushes: IngestFlush[]): number {
  const gaps = flushes
    .slice(1)
    .map((flush, i) => flush.at - flushes[i].at)
    .sort((a, b) => a - b);
  if (!gaps.length) return DRAIN_DEFAULT_MS;
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.min(DRAIN_MAX_MS, Math.max(DRAIN_MIN_MS, median));
}

/** Matches per minute over the flushes: everything after the first, over the time since it. */
function perMinute(flushes: IngestFlush[]): number | null {
  if (flushes.length < 2) return null;
  const minutes = (flushes[flushes.length - 1].at - flushes[0].at) / 60_000;
  if (minutes <= 0) return null;
  return flushes.slice(1).reduce((sum, flush) => sum + flush.total, 0) / minutes;
}

function withFlush(flushes: IngestFlush[], flush: IngestFlush): IngestFlush[] {
  if (flushes.some((f) => f.at === flush.at)) return flushes;
  return [...flushes, flush].sort((a, b) => a.at - b.at).slice(-MAX_FLUSHES);
}

/**
 * The matches the ingest worker writes, played out as a stream: each flush's sample is spread over the minute until
 * the next one. Hand it the live feed's `subscribe`.
 */
export function useIngestFeed(subscribe: (listener: LiveListener) => () => void): IngestFeed {
  const [feed, setFeed] = useState<IngestFeed>(EMPTY);

  useEffect(() => {
    // The feed lives here and React gets each new version: the counters below are not React state.
    let state = EMPTY;
    const publish = (next: IngestFeed) => {
      state = next;
      setFeed(next);
    };
    const queue: Due[] = [];
    const seen = new Set<number>();
    let sampled = 0;
    let fresh = 0;
    const clock = (now: number) => Math.floor(now / CLOCK_MS) * CLOCK_MS;

    // Matches owed to the list, fractional between releases.
    let owed = 0;
    let lastStep = Date.now();

    const release = (now: number) => {
      const elapsed = now - lastStep;
      lastStep = now;
      // A short queue still moves at a row every few seconds instead of creeping.
      owed = queue.length ? owed + Math.max(queue.length / drainMs(state.flushes), MIN_RATE) * elapsed : 0;
      const count = Math.min(queue.length, Math.floor(owed));
      owed -= count;
      if (!count) {
        if (state.now !== null && clock(now) !== state.now) publish({ ...state, now: clock(now) });
        return;
      }
      const due = queue.splice(0, count);
      const counted = due.reduce((sum, d) => sum + d.weight, state.counted);
      const newest = due.map((d) => d.match).reverse();
      publish({
        ...state,
        matches: [...newest, ...state.matches].slice(0, MAX_ROWS),
        counted,
        now: clock(now),
      });
    };

    const onIngest = (entry: IngestEntry) => {
      if (seen.has(entry.at)) return;
      seen.add(entry.at);
      const now = Date.now();
      const weight = entry.matches.length ? entry.total / entry.matches.length : 0;
      for (const match of entry.matches) {
        queue.push({
          match: { ...match, key: `${entry.at}-${match.matchId}`, endedAt: (match.startTime + match.durationS) * 1000 },
          weight,
        });
      }
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      // Where the flush's matches were played and how old they are, once for the flush rather than per row.
      const areas = { ...state.areas };
      for (const match of entry.matches) {
        areas[(match.region ? regionArea(match.region) : null) ?? "unknown"]++;
        if (now - (match.startTime + match.durationS) * 1000 < FRESH_MS) fresh++;
      }
      sampled += entry.matches.length;
      const flushes = withFlush(state.flushes, { at: entry.at, total: entry.total });
      publish({
        ...state,
        flushes,
        perMinute: perMinute(flushes),
        areas,
        freshShare: sampled ? fresh / sampled : null,
        now: state.now ?? clock(now),
      });
    };

    const onIngestHistory = (history: IngestFlush[]) => {
      const flushes = history.reduce(withFlush, state.flushes);
      publish({ ...state, flushes, perMinute: perMinute(flushes) });
    };

    const unsubscribe = subscribe({ onIngest, onIngestHistory });
    const timer = window.setInterval(() => release(Date.now()), STEP_MS);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [subscribe]);

  return feed;
}
