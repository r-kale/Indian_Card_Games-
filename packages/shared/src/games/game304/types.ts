import type { Card, Suit } from '../../core/cards';
import type { TrickPlay } from '../../core/tricks';

export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1; // team 0 = seats 0 & 2, team 1 = seats 1 & 3

export const MIN_BID = 160;
export const MAX_BID = 304;
export const BIG_BID = 250; // bids at or above this score double when made
export const MATCH_TARGET = 6; // first team to this many match points wins

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export type Phase304 = 'bidding' | 'trumpSelection' | 'playing' | 'dealOver' | 'matchOver';

export interface BiddingState {
  turn: Seat;
  highBid: number | null;
  highBidder: Seat | null;
  passed: [boolean, boolean, boolean, boolean];
}

export interface TrumpState {
  suit: Suit;
  card: Card;
  revealed: boolean;
}

export interface DealResult {
  bid: number;
  bidder: Seat;
  bidTeam: Team;
  capturedPoints: [number, number];
  madeIt: boolean;
  /** Match points awarded this deal, per team. */
  deltas: [number, number];
}

export interface Game304State {
  phase: Phase304;
  dealNumber: number;
  dealer: Seat;
  /** Per-seat hands. During bidding only the first 4 cards are dealt. */
  hands: [Card[], Card[], Card[], Card[]];
  /** Second half of the deck, dealt out after trump selection. */
  undealt: Card[];
  bidding: BiddingState;
  bid: { amount: number; bidder: Seat } | null;
  /** While concealed, trump.card lives here (removed from the bidder's hand). */
  trump: TrumpState | null;
  /** Whose turn it is to play a card (playing phase only). */
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  /** Seat that asked for the trump reveal this trick and must play trump if able. */
  mustPlayTrump: Seat | null;
  capturedPoints: [number, number];
  tricksTaken: [number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  dealResult: DealResult | null;
  matchScore: [number, number];
  seed: string;
}

export type Action304 =
  | { type: 'bid'; seat: Seat; amount: number }
  | { type: 'pass'; seat: Seat }
  | { type: 'selectTrump'; seat: Seat; card: Card }
  | { type: 'revealTrump'; seat: Seat }
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
  trump:
    | { revealed: true; suit: Suit; card: Card }
    | { revealed: false; suit: Suit | null; card: Card | null } // suit/card visible only to the bidder
    | null;
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  mustPlayTrump: Seat | null;
  capturedPoints: [number, number];
  tricksTaken: [number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  dealResult: DealResult | null;
  matchScore: [number, number];
  /** Legal actions for THIS viewer right now (empty when it is not their turn). */
  legalActions: Action304[];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
