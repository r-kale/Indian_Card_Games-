import { buildDeck32, cardPoints, cardsEqual, RANK_ORDER_304 } from '../../core/cards';
import type { Card, Suit } from '../../core/cards';
import { makeRng, shuffle } from '../../core/rng';
import { legalFollows, ledSuit, trickWinner } from '../../core/tricks';
import { matchWinners, scoreDeal } from './scoring';
import { BID_STEP, IllegalActionError, MAX_BID, MIN_BID, nextSeat } from './types';
import type { Action304, Game304State, Seat } from './types';

export interface DealConfig {
  matchScore: [number, number, number, number];
  dealer: Seat;
  seed: string;
  dealNumber: number;
}

/** Shuffle and deal the whole deck (8 cards each); bidding opens right of the dealer. */
export function initDeal(config: DealConfig): Game304State {
  const rng = makeRng(`${config.seed}/deal${config.dealNumber}`);
  const deck = shuffle(buildDeck32(), rng);
  const hands: Game304State['hands'] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const seat = ((config.dealer + 1 + i) % 4) as Seat;
    hands[seat] = deck.slice(i * 8, i * 8 + 8);
  }
  const opener = nextSeat(config.dealer);
  return {
    phase: 'bidding',
    dealNumber: config.dealNumber,
    dealer: config.dealer,
    hands,
    bidding: { turn: opener, highBid: null, highBidder: null, passed: [false, false, false, false] },
    bid: null,
    trumpSuit: null,
    partner: null,
    turn: null,
    trick: [],
    trickLeader: opener,
    capturedPoints: [0, 0, 0, 0],
    tricksTaken: [0, 0, 0, 0],
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
    case 'declaring':
      return state.bid!.bidder;
    case 'playing':
      return state.turn;
    case 'dealOver':
    case 'matchOver':
      return null;
  }
}

/** Smallest legal raise over the current high bid (steps of 10, 304 on top). */
export function minRaise(highBid: number | null): number | null {
  if (highBid === null) return MIN_BID;
  if (highBid >= MAX_BID) return null;
  const next = highBid + BID_STEP;
  return next > 300 ? MAX_BID : next;
}

function isLegalBidAmount(amount: number, highBid: number | null): boolean {
  if (!Number.isInteger(amount)) return false;
  if (amount % BID_STEP !== 0 && amount !== MAX_BID) return false;
  const min = minRaise(highBid);
  return min !== null && amount >= min && amount <= MAX_BID;
}

/**
 * Legal actions for a seat. This is the single source of truth used by the
 * server (validation), the bots (choice set) and the client (enabling UI).
 * For bids, only the minimum legal raise is enumerated; applyAction accepts
 * any legal amount. For declarations, one representative action is
 * enumerated; applyAction validates the actual choice.
 */
export function legalActions(state: Game304State, seat: Seat): Action304[] {
  const actions: Action304[] = [];
  switch (state.phase) {
    case 'bidding': {
      if (state.bidding.turn !== seat) return [];
      const high = state.bidding.highBid;
      if (high !== null) actions.push({ type: 'pass', seat });
      const min = minRaise(high);
      if (min !== null) actions.push({ type: 'bid', seat, amount: min });
      return actions;
    }
    case 'declaring': {
      if (state.bid!.bidder !== seat) return [];
      // Representative action: any (trump, partner card) pair may be sent;
      // applyAction checks that the partner card is not in the bidder's hand.
      const sample = firstCardNotInHand(state.hands[seat]);
      return [{ type: 'declare', seat, trumpSuit: sample.suit, partnerCard: sample }];
    }
    case 'playing': {
      if (state.turn !== seat) return [];
      for (const card of legalPlays(state, seat)) actions.push({ type: 'playCard', seat, card });
      return actions;
    }
    case 'dealOver':
      return [{ type: 'nextDeal', seat }];
    case 'matchOver':
      return [];
  }
}

/**
 * Cards this seat may play: follow suit if possible; when void, anything
 * (including trump — the only way trump enters a trick is when you cannot
 * follow). If the bidder led the partner-card suit and this seat secretly
 * holds the partner card, they must out themselves by playing it.
 */
function legalPlays(state: Game304State, seat: Seat): Card[] {
  const follows = legalFollows(state.hands[seat], state.trick);
  const partner = state.partner!;
  if (
    !partner.revealed &&
    partner.seat === seat &&
    state.trick.length > 0 &&
    state.trickLeader === state.bid!.bidder &&
    ledSuit(state.trick) === partner.card.suit &&
    follows.some((c) => cardsEqual(c, partner.card))
  ) {
    return [partner.card];
  }
  return follows;
}

function firstCardNotInHand(hand: readonly Card[]): Card {
  for (const card of buildDeck32()) {
    if (!hand.some((c) => cardsEqual(c, card))) return card;
  }
  throw new Error('unreachable: hand cannot contain the whole deck');
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
    case 'declare':
      applyDeclare(s, action.seat, action.trumpSuit, action.partnerCard);
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
  if (!isLegalBidAmount(amount, s.bidding.highBid)) {
    fail(`bids go in steps of ${BID_STEP} (or ${MAX_BID}), at least ${minRaise(s.bidding.highBid)}`);
  }
  s.bidding.highBid = amount;
  s.bidding.highBidder = seat;
  advanceBidding(s);
}

function applyPass(s: Game304State, seat: Seat): void {
  if (s.phase !== 'bidding') fail('not in bidding phase');
  if (s.bidding.turn !== seat) fail('not your turn to bid');
  if (s.bidding.highBid === null) fail(`the opener must bid at least ${MIN_BID}`);
  s.bidding.passed[seat] = true;
  advanceBidding(s);
}

function advanceBidding(s: Game304State): void {
  const passedCount = s.bidding.passed.filter(Boolean).length;
  if (passedCount >= 3) {
    const bidder = s.bidding.highBidder!;
    s.bid = { amount: s.bidding.highBid!, bidder };
    s.phase = 'declaring';
    return;
  }
  let t = nextSeat(s.bidding.turn);
  while (s.bidding.passed[t]) t = nextSeat(t);
  s.bidding.turn = t;
}

function applyDeclare(s: Game304State, seat: Seat, trumpSuit: Suit, partnerCard: Card): void {
  if (s.phase !== 'declaring') fail('not in declaring phase');
  if (s.bid!.bidder !== seat) fail('only the bid winner declares');
  if (s.hands[seat].some((c) => cardsEqual(c, partnerCard))) {
    fail('the partner card must be one you do not hold');
  }
  let partnerSeat: Seat | null = null;
  for (let i = 0; i < 4; i++) {
    if (s.hands[i as Seat].some((c) => cardsEqual(c, partnerCard))) {
      partnerSeat = i as Seat;
      break;
    }
  }
  if (partnerSeat === null) fail('no such card in play');
  s.trumpSuit = trumpSuit;
  s.partner = { card: partnerCard, seat: partnerSeat, revealed: false };
  s.phase = 'playing';
  // The bid winner leads the first trick.
  s.turn = seat;
  s.trickLeader = seat;
}

function applyPlayCard(s: Game304State, seat: Seat, card: Card): void {
  if (s.phase !== 'playing') fail('not in playing phase');
  if (s.turn !== seat) fail('not your turn');
  const hand = s.hands[seat];
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx === -1) fail('card not in hand');
  if (!legalPlays(s, seat).some((c) => cardsEqual(c, card))) {
    fail('illegal card (follow suit if you can; the partner card must be shown when the bidder leads its suit)');
  }

  hand.splice(idx, 1);
  s.trick.push({ seat, card });
  if (s.partner !== null && !s.partner.revealed && cardsEqual(card, s.partner.card)) {
    s.partner.revealed = true;
  }

  if (s.trick.length === 4) {
    const winner = trickWinner(s.trick, RANK_ORDER_304, s.trumpSuit) as Seat;
    const points = s.trick.reduce((sum, p) => sum + cardPoints(p.card), 0);
    s.capturedPoints[winner] += points;
    s.tricksTaken[winner] += 1;
    s.lastTrick = s.trick;
    s.lastTrickWinner = winner;
    s.trick = [];
    s.trickLeader = winner;
    s.turn = winner;
  } else {
    s.turn = nextSeat(seat);
  }

  if (s.hands.every((h) => h.length === 0)) {
    finishDeal(s);
  }
}

function finishDeal(s: Game304State): void {
  const partner = s.partner!;
  partner.revealed = true; // everyone learns the partnership at the showdown
  s.dealResult = scoreDeal(s.capturedPoints, s.bid!, partner.seat, partner.card, s.trumpSuit!);
  s.matchScore = s.matchScore.map((v, i) => v + s.dealResult!.deltas[i]!) as Game304State['matchScore'];
  s.phase = 'dealOver';
  s.turn = null;
}

function applyNextDeal(s: Game304State): Game304State {
  if (s.phase !== 'dealOver') fail('deal is not over');
  if (matchWinners(s.matchScore).length > 0) {
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
