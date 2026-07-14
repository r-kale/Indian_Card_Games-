import { NORMAL_LOSS, NORMAL_WIN, SIX_LOSS, SIX_WIN, teamOf } from './types';
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

/** Scores read as plain numbers: "37 kalyas" stays "37 kalyas". */
export function formatKalyas(kalyas: number): string {
  return `${kalyas} kalya${kalyas === 1 ? '' : 's'}`;
}
