import { useState } from 'react';
import { RANK_ORDER_304, SUIT_NAMES, SUITS } from '@icg/shared';
import type { Action304, Player304View, Rank, Suit } from '@icg/shared';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

/**
 * The bid winner declares the hukum (trump suit) and the partner card —
 * a card they do NOT hold; whoever has it becomes their secret partner.
 */
export function DeclareDialog({
  view,
  onAction,
}: {
  view: Player304View;
  onAction: (action: Action304) => void;
}) {
  const [trumpSuit, setTrumpSuit] = useState<Suit | null>(null);
  const [partnerSuit, setPartnerSuit] = useState<Suit | null>(null);
  const [partnerRank, setPartnerRank] = useState<Rank | null>(null);

  const inHand = (rank: Rank, suit: Suit) =>
    view.hand.some((c) => c.rank === rank && c.suit === suit);
  const ready = trumpSuit !== null && partnerSuit !== null && partnerRank !== null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog declare">
        <h3>You won the bid at {view.bid?.amount}</h3>

        <div className="declare-section">
          <div className="declare-label">Hukum (trump)</div>
          <div className="suit-row">
            {SUITS.map((suit) => (
              <button
                key={suit}
                className={`suit-btn ${suit === 'H' || suit === 'D' ? 'red' : ''} ${trumpSuit === suit ? 'selected' : ''}`}
                onClick={() => setTrumpSuit(suit)}
              >
                {SUIT_GLYPH[suit]} {SUIT_NAMES[suit]}
              </button>
            ))}
          </div>
        </div>

        <div className="declare-section">
          <div className="declare-label">
            Partner card — whoever holds it is secretly on your team (must be a card you don't
            hold)
          </div>
          <div className="suit-row">
            {SUITS.map((suit) => (
              <button
                key={suit}
                className={`suit-btn ${suit === 'H' || suit === 'D' ? 'red' : ''} ${partnerSuit === suit ? 'selected' : ''}`}
                onClick={() => {
                  setPartnerSuit(suit);
                  if (partnerRank !== null && inHand(partnerRank, suit)) setPartnerRank(null);
                }}
              >
                {SUIT_GLYPH[suit]}
              </button>
            ))}
          </div>
          {partnerSuit !== null && (
            <div className="rank-row">
              {RANK_ORDER_304.map((rank) => (
                <button
                  key={rank}
                  className={`rank-btn ${partnerRank === rank ? 'selected' : ''}`}
                  disabled={inHand(rank, partnerSuit)}
                  title={inHand(rank, partnerSuit) ? 'You hold this card' : undefined}
                  onClick={() => setPartnerRank(rank)}
                >
                  {rank}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button
            className="primary"
            disabled={!ready}
            onClick={() =>
              onAction({
                type: 'declare',
                seat: view.seat!,
                trumpSuit: trumpSuit!,
                partnerCard: { rank: partnerRank!, suit: partnerSuit! },
              })
            }
          >
            {ready
              ? `Declare ${SUIT_GLYPH[trumpSuit!]} hukum, partner ${partnerRank}${SUIT_GLYPH[partnerSuit!]}`
              : 'Pick a hukum and a partner card'}
          </button>
        </div>
      </div>
    </div>
  );
}
