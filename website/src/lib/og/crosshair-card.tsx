import { CARD_HEIGHT, CARD_WIDTH } from "./card-kit";
import { OG } from "./palette";

const PAD = 44;

export interface CrosshairCardImage {
  src: string;
  width: number;
  height: number;
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
  crosshair?: CrosshairCardImage;
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
          {crosshair ? (
            <img src={crosshair.src} width={crosshair.width} height={crosshair.height} alt="" />
          ) : (
            <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Crosshair Editor</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 24, fontWeight: 700 }}>Deadlock crosshair</span>
          <span style={{ fontSize: 22, fontWeight: 700 }}>deadlock-api.com/crosshair</span>
        </div>
      </div>
    </div>
  );
}
