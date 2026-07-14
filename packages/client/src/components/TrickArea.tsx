import type { Seat, TrickPlay } from '@icg/shared';
import { CardFace } from './CardFace';

/**
 * The cards of the current (or just-finished) trick, placed by relative seat.
 * Each card carries its play-order number so it's clear who led.
 */
export function TrickArea({
  trick,
  perspective,
  winner,
  showPoints = true,
}: {
  trick: readonly TrickPlay[];
  perspective: Seat;
  winner: Seat | null;
  showPoints?: boolean;
}) {
  return (
    <div className="trick-area">
      {trick.map((play, order) => {
        const rel = (play.seat - perspective + 4) % 4; // 0=bottom 1=right 2=top 3=left
        const pos = (['bottom', 'right', 'top', 'left'] as const)[rel];
        const won = winner !== null && play.seat === winner;
        return (
          <div key={play.seat} className={`trick-card ${pos} ${won ? 'winner' : ''}`}>
            <CardFace card={play.card} size="small" showPoints={showPoints} />
            <span className={`trick-order ${order === 0 ? 'lead' : ''}`}>
              {order === 0 ? 'led' : order + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
