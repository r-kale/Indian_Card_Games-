import type { Card, Suit } from '../../core/cards';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export type BadamPhase = 'playing' | 'roundOver' | 'matchOver';

/**
 * One suit's row on the table. Suits build outward from the 7: `low`/`high`
 * are RANK_VALUE bounds (A=1 … K=13) of the contiguous span already played.
 * null = the suit's 7 hasn't been opened yet.
 */
export interface SuitLayout {
  low: number | null;
  high: number | null;
}

export interface BadamRoundResult {
  winner: number;
  /** Cards each player was left holding — the penalty added this round. */
  cardsLeft: number[];
  totalsAfter: number[];
}

export interface BadamState {
  phase: BadamPhase;
  players: number;
  roundNumber: number;
  dealer: number;
  hands: Card[][];
  layout: Record<Suit, SuitLayout>;
  /** Seat on the clock, null outside 'playing'. */
  turn: number | null;
  /** Most recent move, for UI cues; card null = the seat passed. */
  lastMove: { seat: number; card: Card | null } | null;
  /** Cumulative penalty points (cards left when someone went out). */
  totals: number[];
  roundResult: BadamRoundResult | null;
  seed: string;
}

export type BadamAction =
  | { type: 'playCard'; seat: number; card: Card }
  | { type: 'pass'; seat: number }
  | { type: 'nextRound'; seat: number }
  | { type: 'endMatch'; seat: number };

export interface BadamView {
  gameId: 'badam7';
  phase: BadamPhase;
  players: number;
  roundNumber: number;
  dealer: number;
  seat: number | null;
  hand: Card[];
  handCounts: number[];
  layout: Record<Suit, SuitLayout>;
  turn: number | null;
  lastMove: { seat: number; card: Card | null } | null;
  totals: number[];
  roundResult: BadamRoundResult | null;
  legalActions: BadamAction[];
}

export class BadamError extends Error {}

export function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players;
}

/** Seats with the lowest cumulative penalty — the match leaders/winners. */
export function matchWinners(totals: readonly number[]): number[] {
  const best = Math.min(...totals);
  return totals.flatMap((t, seat) => (t === best ? [seat] : []));
}
