import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/cards';
import { actingSeat, applyAction, initDeal, legalActions, minRaise } from './engine';
import { matchLeaders, matchWinners, scoreDeal } from './scoring';
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

  it('raises go +10 or +15 (multiples of 5), with 304 as the top bid', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 165 })).toThrow(
      IllegalActionError, // must raise by at least 10
    );
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 160 })).toThrow(
      IllegalActionError,
    );
    expect(() => applyAction(s, { type: 'bid', seat: 2, amount: 172 })).toThrow(
      IllegalActionError, // not a multiple of 5
    );
    s = applyAction(s, { type: 'bid', seat: 2, amount: 175 }); // a +15 raise
    expect(s.bidding.highBid).toBe(175);
    expect(minRaise(175)).toBe(185);
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
    expect(s.turn).toBe(1); // the bid winner leads the first trick
    expect(s.trickLeader).toBe(1);
    expect(s.trumpSuit).toBe('H');
    expect(s.partner).toMatchObject({ card: partnerCard, seat: 3, status: 'hidden' });
    // Everyone sees the card; only the holder knows the seat.
    expect(redactFor(s, 0).partner).toEqual({ card: partnerCard, status: 'hidden', seat: null });
    expect(redactFor(s, 1).partner).toEqual({ card: partnerCard, status: 'hidden', seat: null });
    expect(redactFor(s, 3).partner).toEqual({ card: partnerCard, status: 'hidden', seat: 3 });
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
    partner: { card: c('9', 'S'), seat: 3, status: 'hidden' },
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
    // Card on the table: everyone now knows the holder, but the alliance is
    // only decided when the trick ends.
    expect(s3.partner!.status).toBe('played');
    expect(redactFor(s3, 0).partner!.seat).toBe(3);
    const s4 = applyAction(s3, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s4.lastTrickWinner).toBe(1); // bidder's J♠ held the trick
    expect(s4.partner!.status).toBe('allied');
  });

  it('loses the partner when an opponent captures the partner-card trick', () => {
    let s = endgame();
    // Seat 2 is void in spades and holds trump: they will steal the trick.
    s.hands = [
      [c('A', 'S'), c('8', 'D')],
      [c('J', 'S'), c('7', 'S')],
      [c('8', 'H'), c('7', 'D')],
      [c('9', 'S'), c('7', 'H')],
    ];
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('J', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') }); // trumps in
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('9', 'S') }); // forced partner card
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s.lastTrickWinner).toBe(2); // trump captured the partner-card trick
    expect(s.partner!.status).toBe('lone');
    // Play out the last trick and score: the bidder is alone on 90 < 200.
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('7', 'D') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'D') });
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    expect(s.phase).toBe('dealOver');
    expect(s.dealResult).toMatchObject({
      alliance: 'lone',
      bidTeamPoints: 90,
      madeIt: false,
      deltas: [1, -2, 1, 1], // ex-partner wins with the three; the lone bidder pays -2
    });
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
    // The 9♠ itself won the trick (9 outranks A): the partner card winning
    // counts as the bidder's side, so the alliance forms.
    expect(done.lastTrickWinner).toBe(3);
    expect(done.partner!.status).toBe('allied');
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
    // Trick 7 (63 pts) went to bidder seat 1; the LAST trick (0 pts) to
    // defender seat 2 — last-and-ten raises the target to 210.
    // Bid team = seats 1 & 3: (90+63) + 51 = 204 < 210 -> failed by the last trick!
    expect(s.dealResult).toMatchObject({
      bidder: 1,
      partnerSeat: 3,
      alliance: 'allied',
      bidTeamPoints: 204,
      lastTrickShift: 10,
      effectiveBid: 210,
      madeIt: false,
      deltas: [1, -1, 1, -1],
    });
    expect(s.matchScore).toEqual([1, -1, 1, -1]);
  });
});

describe('scoring helpers', () => {
  it('awards +1 to each winner when allied; a lost bid costs the bid team', () => {
    const made = scoreDeal(
      [50, 150, 40, 64],
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'allied',
      [],
      1, // bid side takes the last trick: target 200 - 10 = 190
    );
    expect(made.madeIt).toBe(true);
    expect(made.deltas).toEqual([0, 1, 0, 1]);
    const failed = scoreDeal(
      [100, 80, 60, 64],
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'allied',
      [],
      0, // defenders take the last trick: target 200 + 10 = 210
    );
    expect(failed.madeIt).toBe(false);
    expect(failed.deltas).toEqual([1, -1, 1, -1]); // defenders +1, bid team -1 each
  });

  it('pays a lone bidder +2 made / -2 failed, with +1 to each of the other three', () => {
    const made = scoreDeal(
      [40, 210, 30, 24],
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'lone',
      [],
      1,
    );
    expect(made).toMatchObject({ bidTeamPoints: 210, madeIt: true, deltas: [0, 2, 0, 0] });
    const failed = scoreDeal(
      [40, 190, 50, 24],
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'lone',
      [],
      0,
    );
    expect(failed).toMatchObject({ bidTeamPoints: 190, madeIt: false, deltas: [1, -2, 1, 1] });
  });

  it('marriages and the last trick shift the bid target', () => {
    // Bidder (1) holds the hukum marriage (-40); a defender (0) holds a plain
    // one (+20); the defenders take the last trick (+10): 200 -40 +20 +10 = 190.
    const r = scoreDeal(
      [40, 150, 60, 45], // bid side (1+3) captured 195 >= 190: made only via shifts
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'allied',
      [
        { seat: 1, suit: 'H' },
        { seat: 0, suit: 'S' },
      ],
      0,
    );
    expect(r.marriages).toEqual([
      { seat: 1, suit: 'H', shift: -40 },
      { seat: 0, suit: 'S', shift: 20 },
    ]);
    expect(r.lastTrickShift).toBe(10);
    expect(r.effectiveBid).toBe(190);
    expect(r.bidTeamPoints).toBe(195);
    expect(r.madeIt).toBe(true);
    // A lone bidder's ex-partner counts as a defender for the shifts.
    const lone = scoreDeal(
      [40, 190, 50, 24],
      { amount: 200, bidder: 1 },
      3,
      c('9', 'S'),
      'H',
      'lone',
      [{ seat: 3, suit: 'H' }], // ex-partner's hukum marriage now works AGAINST the bidder
      3,
    );
    expect(lone.marriages).toEqual([{ seat: 3, suit: 'H', shift: 40 }]);
    expect(lone.lastTrickShift).toBe(10);
    expect(lone.effectiveBid).toBe(250);
    expect(lone.madeIt).toBe(false);
  });

  it('detects marriages when the hukum is declared', () => {
    let s = freshDeal();
    s = applyAction(s, { type: 'bid', seat: 1, amount: 160 });
    s = applyAction(s, { type: 'pass', seat: 2 });
    s = applyAction(s, { type: 'pass', seat: 3 });
    s = applyAction(s, { type: 'pass', seat: 0 });
    // Plant a marriage: give seat 2 the K and Q of clubs.
    const kq = [c('K', 'C'), c('Q', 'C')];
    for (const card of kq) {
      const holder = s.hands.findIndex((h) => h.some((x) => x.rank === card.rank && x.suit === card.suit));
      const idx = s.hands[holder as Seat].findIndex((x) => x.rank === card.rank && x.suit === card.suit);
      const swap = s.hands[2].find((x) => !kq.some((k) => k.rank === x.rank && k.suit === x.suit))!;
      if (holder !== 2) {
        s.hands[holder as Seat][idx] = swap;
        s.hands[2][s.hands[2].indexOf(swap)] = card;
      }
    }
    const notMine = ((): Card => {
      for (const suit of ['S', 'H', 'D', 'C'] as const) {
        for (const rank of ['J', '9', 'A', '10'] as const) {
          const card = c(rank, suit);
          if (!s.hands[1].some((x) => x.rank === rank && x.suit === suit)) return card;
        }
      }
      throw new Error('unreachable');
    })();
    s = applyAction(s, { type: 'declare', seat: 1, trumpSuit: 'C', partnerCard: notMine });
    expect(s.marriages).toContainEqual({ seat: 2, suit: 'C' });
  });

  it('detects match winners at 5 points, and leaders for an early end', () => {
    expect(matchWinners([4, 4, 4, 4])).toEqual([]);
    expect(matchWinners([5, 2, 5, 2])).toEqual([0, 2]);
    expect(matchLeaders([5, 2, 5, 2])).toEqual([0, 2]);
    expect(matchLeaders([3, -1, 3, 0])).toEqual([0, 2]); // ended early: top score leads
  });

  it('the host can end the match at any point; the scores stand', () => {
    const s = freshDeal();
    const ended = applyAction(s, { type: 'endMatch', seat: 0 });
    expect(ended.phase).toBe('matchOver');
    expect(actingSeat(ended)).toBeNull();
    expect(() => applyAction(ended, { type: 'endMatch', seat: 0 })).toThrow(IllegalActionError);
  });
});
