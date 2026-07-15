import {
  actingSeat as actingSeat304,
  applyAction as apply304,
  initDeal,
  legalActions as legal304,
} from './games/game304/engine';
import { chooseAction as bot304Choose } from './games/game304/bot';
import { deriveEvents as events304 } from './games/game304/events';
import { redactFor as redact304 } from './games/game304/view';
import type { Action304, Game304State, Player304View, Seat } from './games/game304/types';
import {
  actingSeat as actingSeatLaddis,
  applyAction as applyLaddis,
  initRound,
  legalActions as legalLaddis,
} from './games/laddis/engine';
import { chooseAction as botLaddisChoose } from './games/laddis/bot';
import { deriveEvents as eventsLaddis } from './games/laddis/events';
import { redactFor as redactLaddis } from './games/laddis/view';
import { teamOf as laddisTeamOf } from './games/laddis/types';
import type { LaddisAction, LaddisState, LaddisView, Seat as LaddisSeat } from './games/laddis/types';
import {
  actingSeat as actingSeatBadam,
  applyAction as applyBadam,
  initRound as initBadamRound,
  legalActions as legalBadam,
  randomDealer as randomBadamDealer,
} from './games/badam7/engine';
import { chooseAction as botBadamChoose } from './games/badam7/bot';
import { deriveEvents as eventsBadam } from './games/badam7/events';
import { redactFor as redactBadam } from './games/badam7/view';
import type { BadamAction, BadamState, BadamView } from './games/badam7/types';
import type { GameEvent } from './protocol/events';
import type { GameId } from './protocol/room';
import type { Rng } from './core/rng';

/**
 * Game-agnostic engine surface the rooms drive (server, P2P host, offline).
 * Every game on the platform is one implementation of this interface.
 */
export interface GameEngine<S, A, V> {
  /** Seat range: fixed games have minSeats === maxSeats. */
  minSeats: number;
  maxSeats: number;
  init(config: { seed: string; hostSeat?: number; players?: number }): S;
  /** Seat that must act now, or null when nobody is on the clock. */
  actingSeat(state: S): number | null;
  legalActions(state: S, seat: number): A[];
  apply(state: S, action: A): S;
  viewFor(state: S, seat: number | null): V;
  botAction(view: V, rng: Rng): A;
  deriveEvents(prev: S, next: S): GameEvent[];
  phaseKind(state: S): 'acting' | 'roundOver' | 'matchOver';
  /** Action a room timer fires to advance past roundOver on its own. */
  autoAdvance(state: S): A;
  /** True right after a completed trick mid-round (rooms pause bots briefly). */
  newTrickPause(state: S): boolean;
  /** Actions only the room host may perform. */
  hostOnly(action: A): boolean;
  /** Bot "thinking" time in ms; games that read better slow override this. */
  botDelayMs?(): number;
}

export const game304Engine: GameEngine<Game304State, Action304, Player304View> = {
  minSeats: 4,
  maxSeats: 4,
  init: ({ seed }) => initDeal({ matchScore: [0, 0, 0, 0], dealer: 0, seed, dealNumber: 1 }),
  actingSeat: (state) => actingSeat304(state),
  legalActions: (state, seat) => legal304(state, seat as Seat),
  apply: (state, action) => apply304(state, action),
  viewFor: (state, seat) => redact304(state, seat as Seat | null),
  botAction: (view, rng) => bot304Choose(view, rng),
  deriveEvents: (prev, next) => events304(prev, next),
  phaseKind: (state) =>
    state.phase === 'matchOver' ? 'matchOver' : state.phase === 'dealOver' ? 'roundOver' : 'acting',
  autoAdvance: () => ({ type: 'nextDeal', seat: 0 }),
  newTrickPause: (state) =>
    state.phase === 'playing' && state.trick.length === 0 && state.lastTrick !== null,
  hostOnly: (action) => action.type === 'endMatch',
};

export const laddisEngine: GameEngine<LaddisState, LaddisAction, LaddisView> = {
  minSeats: 4,
  maxSeats: 4,
  init: ({ seed, hostSeat }) =>
    initRound({
      deficit: 0,
      shufflingTeam: laddisTeamOf((hostSeat ?? 0) as LaddisSeat),
      dealer: (hostSeat ?? 0) as LaddisSeat,
      seed,
      roundNumber: 1,
    }),
  actingSeat: (state) => actingSeatLaddis(state),
  legalActions: (state, seat) => legalLaddis(state, seat as LaddisSeat),
  apply: (state, action) => applyLaddis(state, action),
  viewFor: (state, seat) => redactLaddis(state, seat as LaddisSeat | null),
  botAction: (view, rng) => botLaddisChoose(view, rng),
  deriveEvents: (prev, next) => eventsLaddis(prev, next),
  phaseKind: (state) =>
    state.phase === 'matchOver' ? 'matchOver' : state.phase === 'roundOver' ? 'roundOver' : 'acting',
  autoAdvance: () => ({ type: 'nextRound', seat: 0 }),
  newTrickPause: (state) =>
    state.phase === 'playing' && state.trick.length === 0 && state.lastTrick !== null,
  hostOnly: (action) => action.type === 'endMatch',
};

export const badam7Engine: GameEngine<BadamState, BadamAction, BadamView> = {
  minSeats: 3,
  maxSeats: 8,
  init: ({ seed, players }) =>
    initBadamRound({
      players: players ?? 4,
      dealer: randomBadamDealer(seed, players ?? 4),
      totals: Array.from({ length: players ?? 4 }, () => 0),
      seed,
      roundNumber: 1,
    }),
  actingSeat: (state) => actingSeatBadam(state),
  legalActions: (state, seat) => legalBadam(state, seat),
  apply: (state, action) => applyBadam(state, action),
  viewFor: (state, seat) => redactBadam(state, seat),
  botAction: (view, rng) => botBadamChoose(view, rng),
  deriveEvents: (prev, next) => eventsBadam(prev, next),
  phaseKind: (state) =>
    state.phase === 'matchOver' ? 'matchOver' : state.phase === 'roundOver' ? 'roundOver' : 'acting',
  autoAdvance: () => ({ type: 'nextRound', seat: 0 }),
  newTrickPause: () => false,
  hostOnly: (action) => action.type === 'endMatch',
  // A gentler pace than the trick games so the layout is readable move by move.
  botDelayMs: () => 1400 + Math.random() * 700,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyGameEngine = GameEngine<any, any, any>;

export const engines: Record<GameId, AnyGameEngine> = {
  game304: game304Engine,
  laddis: laddisEngine,
  badam7: badam7Engine,
};
