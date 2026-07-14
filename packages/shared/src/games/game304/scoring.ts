import { BIG_BID, MATCH_TARGET, teamOf } from './types';
import type { DealResult, Seat } from './types';

/**
 * Score a finished deal. The bidding team must capture at least the bid;
 * making it earns 1 match point (2 for a big bid of 250+), failing gives
 * the defenders 2 match points.
 */
export function scoreDeal(
  capturedPoints: [number, number],
  bid: { amount: number; bidder: Seat },
): DealResult {
  const bidTeam = teamOf(bid.bidder);
  const madeIt = capturedPoints[bidTeam] >= bid.amount;
  const deltas: [number, number] = [0, 0];
  if (madeIt) {
    deltas[bidTeam] = bid.amount >= BIG_BID ? 2 : 1;
  } else {
    deltas[(1 - bidTeam) as 0 | 1] = 2;
  }
  return { bid: bid.amount, bidder: bid.bidder, bidTeam, capturedPoints, madeIt, deltas };
}

export function matchWinner(matchScore: [number, number]): 0 | 1 | null {
  if (matchScore[0] >= MATCH_TARGET) return 0;
  if (matchScore[1] >= MATCH_TARGET) return 1;
  return null;
}
