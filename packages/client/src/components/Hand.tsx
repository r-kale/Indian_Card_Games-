import { cardKey } from '@icg/shared';
import type { Card, Player304View } from '@icg/shared';
import { CardFace } from './CardFace';

/**
 * The viewer's own hand, fanned at the bottom. Clicking a card plays it
 * (or selects it as the concealed trump during trump selection).
 */
export function Hand({
  view,
  onPlay,
}: {
  view: Player304View;
  onPlay: (card: Card) => void;
}) {
  const playable = new Set(
    view.legalActions
      .filter((a) => a.type === 'playCard' || a.type === 'selectTrump')
      .map((a) => cardKey((a as { card: Card }).card)),
  );
  const anyPlayable = playable.size > 0;
  return (
    <div className="hand">
      {view.hand.map((card) => {
        const key = cardKey(card);
        const legal = playable.has(key);
        return (
          <CardFace
            key={key}
            card={card}
            raised={legal}
            disabled={anyPlayable && !legal}
            onClick={legal ? () => onPlay(card) : undefined}
          />
        );
      })}
    </div>
  );
}
