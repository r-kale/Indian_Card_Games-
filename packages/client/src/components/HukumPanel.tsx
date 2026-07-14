import { SUIT_NAMES } from '@icg/shared';
import type { Player304View, RoomState } from '@icg/shared';
import { CardFace } from './CardFace';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

/** Open hukum (trump) plus the declared partner card and partnership status. */
export function HukumPanel({ view, room }: { view: Player304View; room: RoomState }) {
  if (view.trumpSuit === null) return null;
  const red = view.trumpSuit === 'H' || view.trumpSuit === 'D';
  const partner = view.partner;
  return (
    <div className="hukum-panel">
      <div className="hukum-row">
        <span className="hukum-label">Hukum</span>
        <span className={`trump-suit ${red ? 'red' : ''}`}>
          {SUIT_GLYPH[view.trumpSuit]} {SUIT_NAMES[view.trumpSuit]}
        </span>
      </div>
      {partner !== null && (
        <div className="hukum-row">
          <span className="hukum-label">Partner card</span>
          <CardFace card={partner.card} size="small" />
          <span className="partner-status">
            {partner.revealed
              ? (room.seats[partner.seat!]?.nickname ?? `Seat ${partner.seat}`)
              : partner.seat === view.seat
                ? "you! (don't tell)"
                : 'hidden 🎭'}
          </span>
        </div>
      )}
    </div>
  );
}
