import type { Player304View, RoomState, Seat } from '@icg/shared';
import { CardBack } from './CardFace';

export function SeatBadge({
  seat,
  room,
  view,
  active,
}: {
  seat: Seat;
  room: RoomState;
  view: Player304View;
  active: boolean;
}) {
  const entry = room.seats[seat];
  const name = entry?.nickname ?? `Seat ${seat}`;
  const team = seat % 2 === 0 ? 'team-a' : 'team-b';
  const isDealer = view.dealer === seat;
  const isBidder = view.bid?.bidder === seat;
  const passed = view.phase === 'bidding' && view.bidding.passed[seat];
  const offline = entry?.kind === 'human' && !entry.connected;

  return (
    <div className={`seat-badge ${team} ${active ? 'active' : ''}`}>
      <div className="seat-badge-name">
        {entry?.kind === 'bot' ? '🤖 ' : ''}
        {name}
        {seat === view.seat ? ' (you)' : ''}
      </div>
      <div className="seat-badge-tags">
        {isDealer && <span className="tag">dealer</span>}
        {isBidder && <span className="tag bidder">bid {view.bid!.amount}</span>}
        {passed && <span className="tag muted">passed</span>}
        {offline && <span className="tag warn">offline</span>}
      </div>
      {view.phase !== 'bidding' && view.handCounts[seat] > 0 && seat !== view.seat && (
        <div className="card-count">
          <CardBack size="small" />
          <span>{view.handCounts[seat]}</span>
        </div>
      )}
    </div>
  );
}
