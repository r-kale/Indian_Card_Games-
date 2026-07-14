import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/cards';
import { applyAction, initDeal, legalActions } from './engine';
import { scoreDeal, matchWinner } from './scoring';
import { IllegalActionError } from './types';
import type { Game304State, Seat } from './types';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

function freshDeal(seed = 'test'): Game304State {
  return initDeal({ matchScore: [0, 0], dealer: 0, seed, dealNumber: 1 });
}

describe('initDeal', () => {
  it('deals 4 cards each with 16 undealt and opens bidding right of the dealer', () => {
    const s = freshDeal();
    expect(s.phase).toBe('bidding');
    expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]);
    expect(s.undealt).toHaveLength(16);
    expect(s.bidding.turn).toBe(1);
  });
});

describe('bidding', () => {
  it('forces the opener to bid (no pass) at 160 minimum', () => {
    const s = freshDeal();
    const actions = legalActions(s, 1);
    expect(actions).toEqual([{ type: 'bid', seat: 1, amount: 160 }]);
    expect(() => applyAction(s, { type: 'pass', seat: 1 })).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'bid', seat: 1, amount: 150 })).toThrow(IllegalActionError);
  });

  it('rejects bids out of turn', () => {
    const s = freshDeal();
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 200 })).toThrow(IllegalActionError);
  });

  it('awards the bid to the last unpassed bidder', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'bid', seat: 2, amount: 180 });
    s = applyAction(s, { type: 'pass', seat: 3 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    expect(s.phase).toBe('bidding');
    expect(s.bidding.turn).toBe(1);
    s = applyAction(s, { type: 'pass', seat: 1 });
    expect(s.phase).toBe('trumpSelection');
    expect(s.bid).toEqual({ amount: 180, bidder: 2 });
  });

  it('skips passed players when the bidding goes around again', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'pass', seat: 2 });
    s = applyAction(s, { type: 'bid', seat: 3, amount: 170 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    expect(s.bidding.turn).toBe(1); // seat 2 already passed
    s = applyAction(s, { type: 'bid', seat: 1, amount: 200 });
    expect(s.bidding.turn).toBe(3);
    s = applyAction(s, { type: 'pass', seat: 3 });
    expect(s.phase).toBe('trumpSelection');
    expect(s.bid).toEqual({ amount: 200, bidder: 1 });
  });
});

describe('trump selection', () => {
  it('conceals the chosen card and deals the rest of the deck', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'pass', seat: 2 });
    s = applyAction(s, { type: 'pass', seat: 3 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    const trumpCard = s.hands[1][0]!;
    s = applyAction(s, { type: 'selectTrump', seat: 1, card: trumpCard });
    expect(s.phase).toBe('playing');
    expect(s.trump).toEqual({ suit: trumpCard.suit, card: trumpCard, revealed: false });
    expect(s.hands.map((h) => h.length)).toEqual([8, 7, 8, 8]); // bidder is one short
    expect(s.undealt).toHaveLength(0);
    expect(s.turn).toBe(1);
  });

  it('rejects a trump card that is not in the bidder hand', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'pass', seat: 2 });
    s = applyAction(s, { type: 'pass', seat: 3 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    const notMine = s.hands[2][0]!;
    if (!s.hands[1].some((x) => x.rank === notMine.rank && x.suit === notMine.suit)) {
      expect(() => applyAction(s, { type: 'selectTrump', seat: 1, card: notMine })).toThrow(
        IllegalActionError,
      );
    }
  });
});

/** Hand-crafted end-of-deal position: bidder (seat 1) holds one card plus the concealed trump. */
function endgameState(): Game304State {
  const base = freshDeal('endgame');
  return {
    ...base,
    phase: 'playing',
    dealer: 0,
    hands: [
      [c('A', 'S'), c('8', 'D')],
      [c('J', 'S')],
      [c('Q', 'S'), c('8', 'H')],
      [c('K', 'S'), c('7', 'H')],
    ],
    undealt: [],
    bid: { amount: 160, bidder: 1 },
    trump: { suit: 'H', card: c('9', 'H'), revealed: false },
    turn: 1,
    trickLeader: 1,
    trick: [],
    capturedPoints: [120, 118], // 238 points already captured; 66 remain on the table
    tricksTaken: [3, 3],
  };
}

describe('playing', () => {
  it('enforces following suit', () => {
    let s = endgameState();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    // Seat 2 holds a spade, so throwing the heart is illegal.
    expect(() => applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') })).toThrow(
      IllegalActionError,
    );
  });

  it('gives a concealed trump no power', () => {
    let s = endgameState();
    // Move the 8H from seat 2's hand into a fresh trick where hearts are "secret trump".
    s.turn = 2;
    s.trickLeader = 2;
    s.hands = [[c('A', 'S')], [c('J', 'S')], [c('8', 'H')], [c('7', 'H')]];
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    // Seats 0 and 1 are void in hearts; they may play anything.
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    // Hearts led; concealed trump means highest heart (the 8) wins, not the off-suit J.
    expect(s.lastTrickWinner).toBe(2);
  });

  it('auto-reveals the trump when the bidder hand runs dry, then finishes the deal', () => {
    let s = endgameState();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    // Bidder's hand emptied: the concealed 9H must have come back, revealed.
    expect(s.trump!.revealed).toBe(true);
    expect(s.hands[1]).toEqual([c('9', 'H')]);
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('K', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s.lastTrickWinner).toBe(1); // J of the led suit wins: 46 points to team 1
    // Final trick: bidder leads the returned trump.
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('9', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'D') });
    expect(s.phase).toBe('dealOver');
    expect(s.capturedPoints[0] + s.capturedPoints[1]).toBe(304);
    // Team 1 captured 118 + 46 + 20 = 184 >= 160: bid made, +1 match point.
    expect(s.dealResult!.madeIt).toBe(true);
    expect(s.matchScore).toEqual([0, 1]);
  });

  it('lets a void player demand the trump reveal and then forces them to trump', () => {
    let s = endgameState();
    s.hands = [
      [c('A', 'S'), c('8', 'D')],
      [c('J', 'S')],
      [c('8', 'H'), c('Q', 'S')],
      [c('K', 'S'), c('7', 'H')],
    ];
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    expect(s.trump!.revealed).toBe(true); // auto-reveal (bidder emptied their hand)

    // Rebuild with a bidder that still has cards so a manual reveal is possible.
    s = endgameState();
    s.hands = [
      [c('8', 'D'), c('A', 'S')],
      [c('J', 'S'), c('7', 'D')],
      [c('8', 'H'), c('Q', 'S')],
      [c('K', 'S'), c('7', 'H')],
    ];
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'D') });
    // Seat 2 is void in diamonds: revealing trump is on the menu.
    const options = legalActions(s, 2 as Seat);
    expect(options.some((a) => a.type === 'revealTrump')).toBe(true);
    s = applyAction(s, { type: 'revealTrump', seat: 2 });
    expect(s.trump!.revealed).toBe(true);
    expect(s.hands[1]).toContainEqual(c('9', 'H')); // returned to the bidder
    // Having asked, seat 2 must play its heart (trump), not the spade.
    const plays = legalActions(s, 2 as Seat).filter((a) => a.type === 'playCard');
    expect(plays).toEqual([{ type: 'playCard', seat: 2, card: c('8', 'H') }]);
  });
});

describe('scoring', () => {
  it('scores made and failed bids', () => {
    expect(scoreDeal([100, 204], { amount: 200, bidder: 1 })).toMatchObject({
      madeIt: true,
      deltas: [0, 1],
    });
    expect(scoreDeal([150, 154], { amount: 200, bidder: 1 })).toMatchObject({
      madeIt: false,
      deltas: [2, 0],
    });
    expect(scoreDeal([250, 54], { amount: 250, bidder: 0 })).toMatchObject({
      madeIt: true,
      deltas: [2, 0],
    });
  });

  it('detects the match winner at 6 points', () => {
    expect(matchWinner([5, 5])).toBeNull();
    expect(matchWinner([6, 3])).toBe(0);
    expect(matchWinner([2, 7])).toBe(1);
  });
});
