import type { Card, Suit } from '../../core/cards';
import { MATCH_TARGET } from './types';
import type { DealResult, Seat } from './types';

/**
 * Score a finished deal. Allied: bidder + partner must capture at least the
 * bid; each player on the winning side gets +1. Lone (the bidder lost the
 * partner-card trick): the bidder alone must capture the bid — +2 if made,
 * otherwise +1 to each of the other three.
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
    if (onBidTeam === madeIt) {
      deltas[seat] = alliance === 'lone' && madeIt ? 2 : 1;
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
