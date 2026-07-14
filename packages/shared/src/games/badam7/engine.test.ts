import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/cards';
import { actingSeat, applyAction, initRound, isPlayable, legalActions } from './engine';
import { BadamError, matchWinners } from './types';
import type { BadamState } from './types';
import { redactFor } from './view';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

function fresh(players = 4, seed = 'test'): BadamState {
  return initRound({
    players,
    dealer: 0,
    totals: Array.from({ length: players }, () => 0),
    seed,
    roundNumber: 1,
  });
}

/** A hand-built position: layout open as given, current player holding `hand`. */
function position(
  layout: Partial<Record<Card['suit'], { low: number; high: number }>>,
  hand: Card[],
  turn = 0,
): BadamState {
  const s = fresh();
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const row = layout[suit];
    s.layout[suit] = row ? { low: row.low, high: row.high } : { low: null, high: null };
  }
  s.hands[turn] = hand;
  s.turn = turn;
  return s;
}

describe('dealing', () => {
  it('deals the whole pack for 3-8 players; hands differ by at most one card', () => {
    for (let players = 3; players <= 8; players++) {
      const s = fresh(players, `deal-${players}`);
      const sizes = s.hands.map((h) => h.length);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(52);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
    expect(() => fresh(2)).toThrow(BadamError);
    expect(() => fresh(9)).toThrow(BadamError);
  });

  it('puts the 7 of Hearts holder on the clock', () => {
    const s = fresh();
    const holder = s.hands.findIndex((h) => h.some((x) => x.rank === '7' && x.suit === 'H'));
    expect(actingSeat(s)).toBe(holder);
  });
});

describe('legality', () => {
  it('the very first card of a round must be the 7 of Hearts', () => {
    const s = fresh();
    const opener = s.turn!;
    const legal = legalActions(s, opener);
    expect(legal).toEqual([{ type: 'playCard', seat: opener, card: c('7', 'H') }]);
    expect(isPlayable(s, c('7', 'S'))).toBe(false);
  });

  it('after that: any 7 opens its suit; open suits extend one step up or down', () => {
    const s = position({ H: { low: 7, high: 7 } }, [
      c('7', 'C'), // fresh 7: playable
      c('8', 'H'), // high + 1: playable
      c('6', 'H'), // low - 1: playable
      c('9', 'H'), // two above: blocked
      c('8', 'C'), // suit not open: blocked
      c('A', 'S'), // suit not open: blocked
    ]);
    const playable = legalActions(s, 0).map((a) =>
      a.type === 'playCard' ? `${a.card.rank}${a.card.suit}` : a.type,
    );
    expect(playable.sort()).toEqual(['6H', '7C', '8H'].sort());
  });

  it('runs stop at the King and the Ace', () => {
    const s = position({ S: { low: 1, high: 13 } }, [c('K', 'S'), c('A', 'S')]);
    expect(legalActions(s, 0)).toEqual([{ type: 'pass', seat: 0 }]);
  });

  it('you must play when you can — passing with a playable card is illegal', () => {
    const s = position({ H: { low: 7, high: 7 } }, [c('8', 'H'), c('2', 'C')]);
    expect(() => applyAction(s, { type: 'pass', seat: 0 })).toThrow(BadamError);
    const stuck = position({ H: { low: 7, high: 7 } }, [c('2', 'C'), c('K', 'D')]);
    const after = applyAction(stuck, { type: 'pass', seat: 0 });
    expect(after.turn).toBe(1);
    expect(after.lastMove).toEqual({ seat: 0, card: null });
  });

  it('playing extends the layout and moves the turn on', () => {
    const s = position({ H: { low: 7, high: 7 } }, [c('8', 'H'), c('9', 'H')]);
    const after = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'H') });
    expect(after.layout.H).toEqual({ low: 7, high: 8 });
    expect(after.hands[0]).toHaveLength(1);
    expect(after.turn).toBe(1);
  });
});

describe('round and match', () => {
  it('first player to empty their hand wins; others eat their cards as penalty', () => {
    const s = position({ H: { low: 7, high: 7 } }, [c('8', 'H')]);
    s.hands[1] = [c('2', 'C'), c('3', 'C')];
    s.hands[2] = [c('K', 'D')];
    s.hands[3] = [c('A', 'S'), c('2', 'S'), c('3', 'S')];
    const after = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'H') });
    expect(after.phase).toBe('roundOver');
    expect(after.roundResult).toEqual({
      winner: 0,
      cardsLeft: [0, 2, 1, 3],
      totalsAfter: [0, 2, 1, 3],
    });
    expect(after.totals).toEqual([0, 2, 1, 3]);
  });

  it('nextRound rotates the dealer and carries the totals', () => {
    const s = position({ H: { low: 7, high: 7 } }, [c('8', 'H')]);
    s.hands[1] = [c('2', 'C')];
    s.hands[2] = [c('K', 'D')];
    s.hands[3] = [c('A', 'S')];
    const over = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'H') });
    const next = applyAction(over, { type: 'nextRound', seat: 0 });
    expect(next.roundNumber).toBe(2);
    expect(next.dealer).toBe(1);
    expect(next.totals).toEqual(over.totals);
    expect(next.phase).toBe('playing');
    expect(next.hands.flat()).toHaveLength(52);
  });

  it('the host can end the match at any point; lowest total wins', () => {
    const s = fresh();
    s.totals = [3, 0, 7, 0];
    const ended = applyAction(s, { type: 'endMatch', seat: 0 });
    expect(ended.phase).toBe('matchOver');
    expect(actingSeat(ended)).toBeNull();
    expect(matchWinners(ended.totals)).toEqual([1, 3]);
    expect(() => applyAction(ended, { type: 'endMatch', seat: 0 })).toThrow(BadamError);
  });
});

describe('views', () => {
  it('hides other hands but shows counts, layout and totals to everyone', () => {
    const s = fresh(5, 'view');
    const v = redactFor(s, 2);
    expect(v.hand.length).toBe(s.hands[2]!.length);
    expect(v.handCounts).toEqual(s.hands.map((h) => h.length));
    expect(v.players).toBe(5);
    const blind = redactFor(s, null);
    expect(blind.hand).toEqual([]);
    expect(blind.legalActions).toEqual([]);
  });
});
