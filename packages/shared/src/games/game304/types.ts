import type { Card, Suit } from '../../core/cards';
import type { TrickPlay } from '../../core/tricks';

export type Seat = 0 | 1 | 2 | 3;

export const MIN_BID = 160;
export const MAX_BID = 304;
/** Bids move in steps of 10 (…290, 300), with 304 allowed as the top bid. */
export const BID_STEP = 10;
/** First player to this many points wins the match (+1 per deal won). */
export const MATCH_TARGET = 5;

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export type Phase304 = 'bidding' | 'declaring' | 'playing' | 'dealOver' | 'matchOver';

export interface BiddingState {
  turn: Seat;
  highBid: number | null;
  highBidder: Seat | null;
  passed: [boolean, boolean, boolean, boolean];
}

/**
 * The bid winner openly declares the hukum (trump suit) and a partner card
 * they do not hold. Whoever holds that card is their secret partner for the
 * deal; the identity stays hidden until the card is played.
 */
export interface PartnerState {
  card: Card;
  /** Known to the engine from the start; redacted from views until revealed. */
  seat: Seat;
  revealed: boolean;
}

export interface DealResult {
  bid: number;
  bidder: Seat;
  partnerSeat: Seat;
  partnerCard: Card;
  trumpSuit: Suit;
  /** Points captured by bidder + partner together. */
  bidTeamPoints: number;
  madeIt: boolean;
  /** Match points awarded this deal, per seat (+1 to each winner). */
  deltas: [number, number, number, number];
}

export interface Game304State {
  phase: Phase304;
  dealNumber: number;
  dealer: Seat;
  /** All 32 cards are dealt up front: 8 per seat. */
  hands: [Card[], Card[], Card[], Card[]];
  bidding: BiddingState;
  bid: { amount: number; bidder: Seat } | null;
  trumpSuit: Suit | null;
  partner: PartnerState | null;
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  capturedPoints: [number, number, number, number];
  tricksTaken: [number, number, number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  dealResult: DealResult | null;
  /** Per-player match score; partnerships change every deal. */
  matchScore: [number, number, number, number];
  seed: string;
}

export type Action304 =
  | { type: 'bid'; seat: Seat; amount: number }
  | { type: 'pass'; seat: Seat }
  | { type: 'declare'; seat: Seat; trumpSuit: Suit; partnerCard: Card }
  | { type: 'playCard'; seat: Seat; card: Card }
  | { type: 'nextDeal'; seat: Seat };

/** What one seat (or a spectator) is allowed to see. */
export interface Player304View {
  seat: Seat | null; // null = spectator
  phase: Phase304;
  dealNumber: number;
  dealer: Seat;
  hand: Card[];
  handCounts: [number, number, number, number];
  bidding: BiddingState;
  bid: { amount: number; bidder: Seat } | null;
  trumpSuit: Suit | null;
  /** Partner card is public; the holder's seat is hidden until revealed
   *  (the holder themself always knows). */
  partner: { card: Card; revealed: boolean; seat: Seat | null } | null;
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  capturedPoints: [number, number, number, number];
  tricksTaken: [number, number, number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  dealResult: DealResult | null;
  matchScore: [number, number, number, number];
  /** Legal actions for THIS viewer right now (empty when it is not their turn). */
  legalActions: Action304[];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
