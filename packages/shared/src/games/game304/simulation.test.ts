import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import { chooseAction } from './bot';
import { actingSeat, applyAction, initDeal, legalActions } from './engine';
import { redactFor } from './view';
import type { Game304State } from './types';

/**
 * Four bots play complete matches through the public engine surface only.
 * This fuzzes every phase transition and is the regression net for refactors.
 */
describe('bot simulation', () => {
  it('plays 40 full matches (200+ deals) without an illegal action', () => {
    let totalDeals = 0;
    for (let match = 0; match < 40; match++) {
      const rng = makeRng(`bots-${match}`);
      let state: Game304State = initDeal({
        matchScore: [0, 0],
        dealer: 0,
        seed: `match-${match}`,
        dealNumber: 1,
      });
      let steps = 0;
      while (state.phase !== 'matchOver') {
        if (++steps > 5000) throw new Error('simulation did not terminate');
        const seat = actingSeat(state);
        if (seat === null) {
          // dealOver: check the invariants of a finished deal, then move on.
          expect(state.capturedPoints[0] + state.capturedPoints[1]).toBe(304);
          expect(state.tricksTaken[0] + state.tricksTaken[1]).toBe(8);
          expect(state.dealResult).not.toBeNull();
          totalDeals++;
          state = applyAction(state, { type: 'nextDeal', seat: 0 });
          continue;
        }
        const view = redactFor(state, seat);
        // Redaction invariants: a seat sees only its own cards.
        expect(view.hand.length).toBe(state.hands[seat].length);
        if (state.trump !== null && !state.trump.revealed && state.bid!.bidder !== seat) {
          expect(view.trump).toEqual({ revealed: false, suit: null, card: null });
        }
        const action = chooseAction(view, rng);
        const legal = legalActions(state, seat);
        expect(legal).toContainEqual(action);
        state = applyAction(state, action);
      }
      expect(Math.max(state.matchScore[0], state.matchScore[1])).toBeGreaterThanOrEqual(6);
    }
    expect(totalDeals).toBeGreaterThanOrEqual(150);
  });
});
