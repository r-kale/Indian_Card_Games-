import { cardPoints } from '../../core/cards';
import { matchWinner } from './scoring';
import type { GameEvent } from '../../protocol/events';
import type { Game304State } from './types';

/** Ephemeral cues (toasts/animations) implied by a state transition. */
export function deriveEvents(prev: Game304State, next: Game304State): GameEvent[] {
  const events: GameEvent[] = [];
  if (
    next.lastTrickWinner !== null &&
    next.lastTrick !== null &&
    next.dealNumber === prev.dealNumber &&
    next.trick.length === 0 &&
    prev.trick.length === 3
  ) {
    events.push({
      type: 'trickWon',
      seat: next.lastTrickWinner,
      points: next.lastTrick.reduce((s, p) => s + cardPoints(p.card), 0),
    });
  }
  if (prev.trump !== null && !prev.trump.revealed && next.trump?.revealed === true) {
    events.push({ type: 'trumpRevealed', suit: next.trump.suit });
  }
  if (prev.dealResult === null && next.dealResult !== null) {
    events.push({ type: 'dealScored', result: next.dealResult });
  }
  if (next.phase === 'matchOver' && prev.phase !== 'matchOver') {
    const winner = matchWinner(next.matchScore);
    if (winner !== null) events.push({ type: 'matchOver', winner });
  }
  return events;
}
