import { describe, expect, it } from 'vitest';
import type { Card } from './cards';
import { RANK_ORDER_304 } from './cards';
import { beatsCurrentTrick, legalFollows, trickWinner } from './tricks';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('legalFollows', () => {
  it('must follow the led suit when possible', () => {
    const hand = [c('J', 'S'), c('7', 'S'), c('A', 'H')];
    const legal = legalFollows(hand, [{ seat: 0, card: c('9', 'S') }]);
    expect(legal).toEqual([c('J', 'S'), c('7', 'S')]);
  });

  it('allows any card when void in the led suit', () => {
    const hand = [c('A', 'H'), c('7', 'D')];
    const legal = legalFollows(hand, [{ seat: 0, card: c('9', 'S') }]);
    expect(legal).toEqual(hand);
  });

  it('allows any card when leading', () => {
    const hand = [c('A', 'H'), c('7', 'D')];
    expect(legalFollows(hand, [])).toEqual(hand);
  });
});

describe('trickWinner', () => {
  it('gives the trick to the highest card of the led suit without trump', () => {
    const winner = trickWinner(
      [
        { seat: 0, card: c('A', 'S') },
        { seat: 1, card: c('9', 'S') },
        { seat: 2, card: c('J', 'H') }, // off-suit J is worthless without trump
        { seat: 3, card: c('J', 'S') },
      ],
      RANK_ORDER_304,
      null,
    );
    expect(winner).toBe(3);
  });

  it('lets any trump beat the led suit, highest trump winning', () => {
    const winner = trickWinner(
      [
        { seat: 0, card: c('J', 'S') },
        { seat: 1, card: c('7', 'H') },
        { seat: 2, card: c('9', 'H') },
        { seat: 3, card: c('A', 'S') },
      ],
      RANK_ORDER_304,
      'H',
    );
    expect(winner).toBe(2);
  });

  it('ranks 9 above A and 10 within a suit (304 order)', () => {
    const winner = trickWinner(
      [
        { seat: 0, card: c('A', 'D') },
        { seat: 1, card: c('10', 'D') },
        { seat: 2, card: c('9', 'D') },
        { seat: 3, card: c('K', 'D') },
      ],
      RANK_ORDER_304,
      null,
    );
    expect(winner).toBe(2);
  });
});

describe('beatsCurrentTrick', () => {
  it('recognises a winning follow', () => {
    const trick = [{ seat: 0, card: c('A', 'S') }];
    expect(beatsCurrentTrick(c('9', 'S'), trick, RANK_ORDER_304, null)).toBe(true);
    expect(beatsCurrentTrick(c('K', 'S'), trick, RANK_ORDER_304, null)).toBe(false);
    expect(beatsCurrentTrick(c('J', 'H'), trick, RANK_ORDER_304, 'H')).toBe(true);
    expect(beatsCurrentTrick(c('J', 'H'), trick, RANK_ORDER_304, null)).toBe(false);
  });
});
