import type { Card, Suit } from '../../core/cards';
import { MATCH_TARGET } from './types';
import type { DealResult, Seat } from './types';

/**
 * Score a finished deal: the bidder + partner must capture at least the bid.
 * Each player on the winning side gets +1 match point.
 */
export function scoreDeal(
  capturedPoints: [number, number, number, number],
  bid: { amount: number; bidder: Seat },
  partnerSeat: Seat,
  partnerCard: Card,
  trumpSuit: Suit,
): DealResult {
  const bidTeamPoints = capturedPoints[bid.bidder] + capturedPoints[partnerSeat];
  const madeIt = bidTeamPoints >= bid.amount;
  const deltas: DealResult['deltas'] = [0, 0, 0, 0];
  for (let seat = 0; seat < 4; seat++) {
    const onBidTeam = seat === bid.bidder || seat === partnerSeat;
    if (onBidTeam === madeIt) deltas[seat] = 1;
  }
  return {
    bid: bid.amount,
    bidder: bid.bidder,
    partnerSeat,
    partnerCard,
    trumpSuit,
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
