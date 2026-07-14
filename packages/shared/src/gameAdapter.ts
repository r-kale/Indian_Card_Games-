import { actingSeat, applyAction, initDeal, legalActions } from './games/game304/engine';
import { chooseAction } from './games/game304/bot';
import { redactFor } from './games/game304/view';
import type { Action304, Game304State, Player304View, Seat } from './games/game304/types';
import type { Rng } from './core/rng';

/**
 * Game-agnostic engine surface the server room drives. Badam 7 and Ladiez
 * plug in later as further implementations of this interface.
 */
export interface GameEngine<S, A, V> {
  init(config: { seed: string }): S;
  /** Seat that must act now, or null when nobody is on the clock. */
  actingSeat(state: S): number | null;
  legalActions(state: S, seat: number): A[];
  apply(state: S, action: A): S;
  viewFor(state: S, seat: number | null): V;
  botAction(view: V, rng: Rng): A;
  isTerminal(state: S): boolean;
  seatCount: number;
}

export const game304Engine: GameEngine<Game304State, Action304, Player304View> = {
  seatCount: 4,
  init: ({ seed }) => initDeal({ matchScore: [0, 0, 0, 0], dealer: 0, seed, dealNumber: 1 }),
  actingSeat: (state) => actingSeat(state),
  legalActions: (state, seat) => legalActions(state, seat as Seat),
  apply: (state, action) => applyAction(state, action),
  viewFor: (state, seat) => redactFor(state, seat as Seat | null),
  botAction: (view, rng) => chooseAction(view, rng),
  isTerminal: (state) => state.phase === 'matchOver',
};
