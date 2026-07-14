import { buildDeck52, cardsEqual, RANK_VALUE } from '../../core/cards';
import type { Card, Suit } from '../../core/cards';
import { makeRng, shuffle } from '../../core/rng';
import { BadamError, MAX_PLAYERS, MIN_PLAYERS, nextSeat } from './types';
import type { BadamAction, BadamState, SuitLayout } from './types';

export interface BadamRoundConfig {
  players: number;
  dealer: number;
  totals: number[];
  seed: string;
  roundNumber: number;
}

const EMPTY_LAYOUT = (): Record<Suit, SuitLayout> => ({
  S: { low: null, high: null },
  H: { low: null, high: null },
  D: { low: null, high: null },
  C: { low: null, high: null },
});

/**
 * Deal the whole pack round-robin from the dealer's left (hands may differ by
 * one card when 52 doesn't divide evenly). The 7♥ holder is on the clock and
 * must open with it.
 */
export function initRound(config: BadamRoundConfig): BadamState {
  const { players } = config;
  if (players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new BadamError(`Badam 7 plays with ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  const rng = makeRng(`${config.seed}/round${config.roundNumber}`);
  const deck = shuffle(buildDeck52(), rng);
  const hands: Card[][] = Array.from({ length: players }, () => []);
  deck.forEach((card, i) => hands[(config.dealer + 1 + i) % players]!.push(card));
  const opener = hands.findIndex((h) => h.some((c) => c.rank === '7' && c.suit === 'H'));
  return {
    phase: 'playing',
    players,
    roundNumber: config.roundNumber,
    dealer: config.dealer,
    hands,
    layout: EMPTY_LAYOUT(),
    turn: opener,
    lastMove: null,
    totals: [...config.totals],
    roundResult: null,
    seed: config.seed,
  };
}

export function actingSeat(state: BadamState): number | null {
  return state.phase === 'playing' ? state.turn : null;
}

/** Is this card playable on the current layout? */
export function isPlayable(state: BadamState, card: Card): boolean {
  const v = RANK_VALUE[card.rank];
  const row = state.layout[card.suit];
  const nothingOpened = Object.values(state.layout).every((r) => r.low === null);
  if (nothingOpened) {
    // The very first card of a round must be the 7 of Hearts.
    return card.rank === '7' && card.suit === 'H';
  }
  if (row.low === null || row.high === null) return v === 7; // open a new suit with its 7
  return v === row.high + 1 || v === row.low - 1;
}

export function playableCards(state: BadamState, seat: number): Card[] {
  return state.hands[seat]!.filter((c) => isPlayable(state, c));
}

/** You must play if you can; passing is only legal with no playable card. */
export function legalActions(state: BadamState, seat: number): BadamAction[] {
  switch (state.phase) {
    case 'playing': {
      if (state.turn !== seat) return [];
      const plays = playableCards(state, seat);
      if (plays.length === 0) return [{ type: 'pass', seat }];
      return plays.map((card) => ({ type: 'playCard', seat, card }));
    }
    case 'roundOver':
      return [
        { type: 'nextRound', seat },
        { type: 'endMatch', seat },
      ];
    case 'matchOver':
      return [];
  }
}

export function applyAction(state: BadamState, action: BadamAction): BadamState {
  const s = cloneState(state);
  switch (action.type) {
    case 'playCard':
      applyPlayCard(s, action.seat, action.card);
      break;
    case 'pass':
      applyPass(s, action.seat);
      break;
    case 'nextRound':
      return applyNextRound(s);
    case 'endMatch':
      applyEndMatch(s);
      break;
  }
  return s;
}

function fail(message: string): never {
  throw new BadamError(message);
}

function applyPlayCard(s: BadamState, seat: number, card: Card): void {
  if (s.phase !== 'playing') fail('not in the playing phase');
  if (s.turn !== seat) fail('not your turn');
  const hand = s.hands[seat]!;
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) fail('card not in hand');
  if (!isPlayable(s, card)) fail('that card does not fit the layout');

  hand.splice(idx, 1);
  const v = RANK_VALUE[card.rank];
  const row = s.layout[card.suit];
  if (row.low === null || row.high === null) {
    row.low = v;
    row.high = v;
  } else if (v === row.high + 1) {
    row.high = v;
  } else {
    row.low = v;
  }
  s.lastMove = { seat, card };

  if (hand.length === 0) {
    // First one out wins; everyone else eats their remaining cards.
    const cardsLeft = s.hands.map((h) => h.length);
    const totalsAfter = s.totals.map((t, i) => t + cardsLeft[i]!);
    s.totals = totalsAfter;
    s.roundResult = { winner: seat, cardsLeft, totalsAfter };
    s.phase = 'roundOver';
    s.turn = null;
    return;
  }
  s.turn = nextSeat(seat, s.players);
}

function applyPass(s: BadamState, seat: number): void {
  if (s.phase !== 'playing') fail('not in the playing phase');
  if (s.turn !== seat) fail('not your turn');
  if (playableCards(s, seat).length > 0) {
    fail('you have a playable card — you must play it');
  }
  s.lastMove = { seat, card: null };
  s.turn = nextSeat(seat, s.players);
}

function applyNextRound(s: BadamState): BadamState {
  if (s.phase !== 'roundOver') fail('the round is not over');
  return initRound({
    players: s.players,
    dealer: nextSeat(s.dealer, s.players),
    totals: s.totals,
    seed: s.seed,
    roundNumber: s.roundNumber + 1,
  });
}

/** The host may stop the match at any point; totals stand as they are. */
function applyEndMatch(s: BadamState): void {
  if (s.phase === 'matchOver') fail('the match is already over');
  s.phase = 'matchOver';
  s.turn = null;
}

function cloneState(state: BadamState): BadamState {
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as BadamState);
}
