import type { Seat, TrickPlay } from '@icg/shared';
import { CardFace } from './CardFace';

/** The cards of the current (or just-finished) trick, placed by relative seat. */
export function TrickArea({
  trick,
  perspective,
  winner,
}: {
  trick: readonly TrickPlay[];
  perspective: Seat;
  winner: Seat | null;
}) {
  return (
    <div className="trick-area">
      {trick.map((play) => {
        const rel = (play.seat - perspective + 4) % 4; // 0=bottom 1=right 2=top 3=left
        const pos = (['bottom', 'right', 'top', 'left'] as const)[rel];
        const won = winner !== null && play.seat === winner;
        return (
          <div key={play.seat} className={`trick-card ${pos} ${won ? 'winner' : ''}`}>
            <CardFace card={play.card} size="small" />
          </div>
        );
      })}
    </div>
  );
}
