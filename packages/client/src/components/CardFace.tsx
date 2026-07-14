import type { Card } from '@icg/shared';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

export function CardFace({
  card,
  onClick,
  disabled,
  raised,
  size,
}: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  raised?: boolean;
  size?: 'small' | 'normal';
}) {
  const red = card.suit === 'H' || card.suit === 'D';
  const classes = [
    'card',
    red ? 'red' : 'black',
    onClick !== undefined && !disabled ? 'clickable' : '',
    disabled ? 'disabled' : '',
    raised ? 'raised' : '',
    size === 'small' ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} onClick={onClick} disabled={disabled || onClick === undefined}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{SUIT_GLYPH[card.suit]}</span>
    </button>
  );
}

export function CardBack({ size }: { size?: 'small' | 'normal' }) {
  return <div className={`card back ${size === 'small' ? 'small' : ''}`} />;
}
