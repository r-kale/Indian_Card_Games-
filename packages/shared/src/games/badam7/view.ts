import { RANK_VALUE, SUITS } from '../../core/cards';
import type { Card } from '../../core/cards';
import { legalActions } from './engine';
import type { BadamState, BadamView } from './types';

/** Hands read best grouped by suit, low to high (toward each 7). */
function sortForDisplay(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  });
}

/** Everything in Badam 7 is public except the other players' hands. */
export function redactFor(state: BadamState, seat: number | null): BadamView {
  return {
    gameId: 'badam7',
    phase: state.phase,
    players: state.players,
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    seat,
    hand: seat === null ? [] : sortForDisplay(state.hands[seat]!),
    handCounts: state.hands.map((h) => h.length),
    layout: state.layout,
    turn: state.turn,
    lastMove: state.lastMove,
    totals: state.totals,
    roundResult: state.roundResult,
    legalActions: seat === null ? [] : legalActions(state, seat),
  };
}
