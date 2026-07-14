export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** 304 trick ranking, high to low. */
export const RANK_ORDER_304: readonly Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];

/** Standard ranking (Laddis), high to low. */
export const RANK_ORDER_STANDARD: readonly Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];

export const CARD_POINTS: Record<Rank, number> = {
  J: 30,
  '9': 20,
  A: 11,
  '10': 10,
  K: 3,
  Q: 2,
  '8': 0,
  '7': 0,
  '6': 0,
  '5': 0,
  '4': 0,
  '3': 0,
  '2': 0,
};

/** Numeric sequence position (Badam 7 layouts): A=1 up to K=13. */
export const RANK_VALUE: Record<Rank, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

/** Rank at a given sequence value, the inverse of RANK_VALUE. */
export const RANK_AT_VALUE: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

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

/** Build the full 52-card deck (Badam 7). */
export function buildDeck52(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANK_AT_VALUE) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Rank sitting at sequence value v (1=A … 13=K). */
export function rankAtValue(v: number): Rank {
  const rank = RANK_AT_VALUE[v - 1];
  if (rank === undefined) throw new Error(`no rank at value ${v}`);
  return rank;
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
