import { sortHand } from '../../core/cards';
import { legalActions } from './engine';
import type { Game304State, Player304View, Seat } from './types';

/**
 * Produce the redacted view one seat (or a spectator) may see.
 * Other players' hands become counts; the partner card is public but the
 * holder's seat stays hidden until revealed (the holder knows themself).
 */
export function redactFor(state: Game304State, seat: Seat | null): Player304View {
  let partner: Player304View['partner'] = null;
  if (state.partner !== null) {
    const knowsSeat = state.partner.revealed || state.partner.seat === seat;
    partner = {
      card: state.partner.card,
      revealed: state.partner.revealed,
      seat: knowsSeat ? state.partner.seat : null,
    };
  }
  return {
    seat,
    phase: state.phase,
    dealNumber: state.dealNumber,
    dealer: state.dealer,
    hand: seat === null ? [] : sortHand(state.hands[seat]),
    handCounts: [
      state.hands[0].length,
      state.hands[1].length,
      state.hands[2].length,
      state.hands[3].length,
    ],
    bidding: state.bidding,
    bid: state.bid,
    trumpSuit: state.trumpSuit,
    partner,
    turn: state.turn,
    trick: state.trick,
    trickLeader: state.trickLeader,
    capturedPoints: state.capturedPoints,
    tricksTaken: state.tricksTaken,
    lastTrick: state.lastTrick,
    lastTrickWinner: state.lastTrickWinner,
    dealResult: state.dealResult,
    matchScore: state.matchScore,
    legalActions: seat === null ? [] : legalActions(state, seat),
  };
}
