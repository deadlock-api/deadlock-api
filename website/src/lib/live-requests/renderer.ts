import {
  colos,
  EDGE_KINDS,
  type EdgeMinute,
  fitMap,
  isLand,
  landPoints,
  type LiveBatch,
  type MapFrame,
  onLand,
  ORIGIN,
  project,
  statusClass,
} from "./feed";
import { CLOUDFLARE_COLOS } from "./geo-data";

/** The map's colors, read from the `--live-map-*` tokens by the component that owns the canvases. */
export interface LiveMapPalette {
  land: string;
  edge: string;
  request: string;
  ok: string;
  clientError: string;
  serverError: string;
  origin: string;
  apiCache: string;
  website: string;
  assets: string;
  other: string;
  lake: string;
}

/** Color slots: a request on its way in, its response by status, then the five kinds Cloudflare answers itself. */
const IN = 0;
const OK = 1;
const EDGE_SLOT = 4;
const SLOTS = 9;

/**
 * A request's round trip. To our server: client → its Cloudflare edge → the data center that hands it to us → our
 * server, and back. Answered by Cloudflare: client → its edge → back. Stops that coincide are dropped.
 */
interface Flight {
  born: number;
  /** The stops from the client on, as x, y pairs. */
  points: number[];
  /** Milliseconds of each leg (between consecutive stops). */
  legs: number[];
  /** Time at the last stop before the way back. */
  dwell: number;
  /** Color slots on the way in and on the way back. */
  inSlot: number;
  outSlot: number;
  /** Data centers on the way, which pulse when the trip starts. */
  colos: string[];
}

/** Most trips on screen; past it new ones are dropped until old ones land. Each costs one small rectangle a frame. */
const MAX_FLIGHTS = 12_000;
/** How long a request's time at our server shows at most, so a slow one does not park a dot for 20 s. */
const MAX_DWELL_MS = 1500;
/** The share of a leg its trail covers behind the moving dot. */
const TRAIL = 0.3;
const TRAIL_STEPS = 4;
/** How long a request shows without motion (reduced motion). */
const STILL_MS = 1200;
/** Pulse of a data center or our server, decaying by half every this many ms. */
const PULSE_HALF_LIFE_MS = 350;
/** Lowest gap between two frames: 60 fps on a 120 Hz screen. */
const FRAME_MS = 15;
/** Longest frame step the Cloudflare traffic is played out for, so a frame after a stall does not burst. */
const MAX_STEP_MS = 250;
/**
 * How far around its data center a Cloudflare-served client is drawn, in degrees (one standard deviation of
 * longitude; latitude 0.7 of it): the region it serves. Only points on land are kept.
 */
const EDGE_SPREAD = 10;
/** Tries for a point on land before a client is drawn at its data center. */
const LAND_TRIES = 20;

function at(t: number, x0: number, y0: number, x1: number, y1: number): [number, number] {
  // A quadratic arc whose control point sits above the midpoint by a fifth of the distance.
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.2;
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** A normally distributed number (Box-Muller), for the spread of clients around a data center. */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * Draws the live request map: a dotted world and Cloudflare's data centers on a still canvas, and on a second one
 * every request as a dot travelling its round trip with a trail over the last stretch of its leg.
 * Nothing runs while nothing moves: the frame loop stops once the last trip lands and the pulses fade.
 */
export class LiveMapRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private frame: MapFrame = { x: 0, y: 0, width: 0, height: 0 };
  private dpr = 1;
  private origin: [number, number] = [0, 0];
  private flights: Flight[] = [];
  private pending: { due: number; flight: Omit<Flight, "born"> }[] = [];
  private edgeMinute: EdgeMinute | null = null;
  /** Requests of each Cloudflare group owed but not yet drawn: fractions carried between frames. */
  private edgeOwed: number[] = [];
  private pulses = new Map<string, number>();
  /** Where each data center is drawn on the current frame, moved onto the map's coast if it sits off it. */
  private coloPoints = new Map<string, [number, number] | null>();
  private originPulse = 0;
  private raf = 0;
  private last = 0;
  private stopped = false;

  constructor(
    private readonly background: HTMLCanvasElement,
    private readonly canvas: HTMLCanvasElement,
    private palette: LiveMapPalette,
    private still: boolean,
  ) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  /** Sizes both canvases to `width` × `height` CSS pixels and redraws the world. */
  resize(width: number, height: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [this.background, this.canvas]) {
      canvas.width = Math.round(width * this.dpr);
      canvas.height = Math.round(height * this.dpr);
    }
    this.frame = fitMap(width, height);
    this.coloPoints.clear();
    this.origin = project(this.frame, ORIGIN.lat, ORIGIN.lon);
    // Trips in flight were placed on the old frame.
    this.flights = [];
    this.pending = [];
    this.paintBackground();
    this.wake();
  }

  setPalette(palette: LiveMapPalette) {
    this.palette = palette;
    this.paintBackground();
    this.wake();
  }

  setStill(still: boolean) {
    this.still = still;
    this.wake();
  }

  /** The minute of Cloudflare-served traffic to play out from now on; null stops it. */
  setEdgeMinute(minute: EdgeMinute | null) {
    this.edgeMinute = minute;
    this.edgeOwed = minute ? minute.groups.map(() => Math.random()) : [];
    this.wake();
  }

  /** Queues a batch's requests to start at the moment they finished, half a second behind the server. */
  push(batch: LiveBatch) {
    if (!this.frame.width) return;
    const now = performance.now();
    for (const r of batch.requests) {
      const points: number[] = [];
      const visited: string[] = [];
      if (r.lat !== null && r.lon !== null) this.stop(points, ...project(this.frame, ...onLand(r.lat, r.lon)));
      for (const code of [r.edge, r.hop]) {
        const at = code ? this.coloAt(code) : null;
        if (!code || !at) continue;
        this.stop(points, at[0], at[1]);
        if (!visited.includes(code)) visited.push(code);
      }
      this.stop(points, this.origin[0], this.origin[1]);
      if (points.length < 4) continue;
      const cls = statusClass(r.status);
      this.pending.push({
        due: now + r.offsetMs,
        flight: {
          points,
          legs: this.legs(points),
          dwell: Math.min(MAX_DWELL_MS, Math.max(60, r.durationMs)),
          inSlot: IN,
          outSlot: cls === "ok" ? OK : cls === "client-error" ? OK + 1 : OK + 2,
          colos: visited,
        },
      });
    }
    this.wake();
  }

  destroy() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }

  private stop(points: number[], x: number, y: number) {
    // A stop within a pixel of the last one is the same place.
    const n = points.length;
    if (n && Math.hypot(points[n - 2] - x, points[n - 1] - y) < 1) return;
    points.push(x, y);
  }

  private legs(points: number[]): number[] {
    const speed = this.frame.width / 2400;
    const legs: number[] = [];
    for (let i = 2; i < points.length; i += 2) {
      const length = Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
      legs.push(Math.min(1200, Math.max(160, length / speed)));
    }
    return legs;
  }

  private wake() {
    if (this.stopped || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    if (now - this.last >= FRAME_MS) {
      const dt = this.last ? now - this.last : 0;
      this.last = now;
      this.spawnEdge(now, Math.min(dt, MAX_STEP_MS));
      this.admit(now);
      this.draw(now, dt);
    }
    const busy =
      this.flights.length > 0 || this.pending.length > 0 || this.originPulse > 0.02 || this.edgeMinute !== null;
    if (busy) this.wake();
    else this.last = 0;
  };

  /** Plays out the Cloudflare minute: every group's requests at its rate, near its data center. */
  private spawnEdge(now: number, dt: number) {
    const minute = this.edgeMinute;
    if (!minute || !dt || !this.frame.width) return;
    const speed = this.frame.width / 2400;
    minute.groups.forEach((group, i) => {
      this.edgeOwed[i] += (group.count * dt) / 60_000;
      if (this.edgeOwed[i] < 1) return;
      const colo = CLOUDFLARE_COLOS[group.colo];
      const at = this.coloAt(group.colo);
      if (!colo || !at) return;
      const [ex, ey] = at;
      const slot = EDGE_SLOT + EDGE_KINDS.indexOf(group.kind);
      for (; this.edgeOwed[i] >= 1; this.edgeOwed[i]--) {
        if (this.flights.length >= MAX_FLIGHTS) continue;
        const [ux, uy] = project(this.frame, ...this.clientNear(colo[0], colo[1]));
        // Spread over the frame, so a busy group does not leave in lockstep.
        this.flights.push({
          born: now - Math.random() * dt,
          points: [ux, uy, ex, ey],
          legs: [Math.max(120, Math.hypot(ex - ux, ey - uy) / speed)],
          dwell: 20,
          inSlot: slot,
          outSlot: slot,
          colos: [],
        });
        // Cloudflare-served requests are many and cheap: a small nudge each, so a busy data center glows, not blots.
        this.pulses.set(group.colo, (this.pulses.get(group.colo) ?? 0) + 0.02);
      }
    });
  }

  /** A data center's point on the map, on land; null when it is unknown. Cached per frame. */
  private coloAt(code: string): [number, number] | null {
    let at = this.coloPoints.get(code);
    if (at === undefined) {
      const colo = CLOUDFLARE_COLOS[code];
      at = colo ? project(this.frame, ...onLand(colo[0], colo[1])) : null;
      this.coloPoints.set(code, at);
    }
    return at;
  }

  /**
   * Where to draw a client of a data center Cloudflare gives no location for: a random point of the region around
   * it, on land. A few tries, then the data center itself (moved onto the map's coast if it sits off it).
   */
  private clientNear(lat: number, lon: number): [number, number] {
    for (let attempt = 0; attempt < LAND_TRIES; attempt++) {
      const la = lat + gauss() * EDGE_SPREAD * 0.7;
      const lo = lon + gauss() * EDGE_SPREAD;
      if (isLand(la, lo)) return [la, lo];
    }
    return onLand(lat, lon);
  }

  private admit(now: number) {
    let kept = 0;
    for (const p of this.pending) {
      if (p.due > now) {
        this.pending[kept++] = p;
      } else if (this.flights.length < MAX_FLIGHTS) {
        this.flights.push({ ...p.flight, born: now });
        for (const colo of p.flight.colos) this.pulses.set(colo, (this.pulses.get(colo) ?? 0) + 1);
        this.originPulse += 0.35;
      }
    }
    this.pending.length = kept;
  }

  private paintBackground() {
    const { background, dpr, frame } = this;
    const ctx = background.getContext("2d");
    if (!ctx || !frame.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, background.width, background.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = frame.width / 360;
    const dot = Math.max(1 / dpr, cell * 0.42);
    // The land is a quiet field of dots under the traffic.
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this.palette.land;
    ctx.beginPath();
    const land = landPoints();
    for (let i = 0; i < land.length; i += 2) {
      const [x, y] = project(frame, land[i], land[i + 1]);
      ctx.rect(x - dot / 2, y - dot / 2, dot, dot);
    }
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = this.palette.edge;
    ctx.beginPath();
    const edgeDot = Math.max(1, cell * 0.5);
    for (const [code] of colos()) {
      const at = this.coloAt(code);
      if (!at) continue;
      const [x, y] = at;
      ctx.rect(x - edgeDot / 2, y - edgeDot / 2, edgeDot, edgeDot);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private draw(now: number, dt: number) {
    const { ctx, dpr, palette } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const decay = dt ? 0.5 ** (dt / PULSE_HALF_LIFE_MS) : 1;
    const cell = this.frame.width / 360;
    const head = Math.max(1.5, cell * 0.9);

    // Trails and heads, one path per color slot.
    const trails = Array.from({ length: SLOTS }, () => new Path2D());
    const heads = Array.from({ length: SLOTS }, () => new Path2D());
    const clients = new Path2D();
    let kept = 0;
    for (const f of this.flights) {
      const age = now - f.born;
      const { points, legs } = f;
      const travel = legs.reduce((sum, leg) => sum + leg, 0);
      if (age >= (this.still ? STILL_MS : 2 * travel + f.dwell)) continue;
      this.flights[kept++] = f;
      clients.rect(points[0] - head / 2, points[1] - head / 2, head, head);
      if (this.still) {
        // Nothing travels: the whole way, drawn still, until it is gone.
        for (let i = 0; i < legs.length; i++) {
          const a = 2 * i;
          this.trail(trails[f.outSlot], points[a], points[a + 1], points[a + 2], points[a + 3], 0, 1);
        }
        continue;
      }
      // Where the trip is: in over the legs, waiting at the last stop, then back over the same legs in reverse.
      let t = age;
      let leg = -1;
      let back = false;
      if (t < travel) {
        leg = 0;
        while (t >= legs[leg]) t -= legs[leg++];
      } else if ((t -= travel) >= f.dwell) {
        t -= f.dwell;
        back = true;
        leg = legs.length - 1;
        while (t >= legs[leg]) t -= legs[leg--];
      }
      if (leg < 0) continue;
      const a = 2 * leg;
      const [x0, y0, x1, y1] = back
        ? [points[a + 2], points[a + 3], points[a], points[a + 1]]
        : [points[a], points[a + 1], points[a + 2], points[a + 3]];
      const slot = back ? f.outSlot : f.inSlot;
      const p = t / legs[leg];
      const [hx, hy] = this.trail(trails[slot], x0, y0, x1, y1, Math.max(0, p - TRAIL), p);
      heads[slot].rect(hx - head / 2, hy - head / 2, head, head);
    }
    this.flights.length = kept;

    const colors = [
      palette.request,
      palette.ok,
      palette.clientError,
      palette.serverError,
      palette.apiCache,
      palette.website,
      palette.assets,
      palette.other,
      palette.lake,
    ];
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = palette.request;
    ctx.fill(clients);
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, cell * 0.35);
    for (let i = 0; i < SLOTS; i++) {
      ctx.globalAlpha = this.still ? 0.35 : 0.55;
      ctx.strokeStyle = colors[i];
      ctx.stroke(trails[i]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors[i];
      ctx.fill(heads[i]);
    }

    // Data centers that just took a request, sized by how many.
    ctx.fillStyle = palette.edge;
    for (const [colo, energy] of this.pulses) {
      const next = energy * decay;
      if (next < 0.05) {
        this.pulses.delete(colo);
        continue;
      }
      this.pulses.set(colo, next);
      const at = this.coloAt(colo);
      if (!at) continue;
      const [x, y] = at;
      ctx.globalAlpha = Math.min(0.6, 0.2 + next * 0.1);
      ctx.beginPath();
      ctx.arc(x, y, cell * (0.6 + Math.min(next, 3) * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }

    // Our server: a dot with a ring that swells with the traffic.
    this.originPulse = Math.min(this.originPulse * decay, 12);
    const [ox, oy] = this.origin;
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.origin;
    ctx.beginPath();
    ctx.arc(ox, oy, cell * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(0.8, 0.2 + this.originPulse * 0.08);
    ctx.strokeStyle = palette.origin;
    ctx.lineWidth = Math.max(1, cell * 0.4);
    ctx.beginPath();
    ctx.arc(ox, oy, cell * (2.2 + Math.min(this.originPulse, 12) * 0.35), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Adds the stretch `from`..`to` (0 to 1) of the arc from (x0, y0) to (x1, y1) to `path`; returns its end. */
  private trail(
    path: Path2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    from: number,
    to: number,
  ): [number, number] {
    let end = at(from, x0, y0, x1, y1);
    path.moveTo(end[0], end[1]);
    for (let s = 1; s <= TRAIL_STEPS; s++) {
      end = at(from + ((to - from) * s) / TRAIL_STEPS, x0, y0, x1, y1);
      path.lineTo(end[0], end[1]);
    }
    return end;
  }
}
