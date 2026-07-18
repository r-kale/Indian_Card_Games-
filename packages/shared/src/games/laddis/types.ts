import type { Card, Suit } from '../../core/cards';
import type { TrickPlay } from '../../core/tricks';

export type Seat = 0 | 1 | 2 | 3;
/** Fixed teams: team 0 = seats 0 & 2, team 1 = seats 1 & 3. */
export type Team = 0 | 1;

export const KALYAS_PER_LADDOO = 32;
export const KALYAS_PER_ARDHA = 16;
export const VAKHAAI_BETS = [8, 16, 32] as const;
export type VakhaaiBet = (typeof VAKHAAI_BETS)[number];

/** Normal round: shuffling team recovers 5 on a win, pays 10 on a loss. */
/** Normal round: the shuffling side recovers 10 when they take their 4 hands… */
export const NORMAL_WIN = 10;
/** …and pays 5 into the deficit when the hukum side makes its 5. */
export const NORMAL_LOSS = 5;
/** Six-hand call by the non-shuffling side: worth 6, pays 12 on failure. */
export const SIX_WIN = 6;
/** A failed six by the shuffling side costs them 6… */
export const SIX_LOSS_SHUFFLING = 6;
/** …but the hukum side failing a six hands the shuffling side 12. */
export const SIX_LOSS_HUKUM = 12;

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export type LaddisPhase =
  | 'vakhaai' // first 4 cards dealt; players may call a solo bet, in turn order
  | 'declaring' // no vakhaai: the non-shuffling player right of the dealer picks the hidden hukum
  | 'sixCall' // all 8 dealt; non-shuffling seats may commit to 6 hands
  | 'playing'
  | 'roundOver'
  | 'matchOver';

export interface HukumState {
  suit: Suit;
  declarer: Seat;
  /** Hidden hukum: no trump power until a void player calls for it. */
  revealed: boolean;
}

export type RoundMode = 'normal' | 'vakhaai' | 'six';

export interface RoundResult {
  mode: RoundMode;
  /** Did the attempting side make its target? */
  made: boolean;
  /** The team whose bid the round was: shuffling (normal), callers (six), caller's team (vakhaai). */
  attemptingTeam: Team;
  vakhaai: { caller: Seat; bet: number } | null;
  six: { caller: Seat } | null;
  teamTricks: [number, number];
  /** Kalyas applied to the shuffling team's deficit (can be negative). */
  delta: number;
  deficitAfter: number;
  shufflingTeamAfter: Team;
  swapped: boolean;
}

export interface LaddisState {
  phase: LaddisPhase;
  roundNumber: number;
  dealer: Seat;
  shufflingTeam: Team;
  /** Kalyas the shuffling team is down; always >= 0 (roles swap on erase). */
  deficit: number;
  hands: [Card[], Card[], Card[], Card[]];
  undealt: Card[];
  /** Turn/passed tracker for the vakhaai and six-call windows. */
  window: { turn: Seat | null; passed: [boolean, boolean, boolean, boolean] };
  hukum: HukumState | null;
  mode: RoundMode;
  vakhaai: { caller: Seat; bet: VakhaaiBet } | null;
  six: { caller: Seat } | null;
  /** Seat that called for the hukum this trick and must play it if able. */
  mustPlayHukum: Seat | null;
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  tricksTaken: [number, number, number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  roundResult: RoundResult | null;
  seed: string;
}

export type LaddisAction =
  | { type: 'vakhaai'; seat: Seat; bet: VakhaaiBet }
  | { type: 'passVakhaai'; seat: Seat }
  | { type: 'declareHukum'; seat: Seat; suit: Suit }
  | { type: 'callSix'; seat: Seat }
  | { type: 'passSix'; seat: Seat }
  | { type: 'callHukum'; seat: Seat }
  | { type: 'playCard'; seat: Seat; card: Card }
  /** Concede the rest of the round once its outcome is already decided. */
  | { type: 'endRound'; seat: Seat }
  | { type: 'nextRound'; seat: Seat }
  | { type: 'endMatch'; seat: Seat };

/** What one seat (or a spectator) may see. */
export interface LaddisView {
  seat: Seat | null;
  phase: LaddisPhase;
  roundNumber: number;
  dealer: Seat;
  shufflingTeam: Team;
  deficit: number;
  hand: Card[];
  handCounts: [number, number, number, number];
  window: { turn: Seat | null; passed: [boolean, boolean, boolean, boolean] };
  /** Suit only visible to the declarer until revealed. */
  hukum: { declarer: Seat; revealed: boolean; suit: Suit | null } | null;
  mode: RoundMode;
  vakhaai: { caller: Seat; bet: VakhaaiBet } | null;
  six: { caller: Seat } | null;
  mustPlayHukum: Seat | null;
  turn: Seat | null;
  trick: TrickPlay[];
  trickLeader: Seat;
  tricksTaken: [number, number, number, number];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  roundResult: RoundResult | null;
  legalActions: LaddisAction[];
}

export class LaddisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LaddisError';
  }
}
