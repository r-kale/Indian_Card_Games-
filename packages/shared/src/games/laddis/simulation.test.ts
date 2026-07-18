import { describe, expect, it } from 'vitest';
import { makeRng } from '../../core/rng';
import { chooseAction } from './bot';
import { actingSeat, applyAction, initRound, legalActions } from './engine';
import { redactFor } from './view';
import type { LaddisState } from './types';

/**
 * Four bots play complete Laddis matches through the public engine surface.
 * A match runs until either team's deficit reaches a laddoo (32) or 30
 * rounds pass, then the "host" ends it — mirroring real variable-length play.
 */
describe('laddis bot simulation', () => {
  it('plays 30 full matches without an illegal action', () => {
    let totalRounds = 0;
    for (let match = 0; match < 30; match++) {
      const rng = makeRng(`laddis-bots-${match}`);
      let state: LaddisState = initRound({
        deficit: 0,
        shufflingTeam: 0,
        dealer: 0,
        seed: `laddis-match-${match}`,
        roundNumber: 1,
      });
      let steps = 0;
      while (state.phase !== 'matchOver') {
        if (++steps > 20000) throw new Error('simulation did not terminate');
        const seat = actingSeat(state);
        if (seat === null) {
          // roundOver: check invariants, then continue or end the match.
          // Decided rounds end early, so at most 4 (vakhaai) or 8 hands fall.
          const expectedTricks = state.mode === 'vakhaai' ? 4 : 8;
          expect(state.tricksTaken.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(expectedTricks);
          const r = state.roundResult!;
          expect(r.deficitAfter).toBeGreaterThanOrEqual(0);
          if (state.mode === 'vakhaai') {
            expect(state.hukum).toBeNull(); // no trumps in a vakhaai round
            // The caller's partner is redundant: their cards can never win.
            expect(state.tricksTaken[(state.vakhaai!.caller + 2) % 4]).toBe(0);
          } else {
            expect(state.hukum!.revealed).toBe(true);
          }
          totalRounds++;
          const done = r.deficitAfter >= 32 || state.roundNumber >= 30;
          state = applyAction(state, { type: done ? 'endMatch' : 'nextRound', seat: 0 });
          continue;
        }
        const view = redactFor(state, seat);
        // Redaction: the hidden hukum suit leaks to nobody but its declarer.
        if (
          state.hukum !== null &&
          !state.hukum.revealed &&
          seat !== state.hukum.declarer
        ) {
          expect(view.hukum!.suit).toBeNull();
        }
        expect(view.hand.length).toBe(state.hands[seat].length);
        const action = chooseAction(view, rng);
        if (action.type === 'vakhaai' || action.type === 'declareHukum') {
          // Parameterised actions are validated by applyAction itself.
          expect(legalActions(state, seat).length).toBeGreaterThan(0);
        } else {
          expect(legalActions(state, seat)).toContainEqual(action);
        }
        state = applyAction(state, action);
      }
    }
    expect(totalRounds).toBeGreaterThanOrEqual(100);
  });
});
