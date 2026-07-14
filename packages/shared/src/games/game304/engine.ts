import { buildDeck32, cardPoints, cardsEqual, RANK_ORDER_304 } from '../../core/cards';
import { makeRng, shuffle } from '../../core/rng';
import { legalFollows, ledSuit, trickWinner } from '../../core/tricks';
import { matchWinner, scoreDeal } from './scoring';
import {
  IllegalActionError,
  MAX_BID,
  MIN_BID,
  nextSeat,
  teamOf,
} from './types';
import type { Action304, Game304State, Seat } from './types';

export interface DealConfig {
  matchScore: [number, number];
  dealer: Seat;
  seed: string;
  dealNumber: number;
}

/** Shuffle and deal the first 4 cards to each seat; bidding opens right of the dealer. */
export function initDeal(config: DealConfig): Game304State {
  const rng = makeRng(`${config.seed}/deal${config.dealNumber}`);
  const deck = shuffle(buildDeck32(), rng);
  const hands: Game304State['hands'] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const seat = ((config.dealer + 1 + i) % 4) as Seat;
    hands[seat] = deck.slice(i * 4, i * 4 + 4);
  }
  const opener = nextSeat(config.dealer);
  return {
    phase: 'bidding',
    dealNumber: config.dealNumber,
    dealer: config.dealer,
    hands,
    undealt: deck.slice(16),
    bidding: { turn: opener, highBid: null, highBidder: null, passed: [false, false, false, false] },
    bid: null,
    trump: null,
    turn: null,
    trick: [],
    trickLeader: opener,
    mustPlayTrump: null,
    capturedPoints: [0, 0],
    tricksTaken: [0, 0],
    lastTrick: null,
    lastTrickWinner: null,
    dealResult: null,
    matchScore: config.matchScore,
    seed: config.seed,
  };
}

/** The seat expected to act right now, or null when no seat is on the clock. */
export function actingSeat(state: Game304State): Seat | null {
  switch (state.phase) {
    case 'bidding':
      return state.bidding.turn;
    case 'trumpSelection':
      return state.bid!.bidder;
    case 'playing':
      return state.turn;
    case 'dealOver':
    case 'matchOver':
      return null;
  }
}

/**
 * Legal actions for a seat. This is the single source of truth used by the
 * server (validation), the bots (choice set) and the client (enabling UI).
 * For bids, only the minimum legal raise is enumerated; applyAction accepts
 * any amount between that minimum and 304.
 */
export function legalActions(state: Game304State, seat: Seat): Action304[] {
  const actions: Action304[] = [];
  switch (state.phase) {
    case 'bidding': {
      if (state.bidding.turn !== seat) return [];
      const high = state.bidding.highBid;
      if (high === null) {
        // Opener is forced to open at 160 or better (no all-pass redeal).
        actions.push({ type: 'bid', seat, amount: MIN_BID });
      } else {
        actions.push({ type: 'pass', seat });
        if (high < MAX_BID) actions.push({ type: 'bid', seat, amount: high + 1 });
      }
      return actions;
    }
    case 'trumpSelection': {
      if (state.bid!.bidder !== seat) return [];
      return state.hands[seat].map((card) => ({ type: 'selectTrump', seat, card }));
    }
    case 'playing': {
      if (state.turn !== seat) return [];
      const hand = state.hands[seat];
      let playable = legalFollows(hand, state.trick);
      const trump = state.trump;
      if (
        state.mustPlayTrump === seat &&
        trump !== null &&
        trump.revealed &&
        playable.some((c) => c.suit === trump.suit)
      ) {
        playable = playable.filter((c) => c.suit === trump.suit);
      }
      for (const card of playable) actions.push({ type: 'playCard', seat, card });
      const led = ledSuit(state.trick);
      if (
        trump !== null &&
        !trump.revealed &&
        led !== null &&
        !hand.some((c) => c.suit === led)
      ) {
        actions.push({ type: 'revealTrump', seat });
      }
      return actions;
    }
    case 'dealOver':
      return [{ type: 'nextDeal', seat }];
    case 'matchOver':
      return [];
  }
}

/** Pure reducer: validates the action and returns the next state. Throws IllegalActionError. */
export function applyAction(state: Game304State, action: Action304): Game304State {
  const s: Game304State = structuredClone(state);
  switch (action.type) {
    case 'bid':
      applyBid(s, action.seat, action.amount);
      break;
    case 'pass':
      applyPass(s, action.seat);
      break;
    case 'selectTrump':
      applySelectTrump(s, action.seat, action.card);
      break;
    case 'revealTrump':
      applyRevealTrump(s, action.seat);
      break;
    case 'playCard':
      applyPlayCard(s, action.seat, action.card);
      break;
    case 'nextDeal':
      return applyNextDeal(s);
  }
  return s;
}

function fail(message: string): never {
  throw new IllegalActionError(message);
}

function applyBid(s: Game304State, seat: Seat, amount: number): void {
  if (s.phase !== 'bidding') fail('not in bidding phase');
  if (s.bidding.turn !== seat) fail('not your turn to bid');
  if (!Number.isInteger(amount)) fail('bid must be an integer');
  const high = s.bidding.highBid;
  const min = high === null ? MIN_BID : high + 1;
  if (amount < min || amount > MAX_BID) fail(`bid must be between ${min} and ${MAX_BID}`);
  s.bidding.highBid = amount;
  s.bidding.highBidder = seat;
  advanceBidding(s);
}

function applyPass(s: Game304State, seat: Seat): void {
  if (s.phase !== 'bidding') fail('not in bidding phase');
  if (s.bidding.turn !== seat) fail('not your turn to bid');
  if (s.bidding.highBid === null) fail('the opener must bid at least 160');
  s.bidding.passed[seat] = true;
  advanceBidding(s);
}

function advanceBidding(s: Game304State): void {
  const passedCount = s.bidding.passed.filter(Boolean).length;
  if (passedCount >= 3) {
    const bidder = s.bidding.highBidder!;
    s.bid = { amount: s.bidding.highBid!, bidder };
    s.phase = 'trumpSelection';
    return;
  }
  let t = nextSeat(s.bidding.turn);
  while (s.bidding.passed[t]) t = nextSeat(t);
  s.bidding.turn = t;
}

function applySelectTrump(s: Game304State, seat: Seat, card: Game304State['hands'][0][0]): void {
  if (s.phase !== 'trumpSelection') fail('not in trump selection phase');
  if (s.bid!.bidder !== seat) fail('only the bidder selects trump');
  const hand = s.hands[seat];
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) fail('trump card not in hand');
  hand.splice(idx, 1);
  s.trump = { suit: card.suit, card, revealed: false };
  // Deal the second half of the deck: 4 more cards to each seat.
  for (let i = 0; i < 4; i++) {
    const to = ((s.dealer + 1 + i) % 4) as Seat;
    s.hands[to].push(...s.undealt.slice(i * 4, i * 4 + 4));
  }
  s.undealt = [];
  s.phase = 'playing';
  s.turn = nextSeat(s.dealer);
  s.trickLeader = nextSeat(s.dealer);
}

function applyRevealTrump(s: Game304State, seat: Seat): void {
  if (s.phase !== 'playing') fail('not in playing phase');
  if (s.turn !== seat) fail('not your turn');
  const trump = s.trump;
  if (trump === null || trump.revealed) fail('trump is not concealed');
  const led = ledSuit(s.trick);
  if (led === null) fail('cannot ask for trump when leading');
  if (s.hands[seat].some((c) => c.suit === led)) fail('can only ask for trump when void in the led suit');
  revealTrump(s);
  // Classic rule: whoever asks for the reveal must play a trump if they hold one.
  s.mustPlayTrump = seat;
}

function revealTrump(s: Game304State): void {
  const trump = s.trump!;
  trump.revealed = true;
  s.hands[s.bid!.bidder].push(trump.card);
}

function applyPlayCard(s: Game304State, seat: Seat, card: Game304State['hands'][0][0]): void {
  if (s.phase !== 'playing') fail('not in playing phase');
  if (s.turn !== seat) fail('not your turn');
  const hand = s.hands[seat];
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) fail('card not in hand');
  const legal = legalActions(s, seat).some(
    (a) => a.type === 'playCard' && cardsEqual(a.card, card),
  );
  if (!legal) fail('illegal card (must follow suit, or play trump after asking for the reveal)');

  hand.splice(idx, 1);
  s.trick.push({ seat, card });
  if (s.mustPlayTrump === seat) s.mustPlayTrump = null;

  if (s.trick.length === 4) {
    const trumpSuit = s.trump !== null && s.trump.revealed ? s.trump.suit : null;
    const winner = trickWinner(s.trick, RANK_ORDER_304, trumpSuit) as Seat;
    const points = s.trick.reduce((sum, p) => sum + cardPoints(p.card), 0);
    const team = teamOf(winner);
    s.capturedPoints[team] += points;
    s.tricksTaken[team] += 1;
    s.lastTrick = s.trick;
    s.lastTrickWinner = winner;
    s.trick = [];
    s.trickLeader = winner;
    s.turn = winner;
  } else {
    s.turn = nextSeat(seat);
  }

  // If the bidder's hand ran dry with the trump still face down, it comes back
  // automatically (revealed) so their final trick can be played.
  if (s.trump !== null && !s.trump.revealed && s.hands[s.bid!.bidder].length === 0) {
    revealTrump(s);
  }

  if (s.hands.every((h) => h.length === 0)) {
    finishDeal(s);
  }
}

function finishDeal(s: Game304State): void {
  s.dealResult = scoreDeal(s.capturedPoints, s.bid!);
  s.matchScore = [
    s.matchScore[0] + s.dealResult.deltas[0],
    s.matchScore[1] + s.dealResult.deltas[1],
  ];
  s.phase = 'dealOver';
  s.turn = null;
}

function applyNextDeal(s: Game304State): Game304State {
  if (s.phase !== 'dealOver') fail('deal is not over');
  if (matchWinner(s.matchScore) !== null) {
    s.phase = 'matchOver';
    return s;
  }
  return initDeal({
    matchScore: s.matchScore,
    dealer: nextSeat(s.dealer),
    seed: s.seed,
    dealNumber: s.dealNumber + 1,
  });
}
