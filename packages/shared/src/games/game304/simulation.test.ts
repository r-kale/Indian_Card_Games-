import { describe, expect, it } from 'vitest';
import { cardsEqual } from '../../core/cards';
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
  it('plays 40 full matches without an illegal action', () => {
    let totalDeals = 0;
    for (let match = 0; match < 40; match++) {
      const rng = makeRng(`bots-${match}`);
      let state: Game304State = initDeal({
        matchScore: [0, 0, 0, 0],
        dealer: 0,
        seed: `match-${match}`,
        dealNumber: 1,
      });
      let steps = 0;
      while (state.phase !== 'matchOver') {
        if (++steps > 10000) throw new Error('simulation did not terminate');
        const seat = actingSeat(state);
        if (seat === null) {
          // dealOver: check the invariants of a finished deal, then move on.
          expect(state.capturedPoints.reduce((a, b) => a + b, 0)).toBe(304);
          expect(state.tricksTaken.reduce((a, b) => a + b, 0)).toBe(8);
          const result = state.dealResult!;
          expect(result.partnerSeat).not.toBe(result.bidder);
          expect(['allied', 'lone']).toContain(state.partner!.status);
          // Deltas always match the alliance outcome (lost bids cost points):
          // made -> winners collect +2 net; allied failure -> +2 defenders,
          // -2 bid team = 0; lone failure -> +3 others, -2 bidder = +1.
          const deltaSum = result.deltas.reduce((a, b) => a + b, 0);
          expect(deltaSum).toBe(result.madeIt ? 2 : result.alliance === 'lone' ? 1 : 0);
          totalDeals++;
          state = applyAction(state, { type: 'nextDeal', seat: 0 });
          continue;
        }
        const view = redactFor(state, seat);
        // Redaction invariants: a seat sees only its own cards, and the
        // hidden partner's seat leaks to nobody but the partner themself.
        expect(view.hand.length).toBe(state.hands[seat].length);
        if (
          state.partner !== null &&
          state.partner.status === 'hidden' &&
          seat !== state.partner.seat
        ) {
          expect(view.partner!.seat).toBeNull();
        }
        const action = chooseAction(view, rng);
        if (action.type === 'declare') {
          // Declarations are validated by applyAction, not enumerated.
          expect(state.hands[seat].some((c) => cardsEqual(c, action.partnerCard))).toBe(false);
        } else {
          expect(legalActions(state, seat)).toContainEqual(action);
        }
        state = applyAction(state, action);
      }
      expect(Math.max(...state.matchScore)).toBeGreaterThanOrEqual(5);
    }
    expect(totalDeals).toBeGreaterThanOrEqual(150);
  });
});
