import type { Card, Rank, Suit } from './cards';
import { rankIndex } from './cards';

/** One card played into a trick. Generic over seat count so Ladiez can reuse it. */
export interface TrickPlay {
  seat: number;
  card: Card;
}

export function ledSuit(trick: readonly TrickPlay[]): Suit | null {
  return trick.length > 0 ? trick[0]!.card.suit : null;
}

/** Cards this hand may legally play: must follow the led suit if possible. */
export function legalFollows(hand: readonly Card[], trick: readonly TrickPlay[]): Card[] {
  const led = ledSuit(trick);
  if (led === null) return [...hand];
  const following = hand.filter((c) => c.suit === led);
  return following.length > 0 ? following : [...hand];
}

/**
 * Winner of a completed trick. If trumpSuit is set and any trump was played,
 * the highest trump wins; otherwise the highest card of the led suit wins.
 */
export function trickWinner(
  trick: readonly TrickPlay[],
  rankOrder: readonly Rank[],
  trumpSuit: Suit | null,
): number {
  if (trick.length === 0) throw new Error('empty trick');
  const led = trick[0]!.card.suit;
  const candidates =
    trumpSuit !== null && trick.some((p) => p.card.suit === trumpSuit)
      ? trick.filter((p) => p.card.suit === trumpSuit)
      : trick.filter((p) => p.card.suit === led);
  let best = candidates[0]!;
  for (const p of candidates) {
    if (rankIndex(p.card.rank, rankOrder) < rankIndex(best.card.rank, rankOrder)) best = p;
  }
  return best.seat;
}

/** Would playing `card` from `seat` win the trick as it currently stands? */
export function beatsCurrentTrick(
  card: Card,
  trick: readonly TrickPlay[],
  rankOrder: readonly Rank[],
  trumpSuit: Suit | null,
): boolean {
  if (trick.length === 0) return true;
  const winner = trickWinner([...trick, { seat: -1, card }], rankOrder, trumpSuit);
  return winner === -1;
}
