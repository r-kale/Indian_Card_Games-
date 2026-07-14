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
  const isDealer = view.dealer === seat;
  const isBidder = view.bid?.bidder === seat;
  const isPartner = view.partner?.revealed === true && view.partner.seat === seat;
  const passed = view.phase === 'bidding' && view.bidding.passed[seat];
  const offline = entry?.kind === 'human' && !entry.connected;

  return (
    <div className={`seat-badge ${active ? 'active' : ''}`}>
      <div className="seat-badge-name">
        {entry?.kind === 'bot' ? '🤖 ' : ''}
        {name}
        {seat === view.seat ? ' (you)' : ''}
      </div>
      <div className="seat-badge-tags">
        {isDealer && <span className="tag">dealer</span>}
        {isBidder && <span className="tag bidder">bid {view.bid!.amount}</span>}
        {isPartner && <span className="tag partner">🎭 partner</span>}
        {passed && <span className="tag muted">passed</span>}
        {offline && <span className="tag warn">offline</span>}
      </div>
      {seat !== view.seat && view.handCounts[seat] > 0 && (
        <div className="card-count">
          <CardBack size="small" />
          <span>{view.handCounts[seat]}</span>
        </div>
      )}
    </div>
  );
}
