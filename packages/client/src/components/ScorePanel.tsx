import { MATCH_TARGET } from '@icg/shared';
import type { Player304View, RoomState, Seat } from '@icg/shared';

/** Per-player scores: partnerships change every deal, so everyone has their own tally. */
export function ScorePanel({ view, room }: { view: Player304View; room: RoomState }) {
  const name = (seat: Seat) => room.seats[seat]?.nickname ?? `Seat ${seat}`;
  const bidTeamKnown = view.partner !== null && view.partner.status === 'allied';
  return (
    <div className="score-panel">
      <div className="score-row header">
        <span>Deal #{view.dealNumber}</span>
        <span className="room-code-small">{room.code}</span>
      </div>
      {view.bid !== null && (
        <div className="score-row">
          <span>
            {name(view.bid.bidder)} bid <strong>{view.bid.amount}</strong>
          </span>
        </div>
      )}
      {([0, 1, 2, 3] as Seat[]).map((seat) => {
        const onBidTeam =
          view.bid !== null &&
          (seat === view.bid.bidder || (bidTeamKnown && seat === view.partner!.seat));
        return (
          <div key={seat} className={`score-row player ${onBidTeam ? 'bid-team' : ''}`}>
            <span className="player-name">
              {name(seat)}
              {seat === view.seat ? ' (you)' : ''}
            </span>
            <span className="points">{view.capturedPoints[seat]} pts</span>
            <span className="match">
              ★ {view.matchScore[seat]}/{MATCH_TARGET}
            </span>
          </div>
        );
      })}
    </div>
  );
}
