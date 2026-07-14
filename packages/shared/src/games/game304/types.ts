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
 * hidden  – partner card not yet played; identity secret.
 * played  – card is on the table this trick; alliance decided when it ends.
 * allied  – the bidder's side (bidder or the partner card) won that trick:
 *           the holder joins the bidder.
 * lone    – one of the other two captured that trick: the bidder plays
 *           alone against three.
 */
export type PartnerStatus = 'hidden' | 'played' | 'allied' | 'lone';

/**
 * The bid winner openly declares the hukum (trump suit) and a partner card
 * they do not hold. Whoever holds that card only becomes the bidder's
 * partner if their side wins the trick in which the card is played.
 */
export interface PartnerState {
  card: Card;
  /** Known to the engine from the start; redacted from views while hidden. */
  seat: Seat;
  status: PartnerStatus;
}

export interface DealResult {
  bid: number;
  bidder: Seat;
  partnerSeat: Seat;
  partnerCard: Card;
  trumpSuit: Suit;
  /** 'lone' when the bidder lost the partner-card trick and played alone. */
  alliance: 'allied' | 'lone';
  /** Points captured by the bidder's side (bidder + partner, or bidder alone). */
  bidTeamPoints: number;
  madeIt: boolean;
  /** Match points per seat: +1 each on the winning side; a lone bidder wins +2. */
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
  /** Partner card is public; the holder's seat is hidden until the card is
   *  played (the holder themself always knows). */
  partner: { card: Card; status: PartnerStatus; seat: Seat | null } | null;
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
