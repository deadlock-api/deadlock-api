import { CARD_HEIGHT, CARD_WIDTH } from "./card-kit";
import { OG } from "./palette";

const PAD = 44;

/** `length` pixels of one colour in a row of the crosshair, from (`x`, `y`) in its own pixels. */
export interface PixelRun {
  x: number;
  y: number;
  length: number;
  color: string;
}

/** A crosshair of `size` pixels square, drawn `scale` times as large. */
export interface CrosshairPixels {
  size: number;
  scale: number;
  runs: PixelRun[];
}

/**
 * The share card of a crosshair: the crosshair, enlarged with square pixels, over the scene the editor previews it
 * on, with the site's name above and the page's address below. Without a crosshair (an invalid code) it is the
 * editor's own card.
 */
export function CrosshairCard({
  background,
  logo,
  crosshair,
}: {
  background?: string;
  logo?: string;
  crosshair?: CrosshairPixels;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        fontFamily: "Inter",
        color: OG.foreground,
        backgroundColor: OG.background,
      }}
    >
      {background && (
        <img
          src={background}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          alt=""
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          padding: PAD,
          // Darkens the edges behind the text; the middle, where the crosshair sits, stays as the game shows it.
          backgroundImage: `linear-gradient(to bottom, ${OG.background}cc 0%, transparent 28%, transparent 72%, ${OG.background}cc 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {logo && <img src={logo} width={46} height={46} alt="" />}
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Deadlock API</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          {!crosshair && <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Crosshair Editor</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 24, fontWeight: 700 }}>Deadlock crosshair</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>deadlock-api.com/crosshair</span>
        </div>
      </div>
      {crosshair && <Crosshair crosshair={crosshair} />}
    </div>
  );
}

/** The crosshair as rectangles on whole pixels, centred on the card, so its enlarged pixels stay crisp squares. */
function Crosshair({ crosshair: { size, scale, runs } }: { crosshair: CrosshairPixels }) {
  const width = size * scale;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: Math.floor((CARD_WIDTH - width) / 2),
        top: Math.floor((CARD_HEIGHT - width) / 2),
        width,
        height: width,
      }}
    >
      {runs.map(({ x, y, length, color }) => (
        <div
          key={`${x},${y}`}
          style={{
            position: "absolute",
            left: x * scale,
            top: y * scale,
            width: length * scale,
            height: scale,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}
