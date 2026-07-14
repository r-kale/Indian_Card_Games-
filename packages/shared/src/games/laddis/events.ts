import type { GameEvent } from '../../protocol/events';
import type { LaddisState } from './types';

/** Ephemeral cues (toasts/animations) implied by a state transition. */
export function deriveEvents(prev: LaddisState, next: LaddisState): GameEvent[] {
  const events: GameEvent[] = [];
  if (
    next.lastTrickWinner !== null &&
    next.roundNumber === prev.roundNumber &&
    next.trick.length === 0 &&
    prev.trick.length === 3
  ) {
    events.push({ type: 'trickWon', seat: next.lastTrickWinner, points: 0 });
  }
  if (prev.vakhaai === null && next.vakhaai !== null) {
    events.push({ type: 'vakhaaiCalled', seat: next.vakhaai.caller, bet: next.vakhaai.bet });
  }
  if (prev.six === null && next.six !== null) {
    events.push({ type: 'sixCalled', seat: next.six.caller });
  }
  if (
    prev.hukum !== null &&
    !prev.hukum.revealed &&
    next.hukum?.revealed === true &&
    next.phase === 'playing' // the showdown reveal at round end is covered by roundScored
  ) {
    events.push({ type: 'hukumRevealed', suit: next.hukum.suit });
  }
  if (prev.roundResult === null && next.roundResult !== null) {
    events.push({ type: 'roundScored', result: next.roundResult });
  }
  return events;
}
