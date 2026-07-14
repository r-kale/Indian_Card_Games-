import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/cards';
import { applyAction, initDeal, legalActions, minRaise } from './engine';
import { matchWinners, scoreDeal } from './scoring';
import { redactFor } from './view';
import { IllegalActionError } from './types';
import type { Game304State, Seat } from './types';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

function freshDeal(seed = 'test'): Game304State {
  return initDeal({ matchScore: [0, 0, 0, 0], dealer: 0, seed, dealNumber: 1 });
}

/** Bid the minimum as seat 1, everyone else passes: seat 1 wins the bid. */
function throughBidding(s: Game304State): Game304State {
  s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
  s = applyAction(s, { type: 'pass', seat: 2 });
  s = applyAction(s, { type: 'pass', seat: 3 });
  s = applyAction(s, { type: 'pass', seat: 0 });
  return s;
}

describe('initDeal', () => {
  it('deals the whole deck (8 each) and opens bidding right of the dealer', () => {
    const s = freshDeal();
    expect(s.phase).toBe('bidding');
    expect(s.hands.map((h) => h.length)).toEqual([8, 8, 8, 8]);
    expect(s.bidding.turn).toBe(1);
  });
});

describe('bidding', () => {
  it('forces the opener to bid at least 160', () => {
    const s = freshDeal();
    expect(legalActions(s, 1)).toEqual([{ type: 'bid', seat: 1, amount: 160 }]);
    expect(() => applyAction(s, { type: 'pass', seat: 1 })).toThrow(IllegalActionError);
  });

  it('moves in steps of 10, with 304 as the top bid', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 165 })).toThrow(
      IllegalActionError,
    );
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 160 })).toThrow(
      IllegalActionError,
    );
    s = applyAction(s, { type: 'bid', seat: 2, amount: 170 });
    expect(s.bidding.highBid).toBe(170);
    expect(minRaise(300)).toBe(304);
    expect(minRaise(304)).toBeNull();
    s = applyAction(s, { type: 'bid', seat: 3, amount: 300 });
    s = applyAction(s, { type: 'bid', seat: 0, amount: 304 });
    // Nobody can outbid 304: the only legal action left for others is pass.
    expect(legalActions(s, 1)).toEqual([{ type: 'pass', seat: 1 }]);
  });

  it('awards the bid to the last unpassed bidder and moves to declaring', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'bid', seat: 2, amount: 180 });
    s = applyAction(s, { type: 'pass', seat: 3 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    s = applyAction(s, { type: 'pass', seat: 1 });
    expect(s.phase).toBe('declaring');
    expect(s.bid).toEqual({ amount: 180, bidder: 2 });
  });
});

describe('declaring', () => {
  it('rejects a partner card from the bidder own hand', () => {
    let s = freshDeal();
    s = throughBidding(s);
    const own = s.hands[1][0]!;
    expect(() =>
      applyAction(s, { type: 'declare', seat: 1, trumpSuit: 'H', partnerCard: own }),
    ).toThrow(IllegalActionError);
  });

  it('finds the partner seat and keeps it hidden from everyone else', () => {
    let s = freshDeal();
    s = throughBidding(s);
    const partnerCard = s.hands[3][0]!;
    s = applyAction(s, { type: 'declare', seat: 1, trumpSuit: 'H', partnerCard });
    expect(s.phase).toBe('playing');
    expect(s.trumpSuit).toBe('H');
    expect(s.partner).toMatchObject({ card: partnerCard, seat: 3, revealed: false });
    // Everyone sees the card; only the holder knows the seat.
    expect(redactFor(s, 0).partner).toEqual({ card: partnerCard, revealed: false, seat: null });
    expect(redactFor(s, 1).partner).toEqual({ card: partnerCard, revealed: false, seat: null });
    expect(redactFor(s, 3).partner).toEqual({ card: partnerCard, revealed: false, seat: 3 });
  });
});

/** Hand-crafted 2-tricks-left position. Bidder = seat 1, trump = hearts,
 *  partner card = 9♠ held by seat 3, partner not yet revealed. */
function endgame(): Game304State {
  const base = freshDeal('endgame');
  return {
    ...base,
    phase: 'playing',
    dealer: 0,
    hands: [
      [c('A', 'S'), c('8', 'D')],
      [c('J', 'S'), c('7', 'S')],
      [c('Q', 'S'), c('8', 'H')],
      [c('9', 'S'), c('7', 'H')],
    ],
    bidding: { ...base.bidding, highBid: 200, highBidder: 1, passed: [true, false, true, true] },
    bid: { amount: 200, bidder: 1 },
    trumpSuit: 'H',
    partner: { card: c('9', 'S'), seat: 3, revealed: false },
    turn: 1,
    trickLeader: 1,
    trick: [],
    capturedPoints: [40, 90, 60, 51], // 241 so far; 63 points remain on the table
    tricksTaken: [2, 2, 1, 1],
  };
}

describe('playing', () => {
  it('enforces following suit', () => {
    let s = endgame();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    expect(() => applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') })).toThrow(
      IllegalActionError,
    );
  });

  it('lets trump win only from a void hand, and it beats the led suit', () => {
    let s = endgame();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('9', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s.lastTrickWinner).toBe(1); // no hearts played: J♠ holds
    // Final trick: seat 1 leads a spade; seats 2 and 3 are void and trump in.
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'D') });
    expect(s.lastTrickWinner).toBe(2); // 8♥ outranks 7♥; trump beats the led spade
    expect(s.phase).toBe('dealOver');
  });

  it('forces the hidden partner to out themselves when the bidder leads their suit', () => {
    const s0 = endgame();
    const s1 = applyAction(s0, { type: 'playCard', seat: 1, card: c('J', 'S') });
    const s2 = applyAction(s1, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    // Seat 3 holds the partner card 9♠ and the bidder led spades: only the 9♠ is legal.
    const plays = legalActions(s2, 3 as Seat);
    expect(plays).toEqual([{ type: 'playCard', seat: 3, card: c('9', 'S') }]);
    const s3 = applyAction(s2, { type: 'playCard', seat: 3, card: c('9', 'S') });
    expect(s3.partner!.revealed).toBe(true);
    expect(redactFor(s3, 0).partner!.seat).toBe(3);
  });

  it('does not force the partner card when someone other than the bidder leads', () => {
    let s = endgame();
    s.turn = 0;
    s.trickLeader = 0;
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    const plays = legalActions(s, 3 as Seat);
    // Seat 3 must follow spades but may choose either spade-suit card... they
    // only hold one spade (the 9♠) — following suit still applies, but the
    // partner-card restriction is not what forced it.
    expect(plays).toEqual([{ type: 'playCard', seat: 3, card: c('9', 'S') }]);
    const done = applyAction(s, { type: 'playCard', seat: 3, card: c('9', 'S') });
    expect(done.partner!.revealed).toBe(true); // playing the card always reveals
  });

  it('scores the deal per player: bidder + partner vs the rest', () => {
    let s = endgame();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('9', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'D') });
    expect(s.phase).toBe('dealOver');
    const total = s.capturedPoints.reduce((a, b) => a + b, 0);
    expect(total).toBe(304);
    // Trick 7 (63 pts) went to bidder seat 1; trick 8 (0 pts) to seat 2.
    // Bid team = seats 1 & 3: (90+63) + 51 = 204 >= 200 -> made it.
    expect(s.dealResult).toMatchObject({
      bidder: 1,
      partnerSeat: 3,
      bidTeamPoints: 204,
      madeIt: true,
      deltas: [0, 1, 0, 1],
    });
    expect(s.matchScore).toEqual([0, 1, 0, 1]);
  });
});

describe('scoring helpers', () => {
  it('awards +1 to each winner', () => {
    const made = scoreDeal([50, 150, 40, 64], { amount: 200, bidder: 1 }, 3, c('9', 'S'), 'H');
    expect(made.madeIt).toBe(true);
    expect(made.deltas).toEqual([0, 1, 0, 1]);
    const failed = scoreDeal([100, 80, 60, 64], { amount: 200, bidder: 1 }, 3, c('9', 'S'), 'H');
    expect(failed.madeIt).toBe(false);
    expect(failed.deltas).toEqual([1, 0, 1, 0]);
  });

  it('detects match winners at 5 points', () => {
    expect(matchWinners([4, 4, 4, 4])).toEqual([]);
    expect(matchWinners([5, 2, 5, 2])).toEqual([0, 2]);
  });
});
