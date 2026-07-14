import { SUIT_NAMES } from '@icg/shared';
import type { Player304View } from '@icg/shared';
import { CardBack, CardFace } from './CardFace';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

export function TrumpIndicator({ view }: { view: Player304View }) {
  const trump = view.trump;
  if (trump === null) return null;
  if (trump.revealed) {
    return (
      <div className="trump-indicator">
        <span className="trump-label">Trump</span>
        <span className={`trump-suit ${trump.suit === 'H' || trump.suit === 'D' ? 'red' : ''}`}>
          {SUIT_GLYPH[trump.suit]} {SUIT_NAMES[trump.suit]}
        </span>
      </div>
    );
  }
  return (
    <div className="trump-indicator">
      <span className="trump-label">Trump (hidden)</span>
      {trump.card !== null ? <CardFace card={trump.card} size="small" /> : <CardBack size="small" />}
    </div>
  );
}
