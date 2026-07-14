import { rankIndex, RANK_ORDER_STANDARD, SUITS } from '../../core/cards';
import type { Card, Suit } from '../../core/cards';
import { beatsCurrentTrick, trickWinner } from '../../core/tricks';
import { partnerOf, teamOf } from './types';
import type { LaddisAction, LaddisView, Seat } from './types';
import type { Rng } from '../../core/rng';

/** Simple rule-following Laddis bot; sees only the redacted view. */
export function chooseAction(view: LaddisView, rng: Rng): LaddisAction {
  const actions = view.legalActions;
  if (actions.length === 0) throw new Error('bot has no legal actions');
  switch (view.phase) {
    case 'vakhaai':
      return chooseVakhaai(view);
    case 'declaring':
      return { type: 'declareHukum', seat: view.seat as Seat, suit: bestSuit(view.hand) };
    case 'sixCall':
      return chooseSix(view);
    case 'playing':
      return choosePlay(view, actions, rng);
    case 'roundOver':
      return actions.find((a) => a.type === 'nextRound')!;
    case 'matchOver':
      throw new Error('match is over');
  }
}

/** Longest suit, ties broken by high-card strength. */
function bestSuit(hand: readonly Card[]): Suit {
  let best: Suit = hand[0]!.suit;
  let bestScore = -1;
  for (const suit of SUITS) {
    const inSuit = hand.filter((c) => c.suit === suit);
    const score =
      inSuit.length * 100 +
      inSuit.reduce((s, c) => s + (8 - rankIndex(c.rank, RANK_ORDER_STANDARD)), 0);
    if (inSuit.length > 0 && score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }
  return best;
}

function chooseVakhaai(view: LaddisView): LaddisAction {
  const seat = view.seat as Seat;
  // A vakhaai round is 4 tricks, no trump, caller leads: call only when every
  // card is a sure winner when led (an ace, or a king whose ace we also hold).
  const sureWinners = view.hand.filter(
    (c) =>
      c.rank === 'A' ||
      (c.rank === 'K' && view.hand.some((a) => a.suit === c.suit && a.rank === 'A')),
  ).length;
  if (sureWinners === 4) {
    return { type: 'vakhaai', seat, bet: 8 };
  }
  return { type: 'passVakhaai', seat };
}

function chooseSix(view: LaddisView): LaddisAction {
  const seat = view.seat as Seat;
  const aces = view.hand.filter((c) => c.rank === 'A').length;
  for (const suit of SUITS) {
    const inSuit = view.hand.filter((c) => c.suit === suit);
    const hasAK = inSuit.some((c) => c.rank === 'A') && inSuit.some((c) => c.rank === 'K');
    if (aces >= 2 && inSuit.length >= 5 && hasAK) {
      return { type: 'callSix', seat };
    }
  }
  return { type: 'passSix', seat };
}

function choosePlay(view: LaddisView, actions: readonly LaddisAction[], rng: Rng): LaddisAction {
  const plays = actions.filter(
    (a): a is Extract<LaddisAction, { type: 'playCard' }> => a.type === 'playCard',
  );
  const callHukum = actions.find((a) => a.type === 'callHukum');
  const me = view.seat as Seat;
  const trumpSuit = view.hukum !== null && view.hukum.revealed ? view.hukum.suit : null;

  if (callHukum !== undefined && shouldCallHukum(view, rng)) return callHukum;
  if (plays.length === 1) return plays[0]!;

  if (view.trick.length === 0) return strongest(plays);

  const winnerSoFar = trickWinner(view.trick, RANK_ORDER_STANDARD, trumpSuit) as Seat;
  if (winnerSoFar === partnerOf(me)) return weakest(plays);

  const winning = plays.filter((a) =>
    beatsCurrentTrick(a.card, view.trick, RANK_ORDER_STANDARD, trumpSuit),
  );
  if (winning.length > 0) return weakest(winning);
  return weakest(plays);
}

function shouldCallHukum(view: LaddisView, rng: Rng): boolean {
  const me = view.seat as Seat;
  const winnerSoFar = trickWinner(view.trick, RANK_ORDER_STANDARD, null) as Seat;
  const enemyWinning = teamOf(winnerSoFar) !== teamOf(me);
  if (!enemyWinning) return false;
  if (view.hukum !== null && view.hukum.suit !== null) {
    // We declared it: call only if one of our hukum cards would take the trick.
    const suit = view.hukum.suit;
    return view.hand
      .filter((c) => c.suit === suit)
      .some((c) => beatsCurrentTrick(c, view.trick, RANK_ORDER_STANDARD, suit));
  }
  // We don't know the suit: gamble occasionally when we still have depth.
  return view.hand.length >= 3 && rng() < 0.4;
}

type PlayLike = Extract<LaddisAction, { type: 'playCard' }>;

function strongest(plays: readonly PlayLike[]): PlayLike {
  return [...plays].sort(
    (a, b) =>
      rankIndex(a.card.rank, RANK_ORDER_STANDARD) - rankIndex(b.card.rank, RANK_ORDER_STANDARD),
  )[0]!;
}

function weakest(plays: readonly PlayLike[]): PlayLike {
  return [...plays].sort(
    (a, b) =>
      rankIndex(b.card.rank, RANK_ORDER_STANDARD) - rankIndex(a.card.rank, RANK_ORDER_STANDARD),
  )[0]!;
}
