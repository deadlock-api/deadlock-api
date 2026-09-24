import type { Salts } from "~/lib/ingest-cache-scanner";

/** The API (`POST /v1/matches/salts`) answers 400 to a request with more salts than this, or with none. */
export const MAX_SALTS_PER_REQUEST = 1000;

/**
 * One entry per match and cluster. The cache holds a file per download, so the same match shows up once per
 * metadata or replay download, often several times; its metadata and replay salts are merged into one entry.
 */
export function dedupeSalts(salts: Iterable<Salts>): Salts[] {
  const byMatch = new Map<string, Salts>();
  for (const salt of salts) {
    const key = `${salt.match_id}:${salt.cluster_id}`;
    const seen = byMatch.get(key);
    if (seen) {
      byMatch.set(key, {
        ...seen,
        metadata_salt: seen.metadata_salt ?? salt.metadata_salt,
        replay_salt: seen.replay_salt ?? salt.replay_salt,
      });
    } else {
      byMatch.set(key, { ...salt });
    }
  }
  return Array.from(byMatch.values());
}

/** Splits `items` into runs of at most `size`, in order. */
export function toBatches<T>(items: readonly T[], size: number = MAX_SALTS_PER_REQUEST): T[][] {
  if (size < 1) throw new RangeError(`Batch size must be at least 1, got ${size}`);
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

export type BatchResult = { ok: true; ingested: number | null } | { ok: false; error: string };

export interface UploadSummary {
  /** Matches in the batches the API accepted. */
  sent: number;
  /** Matches in the batches it refused or that never arrived. */
  failed: number;
  /** Matches the API did not have yet, summed over accepted batches that reported it. */
  ingested: number;
  /** The first error, to show the user. */
  error: string | null;
}

/**
 * Sends `salts` in batches of at most `MAX_SALTS_PER_REQUEST`, one after another. A failed batch does not stop the
 * rest; `onProgress` gets the number of matches handled so far, sent or failed.
 */
export async function uploadInBatches(
  salts: readonly Salts[],
  send: (batch: Salts[]) => Promise<BatchResult>,
  onProgress: (handled: number) => void = () => {},
): Promise<UploadSummary> {
  const summary: UploadSummary = { sent: 0, failed: 0, ingested: 0, error: null };
  for (const batch of toBatches(salts)) {
    let result: BatchResult;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time, so progress is in order and the API is not flooded
      result = await send(batch);
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (result.ok) {
      summary.sent += batch.length;
      summary.ingested += result.ingested ?? 0;
    } else {
      summary.failed += batch.length;
      summary.error ??= result.error;
    }
    onProgress(summary.sent + summary.failed);
  }
  return summary;
}
