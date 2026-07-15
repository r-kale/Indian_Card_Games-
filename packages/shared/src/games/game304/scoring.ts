import type { Card, Suit } from '../../core/cards';
import { LAST_TRICK_SHIFT, MARRIAGE_SHIFT, MARRIAGE_SHIFT_HUKUM, MATCH_TARGET } from './types';
import type { DealResult, Marriage, Seat } from './types';

/**
 * Score a finished deal against the EFFECTIVE bid target:
 * - each SHOWN marriage (K+Q of a suit in one hand) shifts the bid by 20 —
 *   40 for the hukum suit — down when the bid side holds it, up otherwise;
 * - the last trick shifts the bid by 10 the same way.
 * Only the bid side's match score ever moves: bidder and allied partner get
 * +1 each for a made bid and −1 each for a failed one; a lone bidder (the
 * partner trick was lost) swings ±2 alone. Everyone else scores nothing —
 * the only way to gain points is to win bids (or ally with the winner).
 */
export function scoreDeal(
  capturedPoints: [number, number, number, number],
  bid: { amount: number; bidder: Seat },
  partnerSeat: Seat,
  partnerCard: Card,
  trumpSuit: Suit,
  alliance: 'allied' | 'lone',
  marriages: Marriage[],
  lastTrickWinner: Seat,
): DealResult {
  const onBidSide = (seat: Seat) =>
    seat === bid.bidder || (alliance === 'allied' && seat === partnerSeat);

  const marriageShifts = marriages.map((m) => ({
    ...m,
    shift:
      (m.suit === trumpSuit ? MARRIAGE_SHIFT_HUKUM : MARRIAGE_SHIFT) *
      (onBidSide(m.seat) ? -1 : 1),
  }));
  const lastTrickShift = onBidSide(lastTrickWinner) ? -LAST_TRICK_SHIFT : LAST_TRICK_SHIFT;
  const effectiveBid =
    bid.amount + marriageShifts.reduce((a, m) => a + m.shift, 0) + lastTrickShift;

  const bidTeamPoints =
    alliance === 'allied'
      ? capturedPoints[bid.bidder] + capturedPoints[partnerSeat]
      : capturedPoints[bid.bidder];
  const madeIt = bidTeamPoints >= effectiveBid;
  const deltas: DealResult['deltas'] = [0, 0, 0, 0];
  for (let seat = 0; seat < 4; seat++) {
    if (onBidSide(seat as Seat)) {
      const magnitude = alliance === 'lone' ? 2 : 1;
      deltas[seat] = madeIt ? magnitude : -magnitude;
    }
  }
  return {
    bid: bid.amount,
    bidder: bid.bidder,
    partnerSeat,
    partnerCard,
    trumpSuit,
    alliance,
    bidTeamPoints,
    marriages: marriageShifts,
    lastTrickShift,
    effectiveBid,
    madeIt,
    deltas,
  };
}

/** Seats that have reached the match target (usually a pair, occasionally one). */
export function matchWinners(matchScore: [number, number, number, number]): Seat[] {
  const winners: Seat[] = [];
  for (let seat = 0; seat < 4; seat++) {
    if (matchScore[seat]! >= MATCH_TARGET) winners.push(seat as Seat);
  }
  return winners;
}

/**
 * Who takes the match if it stops right now: everyone at the target, or —
 * when the host ends it early — whoever leads the score.
 */
export function matchLeaders(matchScore: [number, number, number, number]): Seat[] {
  const atTarget = matchWinners(matchScore);
  if (atTarget.length > 0) return atTarget;
  const best = Math.max(...matchScore);
  return ([0, 1, 2, 3] as Seat[]).filter((s) => matchScore[s] === best);
}
