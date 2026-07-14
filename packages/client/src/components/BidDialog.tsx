import { useEffect, useState } from 'react';
import { MAX_BID } from '@icg/shared';
import type { Action304, Player304View, Seat } from '@icg/shared';

/** Modal shown when it is the viewer's turn to bid. Bids move in steps of 10. */
export function BidDialog({
  view,
  nameOf,
  onAction,
}: {
  view: Player304View;
  nameOf: (seat: Seat) => string;
  onAction: (action: Action304) => void;
}) {
  const bidAction = view.legalActions.find((a) => a.type === 'bid');
  const passAction = view.legalActions.find((a) => a.type === 'pass');
  const min = bidAction?.type === 'bid' ? bidAction.amount : MAX_BID;
  const [amount, setAmount] = useState(min);
  useEffect(() => setAmount(min), [min]);

  if (bidAction === undefined && passAction === undefined) return null;
  const high = view.bidding.highBid;
  const bump = (n: number) =>
    setAmount((a) => {
      let next = a + n;
      if (next > 300) next = n > 0 ? MAX_BID : 300;
      if (a === MAX_BID && n < 0) next = 300;
      return Math.min(MAX_BID, Math.max(min, next));
    });

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Your bid</h3>
        <p className="subtitle">
          {high === null
            ? 'You open the bidding — minimum 160.'
            : `${nameOf(view.bidding.highBidder!)} holds the bid at ${high}.`}
        </p>
        {bidAction !== undefined && (
          <div className="bid-controls">
            <div className="bid-amount">{amount}</div>
            <div className="bid-steppers">
              <button onClick={() => bump(-10)}>−10</button>
              <button onClick={() => bump(10)}>+10</button>
              <button onClick={() => setAmount(MAX_BID)}>304</button>
            </div>
          </div>
        )}
        <div className="dialog-actions">
          {passAction !== undefined && <button onClick={() => onAction(passAction)}>Pass</button>}
          {bidAction !== undefined && view.seat !== null && (
            <button
              className="primary"
              onClick={() => onAction({ type: 'bid', seat: view.seat!, amount })}
            >
              Bid {amount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
