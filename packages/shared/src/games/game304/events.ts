import { cardPoints } from '../../core/cards';
import { matchLeaders } from './scoring';
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
    next.partner !== null &&
    (prev.partner.status === 'hidden' || prev.partner.status === 'played') &&
    (next.partner.status === 'allied' || next.partner.status === 'lone') &&
    next.phase === 'playing' // deal-end resolution is covered by dealScored
  ) {
    events.push({
      type: 'partnerRevealed',
      seat: next.partner.seat,
      card: next.partner.card,
      alliance: next.partner.status,
    });
  }
  // A player showed a marriage (marriages only ever grow within a deal).
  if (next.dealNumber === prev.dealNumber && next.marriages.length > prev.marriages.length) {
    for (const m of next.marriages.slice(prev.marriages.length)) {
      events.push({
        type: 'marriageShown',
        seat: m.seat,
        suit: m.suit,
        hukum: m.suit === next.trumpSuit,
      });
    }
  }
  if (prev.dealResult === null && next.dealResult !== null) {
    events.push({ type: 'dealScored', result: next.dealResult });
  }
  if (next.phase === 'matchOver' && prev.phase !== 'matchOver') {
    events.push({ type: 'matchOver', winners: matchLeaders(next.matchScore) });
  }
  return events;
}
