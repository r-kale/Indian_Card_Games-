import type { GameEvent } from '../../protocol/events';
import type { BadamState } from './types';

/** Diff two states into UI cues (toasts); one action produces one diff. */
export function deriveEvents(prev: BadamState, next: BadamState): GameEvent[] {
  const events: GameEvent[] = [];
  if (
    next.lastMove !== null &&
    next.lastMove.card === null &&
    JSON.stringify(prev.lastMove) !== JSON.stringify(next.lastMove)
  ) {
    events.push({ type: 'badamPassed', seat: next.lastMove.seat });
  }
  if (prev.phase === 'playing' && next.phase === 'roundOver' && next.roundResult !== null) {
    events.push({ type: 'badamRoundScored', result: next.roundResult });
  }
  return events;
}
