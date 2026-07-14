import { cardKey } from '@icg/shared';
import type { Card } from '@icg/shared';
import { CardFace } from './CardFace';

/** The viewer's own hand, fanned at the bottom; legal cards are raised. */
export function Hand({
  cards,
  playable,
  onPlay,
  showPoints = true,
}: {
  cards: Card[];
  playable: Set<string>;
  onPlay: (card: Card) => void;
  showPoints?: boolean;
}) {
  const anyPlayable = playable.size > 0;
  return (
    <div className="hand">
      {cards.map((card) => {
        const key = cardKey(card);
        const legal = playable.has(key);
        return (
          <CardFace
            key={key}
            card={card}
            raised={legal}
            disabled={anyPlayable && !legal}
            onClick={legal ? () => onPlay(card) : undefined}
            showPoints={showPoints}
          />
        );
      })}
    </div>
  );
}
