import { RANK_ORDER_STANDARD, sortHand } from '../../core/cards';
import { legalActions } from './engine';
import type { LaddisState, LaddisView, Seat } from './types';

/**
 * Redacted view for one seat (or a spectator): other hands become counts and
 * the hidden hukum suit is visible only to its declarer until revealed.
 */
export function redactFor(state: LaddisState, seat: Seat | null): LaddisView {
  let hukum: LaddisView['hukum'] = null;
  if (state.hukum !== null) {
    const knowsSuit = state.hukum.revealed || state.hukum.declarer === seat;
    hukum = {
      declarer: state.hukum.declarer,
      revealed: state.hukum.revealed,
      suit: knowsSuit ? state.hukum.suit : null,
    };
  }
  return {
    seat,
    phase: state.phase,
    roundNumber: state.roundNumber,
    dealer: state.dealer,
    shufflingTeam: state.shufflingTeam,
    deficit: state.deficit,
    hand: seat === null ? [] : sortHand(state.hands[seat], RANK_ORDER_STANDARD),
    handCounts: [
      state.hands[0].length,
      state.hands[1].length,
      state.hands[2].length,
      state.hands[3].length,
    ],
    window: state.window,
    hukum,
    mode: state.mode,
    vakhaai: state.vakhaai,
    six: state.six,
    mustPlayHukum: state.mustPlayHukum,
    turn: state.turn,
    trick: state.trick,
    trickLeader: state.trickLeader,
    tricksTaken: state.tricksTaken,
    lastTrick: state.lastTrick,
    lastTrickWinner: state.lastTrickWinner,
    showdown:
      state.phase === 'roundOver' || state.phase === 'matchOver'
        ? state.hands.map((h) => sortHand(h, RANK_ORDER_STANDARD))
        : null,
    roundResult: state.roundResult,
    legalActions: seat === null ? [] : legalActions(state, seat),
  };
}
