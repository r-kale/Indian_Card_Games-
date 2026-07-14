import { sortHand } from '../../core/cards';
import { legalActions } from './engine';
import type { Game304State, Player304View, Seat } from './types';

/**
 * Produce the redacted view one seat (or a spectator) may see.
 * Other players' hands become counts; the concealed trump stays hidden from
 * everyone except the bidder; the undealt pile is never exposed.
 */
export function redactFor(state: Game304State, seat: Seat | null): Player304View {
  const isBidder = seat !== null && state.bid !== null && state.bid.bidder === seat;
  let trump: Player304View['trump'] = null;
  if (state.trump !== null) {
    if (state.trump.revealed) {
      trump = { revealed: true, suit: state.trump.suit, card: state.trump.card };
    } else if (isBidder) {
      trump = { revealed: false, suit: state.trump.suit, card: state.trump.card };
    } else {
      trump = { revealed: false, suit: null, card: null };
    }
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
    trump,
    turn: state.turn,
    trick: state.trick,
    trickLeader: state.trickLeader,
    mustPlayTrump: state.mustPlayTrump,
    capturedPoints: state.capturedPoints,
    tricksTaken: state.tricksTaken,
    lastTrick: state.lastTrick,
    lastTrickWinner: state.lastTrickWinner,
    dealResult: state.dealResult,
    matchScore: state.matchScore,
    legalActions: seat === null ? [] : legalActions(state, seat),
  };
}
