import { MAX_COMPARE_PLAYERS, SCORED_STAT_COUNT } from "~/lib/player-compare";

import { CARD_HEIGHT, CARD_WIDTH, LOGO, SITE_LABEL } from "./card-kit";
import { OG } from "./palette";

const PAD = 44;

const brandGlow = {
  backgroundColor: OG.background,
  // The brand red rising from the top left corner, a cooler light from the bottom right.
  backgroundImage: `radial-gradient(circle at 12% -10%, ${OG.primary}40 0%, transparent 45%), radial-gradient(circle at 100% 110%, ${OG.border} 0%, transparent 55%)`,
};

function Header({ logo }: { logo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src={logo} width={46} height={46} alt="" />
        <span style={{ fontSize: 30, fontWeight: 800, color: OG.foreground, letterSpacing: -0.5 }}>Deadlock API</span>
      </div>
      <div
        style={{
          display: "flex",
          padding: "8px 18px",
          borderRadius: 999,
          border: `2px solid ${OG.primary}`,
          backgroundColor: OG.primarySoft,
          color: OG.primary,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Player comparison
      </div>
    </div>
  );
}

function Footer({ context }: { context: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 10 }}>
        {context.map((entry) => (
          <div
            key={entry}
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 8,
              backgroundColor: OG.card,
              border: `1px solid ${OG.border}`,
              color: OG.muted,
              fontSize: 20,
            }}
          >
            {entry}
          </div>
        ))}
      </div>
      <span style={{ fontSize: 22, color: OG.foreground, fontWeight: 700 }}>{SITE_LABEL}</span>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        padding: PAD,
        fontFamily: "Inter",
        color: OG.foreground,
        ...brandGlow,
      }}
    >
      {children}
    </div>
  );
}

/** The card for the page itself, before anyone is picked: what it does and where to try it. */
/** `logo` is the logo already loaded (a data URI), when the renderer has it; otherwise satori fetches the URL. */
export function ComparePromoCard({ logo = LOGO }: { logo?: string }) {
  return (
    <Frame>
      <Header logo={logo} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2 }}>Who's the better</span>
        <span style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2, color: OG.primary }}>
          Deadlock player?
        </span>
        <span style={{ fontSize: 30, color: OG.muted, marginTop: 8 }}>
          {`Up to ${MAX_COMPARE_PLAYERS} players head to head on ${SCORED_STAT_COUNT} stats, ranked against everyone.`}
        </span>
      </div>
      <Footer context={["You vs your friends", "You vs the pros"]} />
    </Frame>
  );
}
