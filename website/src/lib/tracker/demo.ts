/**
 * The demo tracker profile is generated, not fetched. Its ids sit above anything Steam or the game has issued, so a
 * query can tell a demo id from a real one by value alone.
 */
export const DEMO_ACCOUNT_ID = 4_294_000_000;

const DEMO_ACCOUNT_ID_END = DEMO_ACCOUNT_ID + 1_000;
const DEMO_MATCH_ID_START = 9_000_000_000;

/** The demo player or one of the generated players they are matched with. */
export function isDemoAccount(accountId: number): boolean {
  return accountId >= DEMO_ACCOUNT_ID && accountId < DEMO_ACCOUNT_ID_END;
}

export function isDemoMatch(matchId: number): boolean {
  return matchId >= DEMO_MATCH_ID_START;
}

export function demoMatchId(index: number): number {
  return DEMO_MATCH_ID_START + index;
}

export function demoMatchIndex(matchId: number): number {
  return matchId - DEMO_MATCH_ID_START;
}
