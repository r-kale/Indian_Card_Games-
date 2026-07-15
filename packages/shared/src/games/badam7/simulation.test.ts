import { describe, expect, it } from 'vitest';
import { RANK_VALUE } from '../../core/cards';
import { makeRng } from '../../core/rng';
import { chooseAction } from './bot';
import { actingSeat, applyAction, initRound } from './engine';
import { redactFor } from './view';
import type { BadamState } from './types';

/**
 * Bots play complete Badam 7 matches at every table size (3-8 players)
 * through the public engine surface: five rounds each, then end the match.
 */
describe('badam 7 bot simulation', () => {
  it('plays full matches at 3-8 players without an illegal action', () => {
    for (let players = 3; players <= 8; players++) {
      for (let match = 0; match < 5; match++) {
        const rng = makeRng(`badam-bots-${players}-${match}`);
        let state: BadamState = initRound({
          players,
          dealer: 0,
          totals: Array.from({ length: players }, () => 0),
          seed: `badam-match-${players}-${match}`,
          roundNumber: 1,
        });
        let steps = 0;
        while (state.phase !== 'matchOver') {
          if (++steps > 20000) throw new Error('simulation did not terminate');
          const seat = actingSeat(state);
          if (seat === null) {
            // Round over: cards conserved, winner really went out, and the
            // penalties are the value of what everyone is still holding.
            const r = state.roundResult!;
            expect(state.hands[r.winner]).toHaveLength(0);
            expect(r.cardsLeft.reduce((a, b) => a + b, 0)).toBe(
              state.hands.reduce((a, h) => a + h.length, 0),
            );
            expect(r.pointsLeft.reduce((a, b) => a + b, 0)).toBe(
              state.hands.reduce((a, h) => a + h.reduce((x, c) => x + RANK_VALUE[c.rank], 0), 0),
            );
            const done = state.roundNumber >= 5;
            state = applyAction(state, { type: done ? 'endMatch' : 'nextRound', seat: 0 });
            continue;
          }
          // Layout stays contiguous around each suit's 7.
          for (const row of Object.values(state.layout)) {
            if (row.low !== null) {
              expect(row.low).toBeLessThanOrEqual(7);
              expect(row.high).toBeGreaterThanOrEqual(7);
            }
          }
          // Cards on the table + cards in hands = the whole pack.
          const onTable = Object.values(state.layout).reduce(
            (a, row) => a + (row.low === null || row.high === null ? 0 : row.high - row.low + 1),
            0,
          );
          const inHands = state.hands.reduce((a, h) => a + h.length, 0);
          expect(onTable + inHands).toBe(52);

          const view = redactFor(state, seat);
          expect(view.hand.length).toBe(state.hands[seat]!.length);
          const action = chooseAction(view, rng);
          if (action.type === 'pass') {
            // Bots only pass when genuinely stuck. Before any card falls,
            // only the 7 of Hearts itself is playable.
            const nothingOpened = Object.values(state.layout).every((r) => r.low === null);
            expect(
              state.hands[seat]!.every((c) => {
                if (nothingOpened) return !(c.rank === '7' && c.suit === 'H');
                const row = state.layout[c.suit];
                if (row.low === null || row.high === null) return RANK_VALUE[c.rank] !== 7;
                const v = RANK_VALUE[c.rank];
                return v !== row.high + 1 && v !== row.low - 1;
              }),
            ).toBe(true);
          }
          state = applyAction(state, action);
        }
        expect(state.roundNumber).toBe(5);
      }
    }
  });
});
