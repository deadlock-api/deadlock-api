import { CARD_HEIGHT, CARD_WIDTH, fitText, LOGO, SITE_LABEL } from "./card-kit";
import type { CompareCardData, CompareCardPlayer } from "./compare-card-data";
import { OG } from "./palette";

/** The first grapheme of a name, for a portrait without a picture (an emoji stays whole). */
function initial(name: string): string {
  const first = Array.from(new Intl.Segmenter().segment(name.trim()), (part) => part.segment)[0];
  return (first ?? "?").toUpperCase();
}

function Portrait({ player, size, ring }: { player: CompareCardPlayer; size: number; ring: number }) {
  const inner = size - ring * 2;
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        flexShrink: 0,
        padding: ring,
        borderRadius: 20,
        backgroundColor: player.color,
        boxShadow: `0 0 12px ${player.color}80`,
      }}
    >
      {player.avatar ? (
        <img src={player.avatar} width={inner} height={inner} style={{ borderRadius: 14 }} alt="" />
      ) : (
        <div
          style={{
            display: "flex",
            width: inner,
            height: inner,
            borderRadius: 14,
            backgroundColor: OG.card,
            alignItems: "center",
            justifyContent: "center",
            color: OG.foreground,
            fontSize: inner * 0.45,
            fontWeight: 900,
          }}
        >
          {initial(player.name)}
        </div>
      )}
    </div>
  );
}

/** "👑 WINNER" or "👑 TIED" on a leader: the crown and the word carry the state, not only the red. */
function LeaderTag({ player, tied, fontSize }: { player: CompareCardPlayer; tied: boolean; fontSize: number }) {
  if (!player.leader) return null;
  return (
    <div
      style={{
        display: "flex",
        padding: "4px 16px",
        borderRadius: 6,
        backgroundColor: OG.primary,
        border: `3px solid ${OG.background}`,
        color: OG.background,
        fontSize,
        fontWeight: 900,
        letterSpacing: 2,
        whiteSpace: "nowrap",
        flexShrink: 0,
        transform: "skewX(-10deg)",
      }}
    >
      {tied ? "👑 TIED" : "👑 WINNER"}
    </div>
  );
}

function rankLine(player: CompareCardPlayer): string {
  return player.rankName ?? (player.hasMatches ? "Unranked" : "No matches");
}

/** Win rate and KDA in one line, the best of the lobby in bold white. */
function StatLine({ player, fontSize }: { player: CompareCardPlayer; fontSize: number }) {
  const [winRate, kda] = player.highlights;
  const part = (highlight: CompareCardPlayer["highlights"][number], unit: string) => (
    <div key={unit} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span
        style={{
          fontSize,
          fontWeight: highlight.best ? 900 : 500,
          color: highlight.best ? OG.foreground : `${OG.foreground}b3`,
        }}
      >
        {highlight.value}
      </span>
      <span style={{ fontSize: fontSize - 8, fontWeight: 800, color: OG.muted }}>{unit}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 28, whiteSpace: "nowrap", marginTop: 4 }}>
      {[part(winRate, "WR"), part(kda, "KDA")]}
    </div>
  );
}

/** The header: the logo and what the card is. */
function TopBar({ logo = LOGO }: { logo?: string }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 24,
        left: 36,
        right: 36,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logo} width={44} height={44} alt="" />
        <span style={{ fontSize: 30, fontWeight: 800, color: OG.foreground }}>Deadlock API</span>
      </div>
      <span
        style={{
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: 3,
          color: OG.foreground,
          transform: "skewX(-10deg)",
        }}
      >
        PLAYER COMPARISON
      </span>
    </div>
  );
}

/** The footer: the filters and the link. */
function BottomBar({ context }: { context: string[] }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        padding: "0 36px",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: `${OG.background}e6`,
        borderTop: `3px solid ${OG.primary}`,
      }}
    >
      <span style={{ fontSize: 28, fontWeight: 600, color: OG.muted }}>{fitText(context.join("  ·  "), 680, 28)}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: OG.foreground }}>{SITE_LABEL}</span>
    </div>
  );
}

/** One side of the head to head: portrait, name, rank and the score, centred in its half. */
function Side({
  player,
  align,
  tied,
  solo,
  scoredCount,
}: {
  player: CompareCardPlayer;
  align: "left" | "right";
  tied: boolean;
  solo: boolean;
  scoredCount: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 92,
        bottom: 76,
        width: 470,
        ...(align === "left" ? { left: 30 } : { right: 30 }),
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", position: "relative", marginBottom: 14 }}>
        <Portrait player={player} size={solo ? 176 : 160} ring={6} />
        <div
          style={{ display: "flex", position: "absolute", top: -20, left: -100, right: -100, justifyContent: "center" }}
        >
          <LeaderTag player={player} tied={tied} fontSize={24} />
        </div>
      </div>
      <span style={{ fontSize: 50, fontWeight: 900, color: OG.foreground, lineHeight: 1.1, whiteSpace: "nowrap" }}>
        {fitText(player.name, 420, 50)}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 30,
          fontWeight: 600,
          color: `${OG.foreground}b3`,
          height: 40,
        }}
      >
        {player.rankImage ? <img src={player.rankImage} width={36} height={36} alt="" /> : null}
        <span>{fitText(rankLine(player), player.rankImage ? 374 : 420, 30)}</span>
      </div>
      {solo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10, width: 330 }}>
          {player.highlights.map((highlight) => (
            <div
              key={highlight.label}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 34, lineHeight: 1.2 }}
            >
              <span style={{ color: `${OG.foreground}b3`, fontWeight: 600 }}>{highlight.label}</span>
              <span style={{ color: OG.foreground, fontWeight: 800 }}>{highlight.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 4 }}>
          <Score player={player} fontSize={120} scoredCount={scoredCount} />
          {player.hasMatches ? <StatLine player={player} fontSize={36} /> : null}
        </div>
      )}
    </div>
  );
}

/** The empty corner of a lone player's card: a challenger slot that calls out the player by name. */
function ChallengerSide({ name }: { name: string }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 92,
        bottom: 76,
        right: 30,
        width: 470,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 176,
          height: 176,
          borderRadius: 20,
          border: `6px dashed ${OG.foreground}99`,
          backgroundColor: `${OG.background}80`,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          fontWeight: 900,
          color: OG.foreground,
          marginBottom: 18,
        }}
      >
        ?
      </div>
      <span style={{ fontSize: 40, fontWeight: 800, color: OG.foreground, lineHeight: 1.15 }}>Who can beat</span>
      <span style={{ fontSize: 52, fontWeight: 900, color: OG.primary, lineHeight: 1.15, whiteSpace: "nowrap" }}>
        {fitText(`${name}?`, 420, 52)}
      </span>
      <span style={{ fontSize: 30, fontWeight: 600, color: `${OG.foreground}b3`, marginTop: 8 }}>
        Add yourself and find out
      </span>
    </div>
  );
}

/** The diagonal split of a head to head, each half lit in its player's color. */
function SplitBackground({ left, right }: { left: string; right: string }) {
  return (
    <svg width={CARD_WIDTH} height={CARD_HEIGHT} style={{ position: "absolute", top: 0, left: 0 }}>
      <defs>
        <linearGradient id="left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={left} stopOpacity={0.6} />
          <stop offset="100%" stopColor={left} stopOpacity={0.08} />
        </linearGradient>
        <linearGradient id="right" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={right} stopOpacity={0.6} />
          <stop offset="100%" stopColor={right} stopOpacity={0.08} />
        </linearGradient>
      </defs>
      <polygon points="0,0 690,0 510,630 0,630" fill="url(#left)" />
      <polygon points="690,0 1200,0 1200,630 510,630" fill="url(#right)" />
      <polygon points="682,0 698,0 518,630 502,630" fill={OG.primary} />
    </svg>
  );
}

function HeadToHead({ data }: { data: CompareCardData }) {
  const [a, b] = data.players;
  const solo = b == null;
  const tied = data.players.filter((player) => player.leader).length > 1;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: OG.background,
        fontFamily: "Inter",
        color: OG.foreground,
      }}
    >
      <SplitBackground left={a.color} right={solo ? OG.muted : b.color} />
      <TopBar logo={data.logo} />
      <Side player={a} align="left" tied={tied} solo={solo} scoredCount={data.scoredCount} />
      {solo ? (
        <ChallengerSide name={a.name} />
      ) : (
        <Side player={b} align="right" tied={tied} solo={false} scoredCount={data.scoredCount} />
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 220,
          left: 500,
          width: 200,
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 150,
            fontWeight: 900,
            color: OG.foreground,
            letterSpacing: -6,
            transform: "skewX(-12deg)",
            textShadow: `0 0 12px ${OG.primary}, 6px 6px 0 ${OG.primary}`,
          }}
        >
          VS
        </span>
      </div>
      <BottomBar context={data.context} />
    </div>
  );
}

/**
 * Every size of a panel, per player count. The heights add up to at most the 464px of the panel row: padding 40,
 * avatar, `lines` name lines, rank 34, score, label 28, two stat lines and 12 of gaps.
 */
const PANEL_SIZES = {
  3: { avatar: 128, name: 44, lines: 1, score: 104, gap: 28, stat: 34, kda: true },
  4: { avatar: 112, name: 36, lines: 2, score: 96, gap: 20, stat: 32, kda: true },
  5: { avatar: 128, name: 32, lines: 2, score: 100, gap: 14, stat: 34, kda: false },
} as const;
/** The slant of the panels: enough to read as a broadcast, little enough to leave the names their width. */
const SLANT = 5;
/** The smallest a name steps down to before it gives up letters. */
const MIN_NAME = 26;

/**
 * A name broken into at most `lines` lines at its spaces, each cut to `width`: "Bananas Only" stands on two lines in a
 * narrow panel instead of losing half of itself to an ellipsis. Of the possible breaks, the one that keeps the most of
 * the name wins, then the most even one.
 */
function nameLines(name: string, width: number, fontSize: number, lines: number): string[] {
  const whole = fitText(name, width, fontSize);
  const words = name.trim().split(/\s+/);
  if (lines <= 1 || whole === name || words.length < 2) return [whole];
  let best = [whole];
  let bestKept = -1;
  let bestSpread = Infinity;
  for (let split = 1; split < words.length; split += 1) {
    const pair = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
    const cut = pair.map((line) => fitText(line, width, fontSize));
    const kept = cut.reduce((sum, line, index) => sum + (line === pair[index] ? line.length : line.length - 1), 0);
    const spread = Math.abs(pair[0].length - pair[1].length);
    if (kept > bestKept || (kept === bestKept && spread < bestSpread)) {
      best = cut;
      bestKept = kept;
      bestSpread = spread;
    }
  }
  return best;
}

/** The largest size a name takes whole: one line first, then two where the panel has room for them. */
function panelName(name: string, width: number, size: number, lines: number): { lines: string[]; fontSize: number } {
  const whole = (candidate: string[]) => candidate.every((line) => !line.endsWith("…"));
  for (let fontSize = size; fontSize >= MIN_NAME; fontSize -= 2) {
    const one = nameLines(name, width, fontSize, 1);
    if (whole(one)) return { lines: one, fontSize };
  }
  for (let fontSize = size; fontSize >= MIN_NAME; fontSize -= 2) {
    const two = nameLines(name, width, fontSize, lines);
    if (whole(two)) return { lines: two, fontSize };
  }
  return { lines: nameLines(name, width, MIN_NAME, lines), fontSize: MIN_NAME };
}

/** A rank at the largest size it fits whole, down to 22px ("Ascendant 6" beside a badge in a five-way panel). */
function panelRank(text: string, width: number): { text: string; fontSize: number } {
  const fontSize = [26, 24, 22].find((candidate) => fitText(text, width, candidate) === text) ?? 22;
  return { text: fitText(text, width, fontSize), fontSize };
}

/** Win rate and KDA stacked, the best of the lobby in bold white. */
function PanelStats({ player, fontSize, kda: withKda }: { player: CompareCardPlayer; fontSize: number; kda: boolean }) {
  const [winRate, kda] = player.highlights;
  const line = (highlight: CompareCardPlayer["highlights"][number], unit: string) => (
    <div key={unit} style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6 }}>
      <span
        style={{
          fontSize,
          fontWeight: highlight.best ? 900 : 500,
          color: highlight.best ? OG.foreground : `${OG.foreground}b3`,
        }}
      >
        {highlight.value}
      </span>
      <span style={{ fontSize: Math.round(fontSize * 0.7), fontWeight: 800, color: OG.muted }}>{unit}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
      {withKda ? [line(winRate, "WR"), line(kda, "KDA")] : [line(winRate, "WR")]}
    </div>
  );
}

/** The stats won: white for everyone, the leader's with the red drop shadow of the VS. */
function Score({
  player,
  fontSize,
  scoredCount,
  won = false,
}: {
  player: CompareCardPlayer;
  fontSize: number;
  scoredCount: number;
  /** "WON" under the "/19", where there is no room for a label of its own. */
  won?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span
        style={{
          fontSize,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -3,
          color: OG.foreground,
          textShadow: player.leader
            ? `${Math.round(fontSize / 20)}px ${Math.round(fontSize / 20)}px 0 ${OG.primary}`
            : "none",
        }}
      >
        {player.scored ? String(player.statsWon) : <span style={{ fontWeight: 500, color: OG.muted }}>–</span>}
      </span>
      {!player.scored ? null : won ? (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontSize: Math.round(fontSize * 0.34), fontWeight: 800, color: OG.muted }}>
            {`/${scoredCount}`}
          </span>
          <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1.5, color: OG.muted, marginTop: 2 }}>WON</span>
        </div>
      ) : (
        <span style={{ fontSize: Math.round(fontSize * 0.34), fontWeight: 800, color: OG.muted }}>
          {`/${scoredCount}`}
        </span>
      )}
    </div>
  );
}

/** One slanted broadcast panel of a three to five way showdown; the content inside stands upright. */
function Panel({
  player,
  count,
  tied,
  width,
  scoredCount,
}: {
  player: CompareCardPlayer;
  count: 3 | 4 | 5;
  tied: boolean;
  width: number;
  scoredCount: number;
}) {
  const size = PANEL_SIZES[count];
  const room = width - 20;
  const name = panelName(player.name, room, size.name, size.lines);
  const rank = panelRank(rankLine(player), player.rankImage ? room - 36 : room);
  return (
    <div style={{ display: "flex", position: "relative", width, height: "100%", flexShrink: 0 }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height: "100%",
          transform: `skewX(-${SLANT}deg)`,
          borderRadius: 8,
          border: player.leader ? `4px solid ${OG.primary}` : `2px solid ${player.color}80`,
          backgroundImage: `linear-gradient(180deg, ${player.color}${player.leader ? "d9" : "a6"} 0%, ${player.color}38 45%, ${OG.card} 100%)`,
          boxShadow: player.leader ? `0 0 12px ${OG.primary}80` : "none",
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height: "100%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 0 16px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          <Portrait player={player} size={size.avatar} ring={5} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: Math.ceil(name.fontSize * 1.12 * name.lines.length),
              marginTop: 6,
            }}
          >
            {name.lines.map((line) => (
              <span
                key={line}
                style={{
                  fontSize: name.fontSize,
                  fontWeight: 900,
                  lineHeight: 1.12,
                  whiteSpace: "nowrap",
                  color: OG.foreground,
                  letterSpacing: -0.5,
                }}
              >
                {line}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 34,
              fontSize: 26,
              fontWeight: 600,
              color: `${OG.foreground}b3`,
            }}
          >
            {player.rankImage ? <img src={player.rankImage} width={30} height={30} alt="" /> : null}
            <span style={{ whiteSpace: "nowrap", fontSize: rank.fontSize }}>{rank.text}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Score player={player} fontSize={size.score} scoredCount={scoredCount} won />
          {player.hasMatches ? <PanelStats player={player} fontSize={size.stat} kda={size.kda} /> : null}
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", top: -20, left: 0, right: 0, justifyContent: "center" }}>
        <LeaderTag player={player} tied={tied} fontSize={count === 5 ? 22 : 24} />
      </div>
    </div>
  );
}

function Showdown({ data }: { data: CompareCardData }) {
  const count = Math.min(5, data.players.length) as 3 | 4 | 5;
  const tied = data.players.filter((player) => player.leader).length > 1;
  const gap = PANEL_SIZES[count].gap;
  // The slant pushes each panel's corners out by about 20px; the margin keeps them on the card.
  const margin = 30;
  const row = CARD_WIDTH - 2 * margin;
  const width = Math.floor((row - gap * (count - 1)) / count);
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        fontFamily: "Inter",
        color: OG.foreground,
        backgroundColor: OG.background,
        backgroundImage: `radial-gradient(circle at 50% 0%, ${OG.primary}40 0%, transparent 60%)`,
      }}
    >
      <TopBar logo={data.logo} />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 90,
          bottom: 78,
          left: margin,
          right: margin,
          gap,
        }}
      >
        {data.players.slice(0, 5).map((player) => (
          <Panel
            key={player.color}
            player={player}
            count={count}
            tied={tied}
            width={width}
            scoredCount={data.scoredCount}
          />
        ))}
      </div>
      <BottomBar context={data.context} />
    </div>
  );
}

/**
 * The share card of a comparison, an esports broadcast VS screen: a diagonal split in the two players' colors, or
 * slanted color panels for three to five, the winner tagged and lit.
 */
export function CompareCard({ data }: { data: CompareCardData }) {
  return data.players.length <= 2 ? <HeadToHead data={data} /> : <Showdown data={data} />;
}
