import {
  KALYAS_PER_ARDHA,
  KALYAS_PER_LADDOO,
  NORMAL_LOSS,
  NORMAL_WIN,
  SIX_LOSS,
  SIX_WIN,
  teamOf,
} from './types';
import type { LaddisState, RoundResult, Team } from './types';

/**
 * Settle a finished round onto the shared ledger (the shuffling team's
 * deficit). Positive delta = deficit grows; when the deficit is erased
 * (<= 0) the roles swap and any overshoot becomes the other team's deficit.
 */
export function scoreRound(s: LaddisState): RoundResult {
  const teamTricks: [number, number] = [
    s.tricksTaken[0] + s.tricksTaken[2],
    s.tricksTaken[1] + s.tricksTaken[3],
  ];
  let made: boolean;
  let attemptingTeam: Team;
  let delta: number;

  if (s.mode === 'vakhaai') {
    const { caller, bet } = s.vakhaai!;
    attemptingTeam = teamOf(caller);
    // Only 4 tricks exist in a vakhaai round: the caller must take them all.
    made = s.tricksTaken[caller] >= 4;
    const callerShuffling = attemptingTeam === s.shufflingTeam;
    delta = callerShuffling ? (made ? -bet : 2 * bet) : made ? bet : -2 * bet;
  } else if (s.mode === 'six') {
    attemptingTeam = teamOf(s.six!.caller);
    made = teamTricks[attemptingTeam] >= 6;
    const callerShuffling = attemptingTeam === s.shufflingTeam;
    delta = callerShuffling ? (made ? -SIX_WIN : SIX_LOSS) : made ? SIX_WIN : -SIX_LOSS;
  } else {
    attemptingTeam = s.shufflingTeam;
    made = teamTricks[s.shufflingTeam] >= 4;
    delta = made ? -NORMAL_WIN : NORMAL_LOSS;
  }

  const raw = s.deficit + delta;
  const swapped = raw <= 0; // deficit erased: the other team starts shuffling
  const deficitAfter = Math.abs(raw);
  const shufflingTeamAfter = swapped ? ((1 - s.shufflingTeam) as Team) : s.shufflingTeam;

  return {
    mode: s.mode,
    made,
    attemptingTeam,
    vakhaai: s.vakhaai,
    six: s.six,
    teamTricks,
    delta,
    deficitAfter,
    shufflingTeamAfter,
    swapped,
  };
}

/** "37 kalyas" -> "1 laddoo 5 kalyas", "16" -> "ardha laddoo", etc. */
export function formatKalyas(kalyas: number): string {
  if (kalyas === 0) return '0 kalyas';
  const laddoos = Math.floor(kalyas / KALYAS_PER_LADDOO);
  let rest = kalyas % KALYAS_PER_LADDOO;
  const parts: string[] = [];
  if (laddoos > 0) parts.push(`${laddoos} laddoo${laddoos > 1 ? 's' : ''}`);
  if (rest >= KALYAS_PER_ARDHA) {
    parts.push('ardha');
    rest -= KALYAS_PER_ARDHA;
  }
  if (rest > 0) parts.push(`${rest} kalya${rest > 1 ? 's' : ''}`);
  return parts.join(' + ');
}
