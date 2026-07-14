import { cardPoints, rankIndex, RANK_ORDER_304, SUITS } from '../../core/cards';
import type { Card, Suit } from '../../core/cards';
import { beatsCurrentTrick, trickWinner } from '../../core/tricks';
import { MIN_BID, partnerOf } from './types';
import type { Action304, Player304View } from './types';
import type { Rng } from '../../core/rng';

/**
 * Simple rule-following bot. It only ever sees a redacted Player304View and
 * only ever returns one of view.legalActions, so it cannot cheat.
 */
export function chooseAction(view: Player304View, rng: Rng): Action304 {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot has no legal actions');
  switch (view.phase) {
    case 'bidding':
      return chooseBid(view, actions);
    case 'trumpSelection':
      return chooseTrump(view, actions);
    case 'playing':
      return choosePlay(view, actions, rng);
    case 'dealOver':
      return actions[0]!;
    case 'matchOver':
      throw new Error('match is over');
  }
}

/** Rough strength of the first 4 cards: honour points plus long-suit potential. */
function handStrength(hand: readonly Card[]): number {
  let strength = 0;
  for (const c of hand) {
    if (c.rank === 'J' || c.rank === '9' || c.rank === 'A') strength += cardPoints(c);
  }
  for (const suit of SUITS) {
    const inSuit = hand.filter((c) => c.suit === suit);
    if (inSuit.length >= 2 && inSuit.some((c) => c.rank === 'J' || c.rank === '9')) {
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
  const ceiling = MIN_BID + Math.floor(handStrength(view.hand) / 2);
  return bid.type === 'bid' && bid.amount <= ceiling ? bid : pass;
}

function chooseTrump(view: Player304View, actions: readonly Action304[]): Action304 {
  // Longest suit (ties broken by captured points in the suit), lowest card of it.
  let bestSuit: Suit = view.hand[0]!.suit;
  let bestScore = -1;
  for (const suit of SUITS) {
    const inSuit = view.hand.filter((c) => c.suit === suit);
    const score = inSuit.length * 100 + inSuit.reduce((s, c) => s + cardPoints(c), 0);
    if (inSuit.length > 0 && score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }
  const candidates = actions.filter(
    (a): a is Extract<Action304, { type: 'selectTrump' }> =>
      a.type === 'selectTrump' && a.card.suit === bestSuit,
  );
  return weakest(candidates)!;
}

function choosePlay(view: Player304View, actions: readonly Action304[], rng: Rng): Action304 {
  const plays = actions.filter(
    (a): a is Extract<Action304, { type: 'playCard' }> => a.type === 'playCard',
  );
  const reveal = actions.find((a) => a.type === 'revealTrump');
  const trumpSuit = view.trump !== null && view.trump.revealed ? view.trump.suit : null;

  if (reveal !== undefined && shouldReveal(view)) return reveal;

  // Leading: put our strongest card out (J and 9 are the bosses in 304).
  if (view.trick.length === 0) {
    const strongest = plays.reduce((best, a) =>
      rankIndex(a.card.rank, RANK_ORDER_304) < rankIndex(best.card.rank, RANK_ORDER_304) ? a : best,
    );
    return strongest;
  }

  const winnerSoFar = trickWinner(view.trick, RANK_ORDER_304, trumpSuit);
  const partnerWinning = view.seat !== null && winnerSoFar === partnerOf(view.seat);

  if (!partnerWinning) {
    const winning = plays.filter((a) =>
      beatsCurrentTrick(a.card, view.trick, RANK_ORDER_304, trumpSuit),
    );
    if (winning.length > 0) return cheapestThatWins(winning);
  }
  // Partner already has it, or we cannot win: throw the cheapest card away.
  void rng;
  return cheapest(plays);
}

function shouldReveal(view: Player304View): boolean {
  const isBidder = view.bid !== null && view.bid.bidder === view.seat;
  if (isBidder && view.trump !== null && view.trump.suit !== null) {
    // Reveal only if one of our trumps would actually take this trick.
    const suit = view.trump.suit;
    return view.hand
      .filter((c) => c.suit === suit)
      .some((c) => beatsCurrentTrick(c, view.trick, RANK_ORDER_304, suit));
  }
  // Defenders gamble on a reveal only when the trick is worth taking.
  const trickPoints = view.trick.reduce((s, p) => s + cardPoints(p.card), 0);
  return trickPoints >= 15;
}

type PlayLike = Extract<Action304, { type: 'playCard' } | { type: 'selectTrump' }>;

function cheapest<A extends PlayLike>(plays: readonly A[]): A {
  return [...plays].sort((a, b) => costOf(a.card) - costOf(b.card))[0]!;
}

function cheapestThatWins<A extends PlayLike>(plays: readonly A[]): A {
  return cheapest(plays);
}

function weakest<A extends PlayLike>(plays: readonly A[]): A | undefined {
  return [...plays].sort(
    (a, b) => rankIndex(b.card.rank, RANK_ORDER_304) - rankIndex(a.card.rank, RANK_ORDER_304),
  )[0];
}

/** Prefer giving up fewer points; among equals, keep the stronger rank in hand. */
function costOf(card: Card): number {
  return cardPoints(card) * 10 + (RANK_ORDER_304.length - rankIndex(card.rank, RANK_ORDER_304));
}
