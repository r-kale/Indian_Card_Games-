import { MATCH_TARGET } from '@icg/shared';
import type { Player304View, RoomState, Seat } from '@icg/shared';

export function ScorePanel({ view, room }: { view: Player304View; room: RoomState }) {
  const name = (seat: Seat) => room.seats[seat]?.nickname ?? `Seat ${seat}`;
  const teamLabel = (team: 0 | 1) =>
    team === 0 ? `${name(0)} & ${name(2)}` : `${name(1)} & ${name(3)}`;
  const bidTeam = view.bid !== null ? ((view.bid.bidder % 2) as 0 | 1) : null;

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
      {(['0', '1'] as const).map((t) => {
        const team = Number(t) as 0 | 1;
        return (
          <div key={t} className={`score-row team-${team === 0 ? 'a' : 'b'}`}>
            <span className="team-name">{teamLabel(team)}</span>
            <span className="points">
              {view.capturedPoints[team]} pts
              {bidTeam === team ? ` / ${view.bid!.amount}` : ''}
            </span>
            <span className="match">
              ★ {view.matchScore[team]}/{MATCH_TARGET}
            </span>
          </div>
        );
      })}
    </div>
  );
}
