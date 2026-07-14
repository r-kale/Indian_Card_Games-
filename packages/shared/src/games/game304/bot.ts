import { cardPoints, rankIndex, RANK_ORDER_304, SUITS } from '../../core/cards';
import type { Card, Rank, Suit } from '../../core/cards';
import { beatsCurrentTrick, trickWinner } from '../../core/tricks';
import { BID_STEP, MIN_BID } from './types';
import type { Action304, Player304View, Seat } from './types';
import type { Rng } from '../../core/rng';

/**
 * Simple rule-following bot. It only ever sees a redacted Player304View, so
 * it cannot cheat — it does not know who the hidden partner is any more than
 * a human in its seat would.
 */
export function chooseAction(view: Player304View, rng: Rng): Action304 {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot has no legal actions');
  switch (view.phase) {
    case 'bidding':
      return chooseBid(view, actions);
    case 'declaring':
      return chooseDeclaration(view);
    case 'playing':
      return choosePlay(view, actions, rng);
    case 'dealOver':
      return actions[0]!;
    case 'matchOver':
      throw new Error('match is over');
  }
}

/** Rough strength of the full 8-card hand: honour points plus long-suit potential. */
function handStrength(hand: readonly Card[]): number {
  let strength = 0;
  for (const c of hand) {
    if (c.rank === 'J' || c.rank === '9' || c.rank === 'A') strength += cardPoints(c);
  }
  for (const suit of SUITS) {
    const inSuit = hand.filter((c) => c.suit === suit);
    if (inSuit.length >= 3 && inSuit.some((c) => c.rank === 'J' || c.rank === '9')) {
      strength += 15;
    }
  }
  return strength;
}

function chooseBid(view: Player304View, actions: readonly Action304[]): Action304 {
  const bid = actions.find((a) => a.type === 'bid');
  const pass = actions.find((a) => a.type === 'pass');
  if (bid === undefined) return pass!;
  if (pass === undefined) return bid; // forced opener
  const ceiling =
    MIN_BID + Math.floor(handStrength(view.hand) / 2 / BID_STEP) * BID_STEP;
  return bid.type === 'bid' && bid.amount <= ceiling ? bid : pass;
}

function chooseDeclaration(view: Player304View): Action304 {
  const hand = view.hand;
  // Hukum: our longest suit (ties broken by points held in it).
  let trumpSuit: Suit = hand[0]!.suit;
  let bestScore = -1;
  for (const suit of SUITS) {
    const inSuit = hand.filter((c) => c.suit === suit);
    const score = inSuit.length * 100 + inSuit.reduce((s, c) => s + cardPoints(c), 0);
    if (inSuit.length > 0 && score > bestScore) {
      bestScore = score;
      trumpSuit = suit;
    }
  }
  // Partner card: the strongest card we do NOT hold — J of trump first, then
  // 9 of trump, then the big honours elsewhere.
  const wanted: Card[] = [];
  for (const rank of ['J', '9'] as Rank[]) wanted.push({ rank, suit: trumpSuit });
  for (const rank of ['J', '9', 'A'] as Rank[]) {
    for (const suit of SUITS) {
      if (suit !== trumpSuit) wanted.push({ rank, suit });
    }
  }
  const partnerCard = wanted.find(
    (w) => !hand.some((c) => c.rank === w.rank && c.suit === w.suit),
  )!;
  return { type: 'declare', seat: view.seat as Seat, trumpSuit, partnerCard };
}

/** Seats this bot KNOWS are on its side (partnerships are secret until revealed). */
function knownAllies(view: Player304View): Set<number> {
  const allies = new Set<number>();
  if (view.seat === null || view.bid === null || view.partner === null) return allies;
  const me = view.seat;
  const bidder = view.bid.bidder;
  const partnerSeat = view.partner.seat; // null unless revealed or we ARE the partner
  if (me === bidder) {
    if (partnerSeat !== null) allies.add(partnerSeat);
  } else if (partnerSeat === me) {
    allies.add(bidder);
  } else if (partnerSeat !== null) {
    // Partner is known and it isn't us: we're a defender; the other defender
    // is whoever is neither bidder nor partner nor us.
    for (let s = 0; s < 4; s++) {
      if (s !== me && s !== bidder && s !== partnerSeat) allies.add(s);
    }
  }
  return allies;
}

function choosePlay(view: Player304View, actions: readonly Action304[], rng: Rng): Action304 {
  const plays = actions.filter(
    (a): a is Extract<Action304, { type: 'playCard' }> => a.type === 'playCard',
  );
  if (plays.length === 1) return plays[0]!;
  const trumpSuit = view.trumpSuit;

  // Leading a trick.
  if (view.trick.length === 0) {
    // The bidder can out their hidden partner by leading the partner suit.
    if (
      view.seat === view.bid?.bidder &&
      view.partner !== null &&
      !view.partner.revealed &&
      rng() < 0.5
    ) {
      const outing = plays.filter((a) => a.card.suit === view.partner!.card.suit);
      if (outing.length > 0) return strongest(outing);
    }
    return strongest(plays);
  }

  const winnerSoFar = trickWinner(view.trick, RANK_ORDER_304, trumpSuit);
  if (knownAllies(view).has(winnerSoFar)) return cheapest(plays);

  const winning = plays.filter((a) =>
    beatsCurrentTrick(a.card, view.trick, RANK_ORDER_304, trumpSuit),
  );
  if (winning.length > 0) return cheapest(winning);
  return cheapest(plays);
}

type PlayLike = Extract<Action304, { type: 'playCard' }>;

function strongest(plays: readonly PlayLike[]): PlayLike {
  return [...plays].sort(
    (a, b) => rankIndex(a.card.rank, RANK_ORDER_304) - rankIndex(b.card.rank, RANK_ORDER_304),
  )[0]!;
}

function cheapest(plays: readonly PlayLike[]): PlayLike {
  return [...plays].sort((a, b) => costOf(a.card) - costOf(b.card))[0]!;
}

/** Prefer giving up fewer points; among equals, keep the stronger rank in hand. */
function costOf(card: Card): number {
  return cardPoints(card) * 10 + (RANK_ORDER_304.length - rankIndex(card.rank, RANK_ORDER_304));
}
