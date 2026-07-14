export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** 304 trick ranking, high to low. */
export const RANK_ORDER_304: readonly Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

export const CARD_POINTS: Record<Rank, number> = {
  J: 30,
  '9': 20,
  A: 11,
  '10': 10,
  K: 3,
  Q: 2,
  '8': 0,
  '7': 0,
};

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function cardPoints(card: Card): number {
  return CARD_POINTS[card.rank];
}

/** Build the 32-card deck used by 304 and Ladiez (7 through Ace in every suit). */
export function buildDeck32(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANK_ORDER_304) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Lower index = stronger card under the given ranking. */
export function rankIndex(rank: Rank, rankOrder: readonly Rank[]): number {
  const i = rankOrder.indexOf(rank);
  if (i === -1) throw new Error(`rank ${rank} not in rank order`);
  return i;
}

/** Sort a hand for display: group suits, strongest card first within each suit. */
export function sortHand(hand: Card[], rankOrder: readonly Rank[] = RANK_ORDER_304): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return rankIndex(a.rank, rankOrder) - rankIndex(b.rank, rankOrder);
  });
}
