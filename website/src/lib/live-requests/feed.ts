import { CLOUDFLARE_COLOS, LAND_GRID, LAND_MASK } from "./geo-data";

/** Where the API runs: Hetzner, Helsinki. */
export const ORIGIN = { lat: 60.17, lon: 24.94, city: "Helsinki" } as const;

/** One sampled request of the feed. */
export interface LiveRequest {
  /** When it finished, in milliseconds after the batch's start. */
  offsetMs: number;
  /** Where the client is (city-level, from Cloudflare); null when unknown. */
  lat: number | null;
  lon: number | null;
  country: string | null;
  /**
   * IATA code of the Cloudflare data center the client reached: the one nearest it, which is the one a client almost
   * always reaches. Without the client's location, the `hop`.
   */
  edge: string | null;
  /**
   * IATA code of the Cloudflare data center that handed the request to our server (the Ray id's), one near the server
   * whatever the client's edge.
   */
  hop: string | null;
  route: string;
  status: number;
  durationMs: number;
  bytes: number;
  /** Database rows its queries read; 0 when it ran none (a cached answer). */
  rowsRead: number;
}

/** One message of `/v1/info/live-requests`: half a second of traffic. */
export interface LiveBatch {
  /** Unix time of the batch's start, in milliseconds. */
  start: number;
  /** Requests served in it, including the ones not sampled. */
  total: number;
  /** What the server was working on at its end. */
  queue: LiveQueue;
  /** Database (ClickHouse) work of all its requests, sampled or not. */
  db: { queries: number; rowsRead: number; bytesRead: number };
  requests: LiveRequest[];
}

/** What the server is working on: API requests in progress, and the database queries behind them. */
export interface LiveQueue {
  /** API requests in progress at the end of the batch. */
  inFlight: number;
  /** The most API requests in progress at once during the batch. */
  peak: number;
  /** Database (ClickHouse) queries running, waiting for a slot, and the slots there are. */
  dbRunning: number;
  dbWaiting: number;
  dbSlots: number;
}

type WireRow = [
  number,
  number | null,
  number | null,
  string | null,
  string | null,
  number,
  number,
  number,
  number,
  number?,
];

interface WireBatch {
  t: number;
  d: number;
  n: number;
  q?: number;
  qp?: number;
  cr?: number;
  cw?: number;
  cl?: number;
  cq?: number;
  rr?: number;
  rb?: number;
  r: string[];
  e: WireRow[];
}

/** What Cloudflare answered itself, without our server. */
export const EDGE_KINDS = ["apiCache", "website", "assets", "other", "lake"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** One (kind, data center, client country) group of a minute of Cloudflare-served requests. */
export interface EdgeGroup {
  kind: EdgeKind;
  colo: string;
  country: string;
  count: number;
}

/** A minute of the requests Cloudflare answered itself, a few minutes behind real time. */
export interface EdgeMinute {
  /** Unix time of the minute's start, in milliseconds. */
  start: number;
  groups: EdgeGroup[];
  /** Requests per second of each kind. */
  perSecond: Record<EdgeKind, number>;
  /** The zone's cache in the minute; null when the feed does not carry it. */
  cache: EdgeCache | null;
  /** The data lake's requests and bytes since midnight UTC; null when unavailable. */
  lakeToday: { requests: number; bytes: number } | null;
}

/** Requests and response bytes Cloudflare served in a minute, all and from its cache, for every host and the API. */
export interface EdgeCache {
  requests: number;
  cachedRequests: number;
  bytes: number;
  cachedBytes: number;
  apiRequests: number;
  apiCachedRequests: number;
  /** The data lake's requests and bytes in the minute. */
  lakeRequests: number;
  lakeBytes: number;
}

interface WireEdgeMinute {
  m: number;
  g: [number, string, string, number][];
  s?: { tr: number; cr: number; tb: number; cb: number; at: number; ac: number; lr?: number; lb?: number };
  d?: { lr: number; lb: number } | null;
}

function parseEdgeMinute(wire: WireEdgeMinute): EdgeMinute | null {
  if (typeof wire?.m !== "number" || !Array.isArray(wire.g)) return null;
  const perSecond: Record<EdgeKind, number> = { apiCache: 0, website: 0, assets: 0, other: 0, lake: 0 };
  const groups: EdgeGroup[] = [];
  for (const [kindIndex, colo, country, count] of wire.g) {
    const kind = EDGE_KINDS[kindIndex];
    if (!kind || !CLOUDFLARE_COLOS[colo]) continue;
    groups.push({ kind, colo, country, count });
    perSecond[kind] += count / 60;
  }
  const s = wire.s;
  const cache: EdgeCache | null = s
    ? {
        requests: s.tr,
        cachedRequests: s.cr,
        bytes: s.tb,
        cachedBytes: s.cb,
        apiRequests: s.at,
        apiCachedRequests: s.ac,
        lakeRequests: s.lr ?? 0,
        lakeBytes: s.lb ?? 0,
      }
    : null;
  const lakeToday = wire.d ? { requests: wire.d.lr, bytes: wire.d.lb } : null;
  return { start: wire.m * 60_000, groups, perSecond, cache, lakeToday };
}

/** One SSE message: a batch of our server's requests, a new minute of Cloudflare's, or both. */
export interface LiveMessage {
  batch: LiveBatch | null;
  edge: EdgeMinute | null;
}

/** Parses one SSE message. */
export function parseMessage(data: string): LiveMessage {
  let wire: WireBatch & { hm?: WireEdgeMinute };
  try {
    wire = JSON.parse(data) as WireBatch & { hm?: WireEdgeMinute };
  } catch {
    return { batch: null, edge: null };
  }
  return { batch: parseBatch(wire), edge: wire?.hm ? parseEdgeMinute(wire.hm) : null };
}

function parseBatch(wire: WireBatch): LiveBatch | null {
  if (typeof wire?.n !== "number" || !Array.isArray(wire.e) || !Array.isArray(wire.r)) return null;
  const requests: LiveRequest[] = [];
  for (const row of wire.e) {
    if (!Array.isArray(row) || row.length < 9) continue;
    const [offsetMs, lat, lon, country, colo, routeIndex, status, durationMs, bytes, rowsRead = 0] = row;
    const hop = colo && CLOUDFLARE_COLOS[colo] ? colo : null;
    const located = lat !== null && lon !== null;
    requests.push({
      offsetMs,
      lat: located ? lat : null,
      lon: located ? lon : null,
      country,
      edge: located ? nearestColo(lat, lon) : hop,
      hop,
      route: wire.r[routeIndex] ?? "",
      status,
      durationMs,
      bytes,
      rowsRead,
    });
  }
  const queue: LiveQueue = {
    inFlight: wire.q ?? 0,
    peak: wire.qp ?? wire.q ?? 0,
    dbRunning: wire.cr ?? 0,
    dbWaiting: wire.cw ?? 0,
    dbSlots: wire.cl ?? 0,
  };
  const db = { queries: wire.cq ?? 0, rowsRead: wire.rr ?? 0, bytesRead: wire.rb ?? 0 };
  return { start: wire.t, total: wire.n, queue, db, requests };
}

const COLO_LIST = Object.entries(CLOUDFLARE_COLOS).map(([code, [lat, lon]]) => ({ code, lat, lon }));
const nearestCache = new Map<string, string>();

/**
 * The Cloudflare data center nearest a point, by distance on an equirectangular projection scaled for latitude: close
 * enough to pick between neighbours. Cached per point (the feed rounds coordinates to 0.1°).
 */
export function nearestColo(lat: number, lon: number): string {
  const key = `${lat},${lon}`;
  const cached = nearestCache.get(key);
  if (cached) return cached;
  const scale = Math.cos((lat * Math.PI) / 180);
  let best = COLO_LIST[0].code;
  let bestDistance = Infinity;
  for (const colo of COLO_LIST) {
    let dLon = Math.abs(colo.lon - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const distance = (colo.lat - lat) ** 2 + (dLon * scale) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = colo.code;
    }
  }
  if (nearestCache.size > 10_000) nearestCache.clear();
  nearestCache.set(key, best);
  return best;
}

/** The class a status falls in, which picks the color of its response. */
export type StatusClass = "ok" | "client-error" | "server-error";

export function statusClass(status: number): StatusClass {
  if (status >= 500) return "server-error";
  if (status >= 400) return "client-error";
  return "ok";
}

/** A Cloudflare data center's city, or its code when it is unknown. */
export function coloCity(colo: string): string {
  return CLOUDFLARE_COLOS[colo]?.[2] ?? colo;
}

/** The map's latitude span: the land grid's, which crops Antarctica and the far north. */
export const MAP_SPAN = { top: LAND_GRID.top, bottom: LAND_GRID.bottom } as const;

/** Width over height of the equirectangular map. */
export const MAP_ASPECT = 360 / (MAP_SPAN.top - MAP_SPAN.bottom);

/** Where the map sits in a box of `width` × `height`: as large as fits, centred. */
export interface MapFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitMap(width: number, height: number): MapFrame {
  const mapWidth = Math.min(width, height * MAP_ASPECT);
  const mapHeight = mapWidth / MAP_ASPECT;
  return { x: (width - mapWidth) / 2, y: (height - mapHeight) / 2, width: mapWidth, height: mapHeight };
}

/** A point on the map frame (equirectangular). */
export function project(frame: MapFrame, lat: number, lon: number): [number, number] {
  return [
    frame.x + ((lon + 180) / 360) * frame.width,
    frame.y + ((MAP_SPAN.top - lat) / (MAP_SPAN.top - MAP_SPAN.bottom)) * frame.height,
  ];
}

/** The centres of the land cells, as latitude/longitude pairs, decoded once. */
let landCells: Float32Array | null = null;

export function landPoints(): Float32Array {
  if (landCells) return landCells;
  const bytes = Uint8Array.from(atob(LAND_MASK), (c) => c.charCodeAt(0));
  const points: number[] = [];
  for (let i = 0; i < LAND_GRID.rows * LAND_GRID.cols; i++) {
    if ((bytes[i >> 3] >> (i & 7)) & 1) {
      const row = Math.floor(i / LAND_GRID.cols);
      const col = i % LAND_GRID.cols;
      points.push(LAND_GRID.top - (row + 0.5) * LAND_GRID.step, -180 + (col + 0.5) * LAND_GRID.step);
    }
  }
  landCells = Float32Array.from(points);
  return landCells;
}

/** Every known Cloudflare data center as [code, latitude, longitude]. */
export function colos(): [string, number, number][] {
  return Object.entries(CLOUDFLARE_COLOS).map(([code, [lat, lon]]) => [code, lat, lon]);
}
