import type { Card, Suit } from '../../core/cards';
import { MATCH_TARGET } from './types';
import type { DealResult, Seat } from './types';

/**
 * Score a finished deal. Allied: bidder + partner must capture at least the
 * bid; each player on the winning side gets +1 and losing the bid COSTS the
 * bid team a point each. Lone (the bidder lost the partner-card trick): the
 * bidder alone must capture the bid — +2 if made, −2 if not, while the other
 * three collect +1 each on a failure.
 */
export function scoreDeal(
  capturedPoints: [number, number, number, number],
  bid: { amount: number; bidder: Seat },
  partnerSeat: Seat,
  partnerCard: Card,
  trumpSuit: Suit,
  alliance: 'allied' | 'lone',
): DealResult {
  const bidTeamPoints =
    alliance === 'allied'
      ? capturedPoints[bid.bidder] + capturedPoints[partnerSeat]
      : capturedPoints[bid.bidder];
  const madeIt = bidTeamPoints >= bid.amount;
  const deltas: DealResult['deltas'] = [0, 0, 0, 0];
  for (let seat = 0; seat < 4; seat++) {
    const onBidTeam =
      seat === bid.bidder || (alliance === 'allied' && seat === partnerSeat);
    if (onBidTeam) {
      const magnitude = alliance === 'lone' ? 2 : 1;
      deltas[seat] = madeIt ? magnitude : -magnitude;
    } else if (!madeIt) {
      deltas[seat] = 1;
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
