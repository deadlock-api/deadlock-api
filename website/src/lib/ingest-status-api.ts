import { fetchApi } from "~/lib/http";

/** Whether the ingest tool recently uploaded matches for an account, which unlocks its player tracker. */
export interface IngestStatus {
  account_id: number;
  active: boolean;
  /** Unix seconds of the newest verified upload within the window. */
  last_upload_at: number | null;
  window_days: number;
}

export function getIngestStatus(accountId: number): Promise<IngestStatus> {
  return fetchApi<IngestStatus>(`/v1/players/${accountId}/ingest-status`, { credentials: "omit" });
}
