export const LIFE_TICK_COOLDOWN_SECONDS = 6n * 60n * 60n;

export interface LifeTickCandidate {
  tokenId: bigint;
  initialized: boolean;
  lastLifeTickAt: bigint;
  hibernating?: boolean;
}

/**
 * Select tokens whose public lifeTick may be attempted now. Hibernating
 * creatures remain eligible because MerzavetsWorld itself suppresses social
 * autonomous intent while still allowing bounded physiological ticking.
 */
export function dueLifeTicks(
  states: readonly LifeTickCandidate[],
  now: bigint,
  cooldown: bigint = LIFE_TICK_COOLDOWN_SECONDS,
): bigint[] {
  if (now < 0n || cooldown < 0n) throw new Error("time values must be non-negative");

  return states
    .filter((state) => {
      if (!state.initialized || state.lastLifeTickAt < 0n) return false;
      if (state.lastLifeTickAt > now) return false;
      return now - state.lastLifeTickAt >= cooldown;
    })
    .map((state) => state.tokenId)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
