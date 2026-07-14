import { describe, expect, it } from 'vitest';
import { buildDeck32, cardKey, cardPoints, RANK_ORDER_304, sortHand } from './cards';
import { makeRng, shuffle } from './rng';

describe('deck', () => {
  it('has 32 unique cards', () => {
    const deck = buildDeck32();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(cardKey)).size).toBe(32);
  });

  it('totals exactly 304 points', () => {
    const total = buildDeck32().reduce((sum, c) => sum + cardPoints(c), 0);
    expect(total).toBe(304);
  });

  it('ranks J highest and 7 lowest', () => {
    expect(RANK_ORDER_304[0]).toBe('J');
    expect(RANK_ORDER_304[7]).toBe('7');
  });
});

describe('rng', () => {
  it('shuffles deterministically for a given seed', () => {
    const deck = buildDeck32();
    const a = shuffle(deck, makeRng('seed-1'));
    const b = shuffle(deck, makeRng('seed-1'));
    const c = shuffle(deck, makeRng('seed-2'));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a.map(cardKey)).size).toBe(32);
  });
});

describe('sortHand', () => {
  it('groups by suit with stronger cards first', () => {
    const sorted = sortHand([
      { rank: '7', suit: 'S' },
      { rank: 'J', suit: 'S' },
      { rank: 'A', suit: 'H' },
      { rank: '9', suit: 'H' },
    ]);
    expect(sorted.map(cardKey)).toEqual(['JS', '7S', '9H', 'AH']);
  });
});
