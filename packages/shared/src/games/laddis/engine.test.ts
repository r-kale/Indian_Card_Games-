import { describe, expect, it } from 'vitest';
import type { Card } from '../../core/cards';
import { actingSeat, applyAction, initRound, legalActions } from './engine';
import { formatKalyas, scoreRound } from './scoring';
import { LaddisError } from './types';
import type { LaddisState, Seat } from './types';
import { redactFor } from './view';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

function fresh(seed = 'test'): LaddisState {
  // Team 0 shuffles (dealer seat 0) with a 10-kalya deficit.
  return initRound({ deficit: 10, shufflingTeam: 0, dealer: 0, seed, roundNumber: 1 });
}

/** All four players pass the vakhaai window. */
function passVakhaai(s: LaddisState): LaddisState {
  for (let i = 0; i < 4; i++) {
    s = applyAction(s, { type: 'passVakhaai', seat: actingSeat(s)! });
  }
  return s;
}

describe('round flow', () => {
  it('deals 4 cards and opens the vakhaai window right of the dealer', () => {
    const s = fresh();
    expect(s.phase).toBe('vakhaai');
    expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]);
    expect(s.undealt).toHaveLength(16);
    expect(s.window.turn).toBe(1);
  });

  it('walks the vakhaai window in turn order, then the non-shuffling neighbour declares', () => {
    let s = fresh();
    expect(actingSeat(s)).toBe(1);
    s = applyAction(s, { type: 'passVakhaai', seat: 1 });
    expect(actingSeat(s)).toBe(2);
    s = applyAction(s, { type: 'passVakhaai', seat: 2 });
    s = applyAction(s, { type: 'passVakhaai', seat: 3 });
    s = applyAction(s, { type: 'passVakhaai', seat: 0 });
    expect(s.phase).toBe('declaring');
    expect(actingSeat(s)).toBe(1); // non-shuffling (team 1) seat right of dealer 0
  });

  it('hukum declaration deals the rest and opens the six-call window: non-shufflers first, then shufflers', () => {
    let s = fresh();
    s = passVakhaai(s);
    s = applyAction(s, { type: 'declareHukum', seat: 1, suit: 'H' });
    expect(s.hands.map((h) => h.length)).toEqual([8, 8, 8, 8]);
    expect(s.phase).toBe('sixCall');
    expect(s.window.turn).toBe(1); // non-shuffling side first
    s = applyAction(s, { type: 'passSix', seat: 1 });
    expect(s.window.turn).toBe(3);
    s = applyAction(s, { type: 'passSix', seat: 3 });
    expect(s.window.turn).toBe(2); // then the shuffling side gets its chance
    s = applyAction(s, { type: 'passSix', seat: 2 });
    expect(s.window.turn).toBe(0);
    s = applyAction(s, { type: 'passSix', seat: 0 });
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe(1); // right of dealer leads
  });

  it('a six-caller discards the declared hukum, sets their own and leads', () => {
    let s = fresh();
    s = passVakhaai(s);
    s = applyAction(s, { type: 'declareHukum', seat: 1, suit: 'H' });
    s = applyAction(s, { type: 'passSix', seat: 1 });
    s = applyAction(s, { type: 'passSix', seat: 3 });
    s = applyAction(s, { type: 'callSix', seat: 2 }); // shuffling side may call too
    expect(s.mode).toBe('six');
    expect(s.six).toEqual({ caller: 2 });
    // The old hukum is gone; the caller now declares their own.
    expect(s.phase).toBe('declaring');
    expect(s.hukum).toBeNull();
    expect(actingSeat(s)).toBe(2);
    expect(() => applyAction(s, { type: 'declareHukum', seat: 1, suit: 'S' })).toThrow(
      LaddisError, // only the six-caller declares now
    );
    s = applyAction(s, { type: 'declareHukum', seat: 2, suit: 'S' });
    expect(s.hukum).toMatchObject({ suit: 'S', declarer: 2, revealed: false });
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe(2); // the six-caller leads the first hand
    expect(s.trickLeader).toBe(2);
  });

  it('a vakhaai locks the round: only the 4 dealt cards, no trumps, caller leads', () => {
    let s = fresh();
    s = applyAction(s, { type: 'passVakhaai', seat: 1 });
    s = applyAction(s, { type: 'vakhaai', seat: 2, bet: 16 });
    expect(s.mode).toBe('vakhaai');
    expect(s.vakhaai).toEqual({ caller: 2, bet: 16 });
    expect(s.hukum).toBeNull(); // no trumps at all
    expect(s.phase).toBe('playing');
    expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]); // second half never dealt
    expect(s.undealt).toHaveLength(0);
    expect(s.turn).toBe(2); // the caller leads
    // Nobody can call for a hukum in a vakhaai round.
    expect(legalActions(s, 2 as Seat).every((a) => a.type === 'playCard')).toBe(true);
  });

  it("vakhaai: the caller's partner's cards are dead and never win a hand", () => {
    let s = fresh();
    s = applyAction(s, { type: 'passVakhaai', seat: 1 });
    s = applyAction(s, { type: 'vakhaai', seat: 2, bet: 8 }); // caller 2, partner 0
    // One-trick showdown: the partner (seat 0) throws the highest card.
    s.hands = [[c('A', 'S')], [c('7', 'S')], [c('K', 'S')], [c('8', 'S')]];
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('K', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('8', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') }); // dead card
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    // The partner's ace is ignored: the caller's king takes the hand.
    expect(s.lastTrickWinner).toBe(2);
    expect(s.tricksTaken[0]).toBe(0);
  });

  it('rejects illegal vakhaai bets', () => {
    const s = fresh();
    expect(() => applyAction(s, { type: 'vakhaai', seat: 1, bet: 10 as never })).toThrow(
      LaddisError,
    );
  });
});

/** Craft a 2-tricks-left playing state. Hukum = hearts (hidden), declared by seat 1. */
function endgame(): LaddisState {
  const base = fresh('endgame');
  return {
    ...base,
    phase: 'playing',
    undealt: [],
    hands: [
      [c('A', 'S'), c('8', 'D')],
      [c('K', 'S'), c('7', 'S')],
      [c('Q', 'S'), c('8', 'H')],
      [c('J', 'S'), c('7', 'H')],
    ],
    window: { turn: null, passed: [true, true, true, true] },
    hukum: { suit: 'H', declarer: 1, revealed: false },
    turn: 1,
    trickLeader: 1,
    trick: [],
    tricksTaken: [2, 2, 1, 1],
  };
}

describe('playing', () => {
  it('uses standard ranking: ace beats king', () => {
    let s = endgame();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('K', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('J', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s.lastTrickWinner).toBe(0);
  });

  it('hidden hukum has no power; calling for it activates trump and forces the caller to play it', () => {
    let s = endgame();
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('K', 'S') });
    // Seat 2 holds a spade: calling for the hukum is not on offer.
    expect(legalActions(s, 2 as Seat).some((a) => a.type === 'callHukum')).toBe(false);
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('Q', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('J', 'S') });
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('A', 'S') });
    expect(s.lastTrickWinner).toBe(0); // hearts stayed powerless

    // Final trick: seat 0 leads a diamond; seat 1 is void and may call the hukum.
    s = applyAction(s, { type: 'playCard', seat: 0, card: c('8', 'D') });
    const options = legalActions(s, 1 as Seat);
    expect(options.some((a) => a.type === 'callHukum')).toBe(true);
    s = applyAction(s, { type: 'callHukum', seat: 1 });
    expect(s.hukum!.revealed).toBe(true);
    // Seat 1 holds no heart, so any card is playable; seat 2 must now beware.
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'S') });
    // Seat 2 called nothing but holds 8H: void in diamonds, free choice — play the trump.
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') });
    s = applyAction(s, { type: 'playCard', seat: 3, card: c('7', 'H') });
    expect(s.phase).toBe('roundOver');
    expect(s.lastTrickWinner).toBe(2); // 8♥ trumps the led diamond
  });

  it('a caller holding hukum cards must play one', () => {
    let s = endgame();
    // Give seat 3 a heart and make them void in the led suit.
    s.hands = [
      [c('A', 'S'), c('8', 'D')],
      [c('K', 'S'), c('7', 'D')],
      [c('Q', 'S'), c('8', 'H')],
      [c('7', 'H'), c('J', 'S')],
    ];
    s = applyAction(s, { type: 'playCard', seat: 1, card: c('7', 'D') });
    s = applyAction(s, { type: 'playCard', seat: 2, card: c('8', 'H') }); // void, throws a heart unknowingly
    // Seat 3 is void in diamonds and calls for the hukum.
    s = applyAction(s, { type: 'callHukum', seat: 3 });
    const plays = legalActions(s, 3 as Seat).filter((a) => a.type === 'playCard');
    expect(plays).toEqual([{ type: 'playCard', seat: 3, card: c('7', 'H') }]);
  });
});

describe('scoring the ledger', () => {
  const base = (): LaddisState => {
    const s = endgame();
    s.tricksTaken = [0, 0, 0, 0];
    return s;
  };

  it('normal round: shuffling team recovers 10 with 4 hands, pays 5 without', () => {
    let s = base();
    s.tricksTaken = [2, 3, 2, 1]; // team 0 (shuffling) has 4
    expect(scoreRound(s)).toMatchObject({ made: true, delta: -10, deficitAfter: 0, swapped: true });
    s = base();
    s.tricksTaken = [1, 3, 2, 2]; // team 0 has 3
    expect(scoreRound(s)).toMatchObject({ made: false, delta: 5, deficitAfter: 15 });
    // From 0-0: the hukum side missing its target starts shuffling at 10 down.
    const zero = base();
    zero.deficit = 0;
    zero.tricksTaken = [2, 2, 2, 2];
    expect(scoreRound(zero)).toMatchObject({
      delta: -10,
      deficitAfter: 10,
      shufflingTeamAfter: 1,
      swapped: true,
    });
  });

  it('erasing the deficit swaps the shuffling role with overshoot carried', () => {
    const s = base();
    s.deficit = 3;
    s.tricksTaken = [2, 2, 2, 2]; // shuffling team 0 reaches 4
    const r = scoreRound(s);
    expect(r).toMatchObject({ delta: -10, deficitAfter: 7, shufflingTeamAfter: 1, swapped: true });
  });

  it('six-hand call by the non-shuffling side: +6 made, -12 failed', () => {
    let s = base();
    s.mode = 'six';
    s.six = { caller: 1 };
    s.tricksTaken = [1, 3, 1, 3]; // callers (team 1) have 6
    expect(scoreRound(s)).toMatchObject({ made: true, delta: 6, deficitAfter: 16 });
    s = base();
    s.mode = 'six';
    s.six = { caller: 1 };
    s.tricksTaken = [2, 3, 1, 2]; // callers have 5
    const r = scoreRound(s);
    expect(r).toMatchObject({ made: false, delta: -12, deficitAfter: 2, swapped: true });
  });

  it('six-hand call by the shuffling side: -6 made, +6 failed', () => {
    let s = base();
    s.mode = 'six';
    s.six = { caller: 0 }; // team 0 is shuffling
    s.tricksTaken = [3, 1, 3, 1];
    expect(scoreRound(s)).toMatchObject({ made: true, delta: -6, deficitAfter: 4 });
    s = base();
    s.mode = 'six';
    s.six = { caller: 0 };
    s.tricksTaken = [3, 2, 2, 1]; // only 5
    expect(scoreRound(s)).toMatchObject({ made: false, delta: 6, deficitAfter: 16 });
  });

  it('vakhaai (4 tricks): the caller alone must take every hand; losses double', () => {
    let s = base();
    s.mode = 'vakhaai';
    s.vakhaai = { caller: 2, bet: 16 }; // caller on the shuffling team
    s.tricksTaken = [0, 0, 4, 0]; // all four hands
    expect(scoreRound(s)).toMatchObject({ made: true, delta: -16, deficitAfter: 6, swapped: true });
    s = base();
    s.mode = 'vakhaai';
    s.vakhaai = { caller: 2, bet: 16 };
    s.tricksTaken = [0, 1, 3, 0]; // an opponent escaped with one: vakhaai fails
    expect(scoreRound(s)).toMatchObject({ made: false, delta: 32, deficitAfter: 42 });
    s = base();
    s.mode = 'vakhaai';
    s.vakhaai = { caller: 1, bet: 8 }; // caller on the non-shuffling team
    s.tricksTaken = [0, 4, 0, 0];
    expect(scoreRound(s)).toMatchObject({ made: true, delta: 8, deficitAfter: 18 });
    s = base();
    s.mode = 'vakhaai';
    s.vakhaai = { caller: 1, bet: 8 };
    s.tricksTaken = [2, 3, 0, 0]; // opponents stole one — a fail (partner cards are dead)
    expect(scoreRound(s)).toMatchObject({ made: false, delta: -16, swapped: true, deficitAfter: 6 });
  });

  it('formats kalyas as plain numbers (no laddoo/ardha wording)', () => {
    expect(formatKalyas(0)).toBe('0 kalyas');
    expect(formatKalyas(1)).toBe('1 kalya');
    expect(formatKalyas(16)).toBe('16 kalyas');
    expect(formatKalyas(37)).toBe('37 kalyas');
  });

  it('a decided round can be ended early — but only once it is decided', () => {
    // Walk into a normal playing round.
    let s = fresh();
    s = passVakhaai(s);
    s = applyAction(s, { type: 'declareHukum', seat: 1, suit: 'H' });
    for (const seat of [1, 3, 2, 0] as const) {
      s = applyAction(s, { type: 'passSix', seat });
    }
    expect(s.phase).toBe('playing');
    // Nothing decided yet: ending is illegal and not offered.
    expect(legalActions(s, 0).some((a) => a.type === 'endRound')).toBe(false);
    expect(() => applyAction(s, { type: 'endRound', seat: 0 })).toThrow(LaddisError);
    // Shuffling team (0 & 2) reaches its 4 hands: the hukum side cannot get 5.
    s.tricksTaken = [2, 1, 2, 0];
    expect(legalActions(s, 1).some((a) => a.type === 'endRound')).toBe(true);
    const over = applyAction(s, { type: 'endRound', seat: 1 });
    expect(over.phase).toBe('roundOver');
    expect(over.roundResult).toMatchObject({ made: true, delta: -10 });
    expect(over.hukum!.revealed).toBe(true); // showdown
    // Vakhaai: the caller missing a single hand decides the round at once.
    let v = fresh();
    v = applyAction(v, { type: 'passVakhaai', seat: 1 });
    v = applyAction(v, { type: 'vakhaai', seat: 2, bet: 16 });
    expect(legalActions(v, 2).some((a) => a.type === 'endRound')).toBe(false);
    v.tricksTaken = [1, 0, 0, 0]; // someone other than the caller took a hand
    expect(legalActions(v, 0).some((a) => a.type === 'endRound')).toBe(true);
    const vOver = applyAction(v, { type: 'endRound', seat: 0 });
    expect(vOver.phase).toBe('roundOver');
    expect(vOver.roundResult).toMatchObject({ mode: 'vakhaai', made: false, delta: 32 });
  });

  it('the host can end the match at any point; the ledger stands', () => {
    // Mid-play: a side that is clearly lost can concede without finishing the round.
    let s = fresh();
    s = passVakhaai(s);
    s = applyAction(s, { type: 'declareHukum', seat: 1, suit: 'H' });
    for (const seat of [1, 3, 2, 0] as const) {
      s = applyAction(s, { type: 'passSix', seat });
    }
    expect(s.phase).toBe('playing');
    const ended = applyAction(s, { type: 'endMatch', seat: 0 });
    expect(ended.phase).toBe('matchOver');
    expect(ended.deficit).toBe(10); // unfinished round is abandoned, ledger unchanged
    expect(ended.hukum!.revealed).toBe(true); // showdown
    expect(actingSeat(ended)).toBeNull();
    // But never twice.
    expect(() => applyAction(ended, { type: 'endMatch', seat: 0 })).toThrow(LaddisError);
    // Ending from a window phase works too.
    const inWindow = fresh();
    expect(applyAction(inWindow, { type: 'endMatch', seat: 0 }).phase).toBe('matchOver');
  });
});

describe('views', () => {
  it('hides the hukum suit from everyone but the declarer until revealed', () => {
    let s = fresh();
    s = passVakhaai(s);
    s = applyAction(s, { type: 'declareHukum', seat: 1, suit: 'H' });
    expect(redactFor(s, 1).hukum).toEqual({ declarer: 1, revealed: false, suit: 'H' });
    expect(redactFor(s, 0).hukum).toEqual({ declarer: 1, revealed: false, suit: null });
    expect(redactFor(s, 2).hukum!.suit).toBeNull();
  });
});
