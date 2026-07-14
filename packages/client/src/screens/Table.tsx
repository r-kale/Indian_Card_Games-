import { useEffect, useState } from 'react';
import { SUIT_NAMES } from '@icg/shared';
import type { Seat, TrickPlay } from '@icg/shared';
import { BidDialog } from '../components/BidDialog';
import { Hand } from '../components/Hand';
import { ScorePanel } from '../components/ScorePanel';
import { SeatBadge } from '../components/SeatBadge';
import { TrickArea } from '../components/TrickArea';
import { TrumpIndicator } from '../components/TrumpIndicator';
import { useStore } from '../store';

const TRICK_LINGER_MS = 1500;

export function Table() {
  const { state, sendAction, toLobby } = useStore();
  const view = state.view!;
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = view.seat;
  const perspective: Seat = mySeat ?? 0;

  // Let a completed trick linger in the middle before it is swept away.
  const [linger, setLinger] = useState<{ trick: TrickPlay[]; winner: Seat } | null>(null);
  useEffect(() => {
    if (view.trick.length === 0 && view.lastTrick !== null && view.lastTrickWinner !== null) {
      setLinger({ trick: view.lastTrick, winner: view.lastTrickWinner });
      const t = setTimeout(() => setLinger(null), TRICK_LINGER_MS);
      return () => clearTimeout(t);
    }
    setLinger(null);
    return undefined;
  }, [view.lastTrick, view.lastTrickWinner, view.trick.length]);

  const showLinger = view.trick.length === 0 && linger !== null;
  const actor: Seat | null =
    view.phase === 'bidding'
      ? view.bidding.turn
      : view.phase === 'trumpSelection'
        ? (view.bid?.bidder ?? null)
        : view.turn;

  const seatAt = (rel: 1 | 2 | 3): Seat => ((perspective + rel) % 4) as Seat;
  const myTurnToBid = view.phase === 'bidding' && mySeat !== null && view.bidding.turn === mySeat;
  const selectingTrump =
    view.phase === 'trumpSelection' && mySeat !== null && view.bid?.bidder === mySeat;
  const revealAction = view.legalActions.find((a) => a.type === 'revealTrump');

  return (
    <div className="table-screen">
      <div className="table-top">
        <SeatBadge seat={seatAt(2)} room={room} view={view} active={actor === seatAt(2)} />
      </div>
      <div className="table-left">
        <SeatBadge seat={seatAt(3)} room={room} view={view} active={actor === seatAt(3)} />
      </div>
      <div className="table-center">
        {view.phase === 'trumpSelection' && !selectingTrump && (
          <div className="center-note">
            Waiting for {room.seats[view.bid!.bidder]?.nickname} to hide a trump card…
          </div>
        )}
        <TrickArea
          trick={showLinger ? linger.trick : view.trick}
          perspective={perspective}
          winner={showLinger ? linger.winner : null}
        />
        {showLinger && (
          <div className="trick-note">
            {room.seats[linger.winner]?.nickname} takes the trick
          </div>
        )}
      </div>
      <div className="table-right">
        <SeatBadge seat={seatAt(1)} room={room} view={view} active={actor === seatAt(1)} />
      </div>

      <div className="table-bottom">
        {mySeat !== null ? (
          <>
            <SeatBadge seat={mySeat} room={room} view={view} active={actor === mySeat} />
            {selectingTrump && (
              <div className="prompt">Pick a card to place face down as trump</div>
            )}
            {revealAction !== undefined && (
              <button className="reveal-btn" onClick={() => sendAction(revealAction)}>
                Ask for the trump
              </button>
            )}
            <Hand view={view} onPlay={(card) => {
              const action = view.legalActions.find(
                (a) =>
                  (a.type === 'playCard' || a.type === 'selectTrump') &&
                  a.card.rank === card.rank &&
                  a.card.suit === card.suit,
              );
              if (action !== undefined) sendAction(action);
            }} />
          </>
        ) : (
          <div className="center-note">You are spectating — hands are hidden.</div>
        )}
      </div>

      <div className="table-side">
        <TrumpIndicator view={view} />
        <ScorePanel view={view} room={room} />
        {isHost && (
          <button className="link" onClick={toLobby}>
            End game → lobby
          </button>
        )}
      </div>

      {myTurnToBid && <BidDialog view={view} onAction={sendAction} />}

      {view.phase === 'dealOver' && view.dealResult !== null && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>{view.dealResult.madeIt ? 'Bid made! 🎉' : 'Bid failed'}</h3>
            <p>
              {room.seats[view.dealResult.bidder]?.nickname} bid {view.dealResult.bid}
              {view.trump !== null && view.trump.suit !== null
                ? ` in ${SUIT_NAMES[view.trump.suit]}`
                : ''}
              ; their team captured {view.dealResult.capturedPoints[view.dealResult.bidTeam]} of
              304 points.
            </p>
            <p className="match-line">
              Match score: {view.matchScore[0]} — {view.matchScore[1]} (first to 6 wins)
            </p>
            {mySeat !== null ? (
              <button
                className="primary"
                onClick={() => sendAction({ type: 'nextDeal', seat: mySeat })}
              >
                Next deal
              </button>
            ) : (
              <p className="center-note">Next deal starts shortly…</p>
            )}
          </div>
        </div>
      )}

      {view.phase === 'matchOver' && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>Match over!</h3>
            <p className="match-line">
              {view.matchScore[0] > view.matchScore[1]
                ? `${room.seats[0]?.nickname} & ${room.seats[2]?.nickname} win`
                : `${room.seats[1]?.nickname} & ${room.seats[3]?.nickname} win`}{' '}
              {Math.max(view.matchScore[0], view.matchScore[1])} —{' '}
              {Math.min(view.matchScore[0], view.matchScore[1])}
            </p>
            {isHost ? (
              <button className="primary" onClick={toLobby}>
                Back to lobby
              </button>
            ) : (
              <p className="center-note">Returning to the lobby shortly…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
