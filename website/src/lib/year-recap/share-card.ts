import { formatPercent } from "~/lib/format";

import { damageSplit, type DamageStyle, hasDamageMatrix, kda, ratio, yearTotals } from "./recap";
import type { ModeRecap, YearRecap } from "./types";

// The share image of the recap: what it says (shareCardData), where everything sits on it (shareCardLayout) and how it
// is painted (drawShareCard). Everything here is pure; share-card-render.ts loads the fonts and pictures and makes the
// PNG in the browser.

export type ShareFormat = "story" | "square" | "wide";

export interface ShareFormatSpec {
  width: number;
  height: number;
  label: string;
  /** Where the size fits, for the format switch. */
  use: string;
}

/** The three sizes the networks crop to: a phone story, a feed post, and a link card on X or Discord. */
export const SHARE_FORMATS: Record<ShareFormat, ShareFormatSpec> = {
  story: { width: 1080, height: 1920, label: "Story", use: "Instagram and TikTok stories" },
  square: { width: 1080, height: 1080, label: "Square", use: "Feed posts" },
  wide: { width: 1200, height: 675, label: "Wide", use: "X and Discord" },
};

export const SHARE_FORMAT_IDS = ["story", "square", "wide"] as const satisfies readonly ShareFormat[];

export const SHARE_HASHTAG = "#YearInDeadlock";
export const SHARE_SITE = "deadlock-api.com";
const SHARE_URL = "https://deadlock-api.com/year-in-deadlock";

export interface ShareStat {
  key: "matches" | "hours" | "win-rate" | "kda" | "kills" | "rank" | "heroes";
  label: string;
  value: string;
}

export interface ShareCardData {
  name: string;
  /** One or two letters for the avatar's place when there is no picture. */
  initials: string;
  year: number;
  /** The two big numbers: matches and hours. */
  figures: ShareStat[];
  /** Win rate, KDA, kills and peak rank (heroes played without ranked matches), in that order. */
  stats: ShareStat[];
  hero: { name: string; detail: string } | null;
  /** One line about how they play; null when the year has nothing to say. */
  fun: { label: string; value: string } | null;
}

export interface ShareCardInput {
  recap: YearRecap;
  /** The normal-mode recap the closing card reads its hero, KDA, kills and rank from. */
  main: ModeRecap;
  name?: string | null;
  heroName?: string | null;
  /** The peak badge's name ("Eternus 4"); null without ranked matches. */
  peakRank?: string | null;
  /** The name of the top damage source ("Haze's weapon"), when there is a damage breakdown. */
  signature?: string | null;
}

const STYLE_TITLE: Record<DamageStyle, string> = {
  gunslinger: "Gunslinger",
  spirit: "Spirit caster",
  brawler: "Brawler",
  hybrid: "Jack of all trades",
};

const count = (value: number) => Math.round(value).toLocaleString("en-US");

/** "DSwizzle" is "DS", "big tuna" is "BT", "x" is "X". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
      .join("");
  const [word = "?"] = words;
  const chars = Array.from(word);
  const capitals = chars.filter((char) => char !== char.toLowerCase());
  if (capitals.length >= 2) return capitals.slice(0, 2).join("");
  return chars.slice(0, 2).join("").toUpperCase();
}

/** The line under the numbers: the play style from the damage breakdown, else the best streak, else the best game. */
export function shareFunLine(main: ModeRecap, signature?: string | null): ShareCardData["fun"] {
  const split = hasDamageMatrix(main.totals) ? damageSplit(main.totals) : null;
  if (split) {
    const [lead] = [
      { label: "bullets", share: split.bullet },
      { label: "abilities", share: split.ability },
      { label: "melee", share: split.melee },
    ].sort((a, b) => b.share - a.share);
    const value = signature
      ? `Signature: ${signature}`
      : `${formatPercent(lead?.share ?? 0, 0)} of hero damage from ${lead?.label ?? "bullets"}`;
    return { label: STYLE_TITLE[split.style], value };
  }
  const streak = main.streaks.longest_win.length;
  if (streak >= 3) return { label: "Best streak", value: `${streak} wins in a row` };
  const kills = main.records.find((record) => record.stat === "kills");
  if (kills && kills.value > 0) return { label: "Best game", value: `${count(kills.value)} kills in one match` };
  return null;
}

/** Everything the card prints, formatted. */
export function shareCardData({ recap, main, name, heroName, peakRank, signature }: ShareCardInput): ShareCardData {
  const totals = yearTotals(recap);
  const winRate = ratio(totals.wins, totals.matches) ?? 0;
  const hours = Math.round(totals.seconds / 3600);
  const [top] = main.heroes;
  const player = name?.trim() || `Player ${recap.account_id}`;
  return {
    name: player,
    initials: initialsOf(player),
    year: recap.year,
    figures: [
      { key: "matches", label: totals.matches === 1 ? "Match" : "Matches", value: count(totals.matches) },
      { key: "hours", label: hours === 1 ? "Hour" : "Hours", value: count(hours) },
    ],
    stats: [
      { key: "win-rate", label: "Win rate", value: formatPercent(winRate) },
      { key: "kda", label: "KDA", value: kda(main.totals).toFixed(2) },
      { key: "kills", label: "Kills", value: count(main.totals.kills) },
      peakRank
        ? { key: "rank", label: "Peak rank", value: peakRank }
        : {
            key: "heroes",
            label: "Heroes played",
            value: count(new Set(recap.matches.map((match) => match.hero_id)).size),
          },
    ],
    hero:
      top && heroName
        ? {
            name: heroName,
            detail: `${count(top.matches)} ${top.matches === 1 ? "match" : "matches"}, ${formatPercent(top.wins / Math.max(1, top.matches), 0)} won`,
          }
        : null,
    fun: shareFunLine(main, signature),
  };
}

const statValue = (data: ShareCardData, key: ShareStat["key"]) =>
  [...data.figures, ...data.stats].find((stat) => stat.key === key)?.value ?? "";

/** The post text that goes with the image (Copy text). */
export function shareText(data: ShareCardData): string {
  const rank = statValue(data, "rank");
  const play = [
    data.hero ? `Main: ${data.hero.name}.` : null,
    `KDA ${statValue(data, "kda")}, ${statValue(data, "kills")} kills${rank ? `, peak rank ${rank}` : ""}.`,
  ];
  return [
    `My ${data.year} in Deadlock: ${statValue(data, "matches")} matches, ${statValue(data, "hours")} hours, ${statValue(data, "win-rate")} won.`,
    play.filter(Boolean).join(" "),
    `${SHARE_HASHTAG} ${SHARE_URL}`,
  ].join("\n");
}

/** The image's alt text: every number on it, in a sentence. */
export function shareCardAlt(data: ShareCardData): string {
  const parts = [
    `${statValue(data, "matches")} matches`,
    `${statValue(data, "hours")} hours`,
    `${statValue(data, "win-rate")} won`,
    data.hero ? `main hero ${data.hero.name}` : null,
    `KDA ${statValue(data, "kda")}`,
    `${statValue(data, "kills")} kills`,
    statValue(data, "rank") ? `peak rank ${statValue(data, "rank")}` : `${statValue(data, "heroes")} heroes played`,
  ].filter(Boolean);
  const fun = data.fun ? ` ${data.fun.label}: ${data.fun.value}.` : "";
  return `Share image of ${data.name}'s ${data.year} in Deadlock: ${parts.join(", ")}.${fun}`;
}

/** "year-in-deadlock-2026-story.png". */
export const shareFilename = (year: number, format: ShareFormat) => `year-in-deadlock-${year}-${format}.png`;

// ---------------------------------------------------------------------------------------------------------------------
// Layout: boxes in image pixels. The art is the only box text may sit on.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Font sizes in image pixels. */
export interface ShareCardType {
  eyebrow: number;
  year: number;
  name: number;
  label: number;
  heroName: number;
  heroDetail: number;
  figure: number;
  figureLabel: number;
  statValue: number;
  fun: number;
  footer: number;
}

export interface ShareCardLayout {
  width: number;
  height: number;
  /** The hero art, faded into the ground towards `fade`. */
  art: Rect;
  fade: "bottom-left" | "right";
  eyebrow: Rect;
  year: Rect;
  player: Rect;
  hero: Rect;
  figures: Rect;
  stats: Rect;
  /** How many stat tiles sit in each row of `stats`, top to bottom. */
  statRows: number[];
  gap: number;
  fun: Rect;
  footer: Rect;
  type: ShareCardType;
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Where everything sits on a card of `format`. */
export function shareCardLayout(format: ShareFormat): ShareCardLayout {
  const { width, height } = SHARE_FORMATS[format];
  if (format === "story") {
    const pad = 88;
    const inner = width - pad * 2;
    return {
      width,
      height,
      art: rect(400, 96, 680, 923),
      fade: "bottom-left",
      eyebrow: rect(pad, 132, inner, 44),
      year: rect(pad, 196, 560, 250),
      player: rect(pad, 488, 600, 112),
      hero: rect(pad, 676, inner, 236),
      figures: rect(pad, 964, inner, 236),
      stats: rect(pad, 1248, inner, 392),
      statRows: [3, 1],
      gap: 24,
      fun: rect(pad, 1688, inner, 96),
      footer: rect(pad, 1812, inner, 52),
      type: {
        eyebrow: 44,
        year: 300,
        name: 56,
        label: 34,
        heroName: 132,
        heroDetail: 40,
        figure: 180,
        figureLabel: 36,
        statValue: 88,
        fun: 44,
        footer: 40,
      },
    };
  }
  if (format === "square") {
    const pad = 72;
    const inner = width - pad * 2;
    return {
      width,
      height,
      art: rect(600, 24, 480, 651),
      fade: "bottom-left",
      eyebrow: rect(pad, 76, 600, 36),
      year: rect(pad, 124, 520, 170),
      player: rect(pad, 318, 520, 80),
      hero: rect(pad, 430, 520, 150),
      figures: rect(pad, 604, 640, 148),
      stats: rect(pad, 784, inner, 128),
      statRows: [4],
      gap: 16,
      fun: rect(pad, 940, inner, 48),
      footer: rect(pad, 1016, inner, 36),
      type: {
        eyebrow: 34,
        year: 200,
        name: 40,
        label: 26,
        heroName: 84,
        heroDetail: 28,
        figure: 120,
        figureLabel: 26,
        statValue: 52,
        fun: 30,
        footer: 28,
      },
    };
  }
  const pad = 52;
  const left = 452;
  const inner = width - left - pad;
  return {
    width,
    height,
    art: rect(-28, 0, 498, 675),
    fade: "right",
    eyebrow: rect(left, 48, inner, 28),
    year: rect(left, 84, 300, 120),
    player: rect(left + 316, 112, inner - 316, 64),
    hero: rect(left, 222, inner, 96),
    figures: rect(left, 336, inner, 104),
    stats: rect(left, 460, inner, 100),
    statRows: [4],
    gap: 12,
    fun: rect(left, 580, inner, 36),
    footer: rect(left, 632, inner, 24),
    type: {
      eyebrow: 26,
      year: 140,
      name: 30,
      label: 20,
      heroName: 52,
      heroDetail: 22,
      figure: 84,
      figureLabel: 20,
      statValue: 38,
      fun: 24,
      footer: 22,
    },
  };
}

/** The text boxes of a layout, by name: the parts that must not overlap one another. */
export function textBoxes(layout: ShareCardLayout): Record<string, Rect> {
  const { eyebrow, year, player, hero, figures, stats, fun, footer } = layout;
  return { eyebrow, year, player, hero, figures, stats, fun, footer };
}

/** The cells of a grid of `count` items in `columns` across `box`, `gap` apart. */
export function gridCells(box: Rect, count: number, columns: number, gap: number): Rect[] {
  const rows = Math.max(1, Math.ceil(count / columns));
  const w = (box.w - gap * (columns - 1)) / columns;
  const h = (box.h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) =>
    rect(box.x + (i % columns) * (w + gap), box.y + Math.floor(i / columns) * (h + gap), w, h),
  );
}

/** How much wider than the others the peak rank's tile is when it shares a row: its badge needs the room. */
export const RANK_TILE_WEIGHT = 1.8;

/**
 * The tiles of `stats` laid out in `rows` (tiles per row), `gap` apart: each row as high as the others, the tiles of
 * a row sharing its width by weight (the rank's tile wider). Tiles beyond the rows' count are left out.
 */
export function statCells(
  box: Rect,
  stats: readonly Pick<ShareStat, "key">[],
  rows: readonly number[],
  gap: number,
): Rect[] {
  const rowH = (box.h - gap * (rows.length - 1)) / Math.max(1, rows.length);
  const cells: Rect[] = [];
  let index = 0;
  rows.forEach((size, row) => {
    const items = stats.slice(index, index + size);
    index += size;
    const weights = items.map((stat) => (stat.key === "rank" && items.length > 1 ? RANK_TILE_WEIGHT : 1));
    const unit = (box.w - gap * (items.length - 1)) / weights.reduce((sum, weight) => sum + weight, 0);
    let x = box.x;
    for (const weight of weights) {
      cells.push(rect(x, box.y + row * (rowH + gap), unit * weight, rowH));
      x += unit * weight + gap;
    }
  });
  return cells;
}

/**
 * The largest font size from `size` down to `min` at which `measure(size)` (the text's width at that size, which
 * grows with it) fits `maxWidth`; `min` when even that is too wide.
 */
export function fitFontSize(measure: (size: number) => number, maxWidth: number, size: number, min: number): number {
  const width = measure(size);
  if (width <= maxWidth) return size;
  // Width is close to proportional to the size: one guess, then step down until it fits.
  let next = Math.max(min, Math.floor((size * maxWidth) / width));
  while (next > min && measure(next) > maxWidth) next -= 1;
  return next;
}

/** `text` cut short with an ellipsis so that `measure` of it fits `maxWidth`. */
export function ellipsize(measure: (text: string) => number, text: string, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text);
  for (let end = chars.length - 1; end > 0; end -= 1) {
    const candidate = `${chars.slice(0, end).join("").trimEnd()}…`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return "…";
}

/** `#rrggbb` (or `#rgb`) at `alpha`, for gradients that fade a token color out. Anything else comes back as it is. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return color;
  const full = hex.length === 3 ? hex.replace(/./g, (char) => char + char) : hex;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Painting

/** The token colors the card is painted in, read from the CSS custom properties by the renderer. */
export interface ShareCardPalette {
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
  primary: string;
}

/** Font families (CSS `font-family` values) of the display and the text face. */
export interface ShareCardFonts {
  display: string;
  sans: string;
}

export type ShareImage = CanvasImageSource & { width: number; height: number };

export interface ShareCardImages {
  avatar?: ShareImage | null;
  hero?: ShareImage | null;
  badge?: ShareImage | null;
}

interface Theme {
  palette: ShareCardPalette;
  fonts: ShareCardFonts;
}

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number, family: string, tracking = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  // Not in every browser yet; without it the capitals are just set tighter.
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking * size}px`;
}

/** Writes `text` on one line from (x, baseline), shrunk to fit `maxWidth` and cut with an ellipsis below `min`. */
function fitText(
  ctx: Ctx,
  text: string,
  x: number,
  baseline: number,
  maxWidth: number,
  font: { weight: number; size: number; min?: number; family: string; tracking?: number },
): number {
  const { weight, size, min = Math.round(size * 0.6), family, tracking = 0 } = font;
  const fitted = fitFontSize(
    (next) => {
      setFont(ctx, weight, next, family, tracking);
      return ctx.measureText(text).width;
    },
    maxWidth,
    size,
    min,
  );
  setFont(ctx, weight, fitted, family, tracking);
  ctx.fillText(
    ellipsize((candidate) => ctx.measureText(candidate).width, text, maxWidth),
    x,
    baseline,
  );
  return fitted;
}

function roundedRect(ctx: Ctx, box: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, radius);
}

/** `image` scaled to cover `box` (cropped, anchored at the top) or to fit inside it (anchored at the bottom). */
function drawImage(
  ctx: Ctx | OffscreenCanvasRenderingContext2D,
  image: ShareImage,
  box: Rect,
  mode: "cover" | "contain",
) {
  const scale =
    mode === "cover"
      ? Math.max(box.w / image.width, box.h / image.height)
      : Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = box.x + (box.w - w) / 2;
  const y = mode === "cover" ? box.y : box.y + box.h - h;
  ctx.drawImage(image, x, y, w, h);
}

function drawBackground(ctx: Ctx, layout: ShareCardLayout, palette: ShareCardPalette) {
  const { width, height, art } = layout;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  // The brand glow behind the hero, and a fainter one low on the other side so the bottom is not flat.
  const cx = art.x + art.w / 2;
  const cy = art.y + art.h * 0.45;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(art.w, art.h) * 0.75);
  glow.addColorStop(0, withAlpha(palette.primary, 0.34));
  glow.addColorStop(0.55, withAlpha(palette.primary, 0.08));
  glow.addColorStop(1, withAlpha(palette.primary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  const low = ctx.createRadialGradient(0, height, 0, 0, height, Math.max(width, height) * 0.6);
  low.addColorStop(0, withAlpha(palette.primary, 0.1));
  low.addColorStop(1, withAlpha(palette.primary, 0));
  ctx.fillStyle = low;
  ctx.fillRect(0, 0, width, height);
  // Fine diagonal lines over the glow, a broadcast-graphics texture.
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.foreground, 0.035);
  ctx.lineWidth = 2;
  const step = Math.round(Math.max(width, height) / 60);
  for (let x = -height; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The hero art, faded out towards the text so it sits in the glow instead of in a box: drawn on its own canvas, whose
 * alpha two gradients then cut down, before it goes onto the card.
 */
function drawArt(ctx: Ctx, layout: ShareCardLayout, palette: ShareCardPalette, hero: ShareImage) {
  const { art, fade } = layout;
  const layer = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(Math.ceil(art.w), Math.ceil(art.h));
  const lctx = layer?.getContext("2d");
  if (!layer || !lctx) {
    drawImage(ctx, hero, art, "contain");
    return;
  }
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";
  drawImage(lctx, hero, rect(0, 0, art.w, art.h), "contain");
  lctx.globalCompositeOperation = "destination-in";
  const mask = (alpha: number) => withAlpha(palette.background, alpha);
  const across =
    fade === "right"
      ? lctx.createLinearGradient(art.w * 0.5, 0, art.w, 0)
      : lctx.createLinearGradient(0, 0, art.w * 0.5, 0);
  across.addColorStop(0, mask(fade === "right" ? 1 : 0.15));
  across.addColorStop(1, mask(fade === "right" ? 0 : 1));
  lctx.fillStyle = across;
  lctx.fillRect(0, 0, art.w, art.h);
  const down = lctx.createLinearGradient(0, art.h * (fade === "right" ? 0.7 : 0.5), 0, art.h);
  down.addColorStop(0, mask(1));
  down.addColorStop(1, mask(fade === "right" ? 0.35 : 0));
  lctx.fillStyle = down;
  lctx.fillRect(0, 0, art.w, art.h);
  ctx.drawImage(layer, art.x, art.y);
}

/** A capital label: the display face, tracked out, shrunk to fit `maxWidth` when it is given. */
function drawLabel(
  ctx: Ctx,
  text: string,
  x: number,
  baseline: number,
  size: number,
  color: string,
  theme: Theme,
  maxWidth = Number.POSITIVE_INFINITY,
) {
  ctx.fillStyle = color;
  fitText(ctx, text.toUpperCase(), x, baseline, maxWidth, {
    weight: 600,
    size,
    min: Math.round(size * 0.7),
    family: theme.fonts.display,
    tracking: 0.12,
  });
  setFont(ctx, 600, size, theme.fonts.display);
}

function drawPlayer(ctx: Ctx, layout: ShareCardLayout, data: ShareCardData, images: ShareCardImages, theme: Theme) {
  const { player, type } = layout;
  const { palette, fonts } = theme;
  const size = player.h;
  const avatar = rect(player.x, player.y, size, size);
  ctx.save();
  roundedRect(ctx, avatar, size * 0.18);
  ctx.clip();
  if (images.avatar) drawImage(ctx, images.avatar, avatar, "cover");
  else {
    ctx.fillStyle = palette.surface;
    ctx.fillRect(avatar.x, avatar.y, avatar.w, avatar.h);
    ctx.fillStyle = palette.foreground;
    setFont(ctx, 700, size * 0.46, fonts.display);
    ctx.textAlign = "center";
    ctx.fillText(data.initials, avatar.x + size / 2, avatar.y + size * 0.66);
    ctx.textAlign = "start";
  }
  ctx.restore();
  roundedRect(ctx, avatar, size * 0.18);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  const x = player.x + size + size * 0.28;
  ctx.fillStyle = palette.foreground;
  fitText(ctx, data.name, x, player.y + size / 2 + type.name * 0.36, player.x + player.w - x, {
    weight: 600,
    size: type.name,
    family: fonts.sans,
  });
}

function drawHero(ctx: Ctx, layout: ShareCardLayout, data: ShareCardData, theme: Theme) {
  if (!data.hero) return;
  const { hero, type } = layout;
  const { palette, fonts } = theme;
  const labelBase = hero.y + type.label * 0.8;
  drawLabel(ctx, "Main hero", hero.x, labelBase, type.label, palette.muted, theme);
  const nameBase = labelBase + type.heroName * 0.92;
  ctx.fillStyle = palette.foreground;
  fitText(ctx, data.hero.name.toUpperCase(), hero.x, nameBase, hero.w, {
    weight: 700,
    size: type.heroName,
    family: fonts.display,
  });
  ctx.fillStyle = palette.muted;
  fitText(ctx, data.hero.detail, hero.x, nameBase + type.heroDetail * 1.5, hero.w, {
    weight: 500,
    size: type.heroDetail,
    family: fonts.sans,
  });
}

function drawFigures(ctx: Ctx, layout: ShareCardLayout, data: ShareCardData, theme: Theme) {
  const { figures, type, gap } = layout;
  const { palette, fonts } = theme;
  const cells = gridCells(figures, data.figures.length, data.figures.length, gap * 2);
  data.figures.forEach((figure, i) => {
    const cell = cells[i];
    if (!cell) return;
    // A short brand tick over each number.
    ctx.fillStyle = palette.primary;
    ctx.fillRect(cell.x, cell.y, Math.round(type.figure * 0.32), Math.max(4, Math.round(type.figure / 30)));
    const base = cell.y + type.figure * 0.98;
    ctx.fillStyle = palette.foreground;
    fitText(ctx, figure.value, cell.x, base, cell.w, { weight: 700, size: type.figure, family: fonts.display });
    drawLabel(ctx, figure.label, cell.x, base + type.figureLabel * 1.35, type.figureLabel, palette.muted, theme);
  });
}

function drawStats(ctx: Ctx, layout: ShareCardLayout, data: ShareCardData, images: ShareCardImages, theme: Theme) {
  const { stats, statRows, gap, type } = layout;
  const { palette, fonts } = theme;
  const cells = statCells(stats, data.stats, statRows, gap);
  data.stats.forEach((stat, i) => {
    const cell = cells[i];
    if (!cell) return;
    roundedRect(ctx, cell, Math.round(type.statValue * 0.3));
    ctx.fillStyle = withAlpha(palette.surface, 0.88);
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    const inset = Math.round(type.statValue * 0.36);
    let x = cell.x + inset;
    const contentH = type.label * 1.1 + type.statValue * 0.95;
    const top = cell.y + (cell.h - contentH) / 2;
    const badge = stat.key === "rank" ? images.badge : null;
    if (badge) {
      const size = Math.min(cell.h - inset * 0.5, contentH * 1.4);
      drawImage(ctx, badge, rect(x - inset * 0.3, cell.y + (cell.h - size) / 2, size, size), "contain");
      x += size + inset * 0.2;
    }
    const maxWidth = cell.x + cell.w - inset - x;
    drawLabel(ctx, stat.label, x, top + type.label * 0.8, type.label, palette.muted, theme, maxWidth);
    ctx.fillStyle = palette.foreground;
    fitText(ctx, stat.value, x, top + type.label * 1.1 + type.statValue * 0.86, maxWidth, {
      weight: 700,
      size: type.statValue,
      min: Math.round(type.statValue * 0.55),
      family: fonts.display,
    });
  });
}

function drawFun(ctx: Ctx, layout: ShareCardLayout, data: ShareCardData, theme: Theme) {
  if (!data.fun) return;
  const { fun, type } = layout;
  const { palette, fonts } = theme;
  const bar = Math.max(4, Math.round(type.fun / 6));
  ctx.fillStyle = palette.primary;
  ctx.fillRect(fun.x, fun.y, bar, fun.h);
  const x = fun.x + bar + type.fun * 0.6;
  if (fun.h >= type.fun * 2) {
    drawLabel(ctx, data.fun.label, x, fun.y + type.label * 0.95, type.label, palette.primary, theme);
    ctx.fillStyle = palette.foreground;
    fitText(ctx, data.fun.value, x, fun.y + fun.h - type.fun * 0.25, fun.x + fun.w - x, {
      weight: 600,
      size: type.fun,
      family: fonts.sans,
    });
    return;
  }
  const baseline = fun.y + fun.h / 2 + type.fun * 0.36;
  ctx.fillStyle = palette.primary;
  setFont(ctx, 700, type.fun * 1.1, fonts.display, 0.06);
  const label = data.fun.label.toUpperCase();
  ctx.fillText(label, x, baseline);
  const labelWidth = ctx.measureText(label).width + type.fun * 0.6;
  ctx.fillStyle = palette.foreground;
  fitText(ctx, data.fun.value, x + labelWidth, baseline, fun.x + fun.w - x - labelWidth, {
    weight: 600,
    size: type.fun,
    family: fonts.sans,
  });
}

function drawFooter(ctx: Ctx, layout: ShareCardLayout, theme: Theme) {
  const { footer, type } = layout;
  const { palette, fonts } = theme;
  ctx.fillStyle = withAlpha(palette.foreground, 0.08);
  ctx.fillRect(footer.x, footer.y - type.footer * 0.55, footer.w, 2);
  const baseline = footer.y + footer.h * 0.5 + type.footer * 0.36;
  const mark = Math.round(type.footer * 0.5);
  ctx.fillStyle = palette.primary;
  ctx.fillRect(footer.x, baseline - type.footer * 0.62, mark, mark);
  ctx.fillStyle = palette.foreground;
  setFont(ctx, 700, type.footer, fonts.display, 0.08);
  ctx.fillText(SHARE_SITE.toUpperCase(), footer.x + mark * 1.8, baseline);
  ctx.fillStyle = palette.primary;
  ctx.textAlign = "end";
  setFont(ctx, 700, type.footer, fonts.display, 0.02);
  ctx.fillText(SHARE_HASHTAG, footer.x + footer.w, baseline);
  ctx.textAlign = "start";
}

/** Paints the whole card on `ctx`, which is `layout.width` × `layout.height` pixels. */
export function drawShareCard(
  ctx: Ctx,
  layout: ShareCardLayout,
  data: ShareCardData,
  images: ShareCardImages,
  palette: ShareCardPalette,
  fonts: ShareCardFonts,
) {
  const theme = { palette, fonts };
  const { eyebrow, year, type } = layout;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
  drawBackground(ctx, layout, palette);
  if (images.hero) drawArt(ctx, layout, palette, images.hero);
  drawLabel(ctx, "Year in Deadlock", eyebrow.x, eyebrow.y + type.eyebrow * 0.8, type.eyebrow, palette.primary, theme);
  ctx.fillStyle = palette.foreground;
  fitText(ctx, String(data.year), year.x, year.y + year.h * 0.86, year.w, {
    weight: 700,
    size: type.year,
    family: fonts.display,
  });
  drawPlayer(ctx, layout, data, images, theme);
  drawHero(ctx, layout, data, theme);
  drawFigures(ctx, layout, data, theme);
  drawStats(ctx, layout, data, images, theme);
  drawFun(ctx, layout, data, theme);
  drawFooter(ctx, layout, theme);
  // The brand edge along the top, over the art.
  ctx.fillStyle = palette.primary;
  ctx.fillRect(0, 0, layout.width, Math.max(6, Math.round(layout.height / 240)));
}
