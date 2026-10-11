import { CARD_HEIGHT, CARD_WIDTH, LOGO } from "./card-kit";
import type { MatchCardData, MatchCardTeam } from "./match-card-data";
import { OG } from "./palette";

const PAD = 44;
const PORTRAIT = 96;

/**
 * The share card of a match: both teams with their heroes and score, the winner marked, and the match's mode, average
 * rank, length and date below. Without data (a match we do not have) it names the match and the site only.
 */
export function MatchCard({ matchId, data, logo }: { matchId: number; data: MatchCardData | null; logo?: string }) {
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
        backgroundColor: OG.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo ?? LOGO} width={46} height={46} alt="" />
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>Deadlock API</span>
        </div>
        <span style={{ fontSize: 28, fontWeight: 700, color: OG.muted }}>Match {matchId}</span>
      </div>
      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data.teams.map((team) => (
            <TeamRow key={team.name} team={team} unit={data.scoreUnit} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>Deadlock Match</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 700 }}>
          {data?.rankImage && <img src={data.rankImage} width={40} height={40} alt="" />}
          <span>{data ? data.facts.join(" · ") : "Every kill, build and the soul lead over time"}</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: OG.muted }}>deadlock-api.com/matches</span>
      </div>
    </div>
  );
}

function TeamRow({ team, unit }: { team: MatchCardTeam; unit: MatchCardData["scoreUnit"] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 24px",
        borderRadius: 18,
        border: `3px solid ${team.won ? OG.primary : OG.border}`,
        backgroundColor: team.won ? OG.primarySoft : OG.card,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>{team.name}</span>
          {team.won && (
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                padding: "4px 12px",
                borderRadius: 8,
                color: OG.background,
                backgroundColor: OG.primary,
              }}
            >
              WON
            </span>
          )}
        </div>
        <span style={{ fontSize: 26, fontWeight: 700, color: OG.muted }}>
          {team.score} {unit}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {team.heroes.map(({ key, src }) =>
          src ? (
            <img
              key={key}
              src={src}
              width={PORTRAIT}
              height={PORTRAIT}
              alt=""
              style={{ borderRadius: 12, backgroundColor: OG.background }}
            />
          ) : (
            <div
              key={key}
              style={{ width: PORTRAIT, height: PORTRAIT, borderRadius: 12, backgroundColor: OG.border }}
            />
          ),
        )}
      </div>
    </div>
  );
}
