import { cardPoints } from '../../core/cards';
import { matchWinners } from './scoring';
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
  if (
    prev.partner !== null &&
    !prev.partner.revealed &&
    next.partner?.revealed === true &&
    next.phase === 'playing' // showdown reveal at deal end is covered by dealScored
  ) {
    events.push({ type: 'partnerRevealed', seat: next.partner.seat, card: next.partner.card });
  }
  if (prev.dealResult === null && next.dealResult !== null) {
    events.push({ type: 'dealScored', result: next.dealResult });
  }
  if (next.phase === 'matchOver' && prev.phase !== 'matchOver') {
    events.push({ type: 'matchOver', winners: matchWinners(next.matchScore) });
  }
  return events;
}
