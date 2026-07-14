import { useEffect, useState } from 'react';
import { cardPoints, MATCH_TARGET, matchWinners } from '@icg/shared';
import type { Seat, TrickPlay } from '@icg/shared';
import { BidDialog } from '../components/BidDialog';
import { DeclareDialog } from '../components/DeclareDialog';
import { CardFace } from '../components/CardFace';
import { Hand } from '../components/Hand';
import { HukumPanel } from '../components/HukumPanel';
import { ScorePanel } from '../components/ScorePanel';
import { SeatBadge } from '../components/SeatBadge';
import { TrickArea } from '../components/TrickArea';
import { useStore } from '../store';

const TRICK_LINGER_MS = 2500;

export function Table() {
  const { state, sendAction, toLobby } = useStore();
  const view = state.view!;
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = view.seat;
  const perspective: Seat = mySeat ?? 0;
  const nameOf = (seat: Seat) => room.seats[seat]?.nickname ?? `Seat ${seat}`;

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
      : view.phase === 'declaring'
        ? (view.bid?.bidder ?? null)
        : view.turn;

  const seatAt = (rel: 1 | 2 | 3): Seat => ((perspective + rel) % 4) as Seat;
  const myTurnToBid = view.phase === 'bidding' && mySeat !== null && view.bidding.turn === mySeat;
  const declaring = view.phase === 'declaring' && mySeat !== null && view.bid?.bidder === mySeat;
  const winners = view.phase === 'matchOver' ? matchWinners(view.matchScore) : [];

  return (
    <div className="table-screen">
      <div className="table-top">
        <SeatBadge seat={seatAt(2)} room={room} view={view} active={actor === seatAt(2)} />
      </div>
      <div className="table-left">
        <SeatBadge seat={seatAt(3)} room={room} view={view} active={actor === seatAt(3)} />
      </div>
      <div className="table-center">
        {view.phase === 'declaring' && !declaring && (
          <div className="center-note">
            Waiting for {nameOf(view.bid!.bidder)} to declare the hukum and partner card…
          </div>
        )}
        <TrickArea
          trick={showLinger ? linger.trick : view.trick}
          perspective={perspective}
          winner={showLinger ? linger.winner : null}
        />
        {showLinger && (
          <div className="trick-note">
            {nameOf(linger.winner)} takes the trick (+
            {linger.trick.reduce((s, p) => s + cardPoints(p.card), 0)} pts)
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
            <Hand
              view={view}
              onPlay={(card) => {
                const action = view.legalActions.find(
                  (a) =>
                    a.type === 'playCard' &&
                    a.card.rank === card.rank &&
                    a.card.suit === card.suit,
                );
                if (action !== undefined) sendAction(action);
              }}
            />
          </>
        ) : (
          <div className="center-note">You are spectating — hands are hidden.</div>
        )}
      </div>

      <div className="table-side">
        <HukumPanel view={view} room={room} />
        <ScorePanel view={view} room={room} />
        {view.lastTrick !== null && view.lastTrickWinner !== null && (
          <div className="last-trick">
            <div className="hukum-label">
              Last trick — {nameOf(view.lastTrickWinner)} (+
              {view.lastTrick.reduce((s, p) => s + cardPoints(p.card), 0)} pts)
            </div>
            <div className="last-trick-cards">
              {view.lastTrick.map((p, i) => (
                <div key={p.seat} className="last-trick-card" title={nameOf(p.seat as Seat)}>
                  <CardFace card={p.card} size="small" />
                  <span className="last-trick-who">
                    {i === 0 ? '· ' : ''}
                    {nameOf(p.seat as Seat).slice(0, 6)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {isHost && (
          <button className="link" onClick={toLobby}>
            End game → lobby
          </button>
        )}
      </div>

      {myTurnToBid && <BidDialog view={view} nameOf={nameOf} onAction={sendAction} />}
      {declaring && <DeclareDialog view={view} onAction={sendAction} />}

      {view.phase === 'dealOver' && view.dealResult !== null && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>{view.dealResult.madeIt ? 'Bid made! 🎉' : 'Bid failed'}</h3>
            <p>
              {nameOf(view.dealResult.bidder)} bid {view.dealResult.bid} and{' '}
              {view.dealResult.madeIt ? 'took' : 'only took'} {view.dealResult.bidTeamPoints} of
              304 with partner {nameOf(view.dealResult.partnerSeat)} (
              {view.dealResult.partnerCard.rank}
              {{ S: '♠', H: '♥', D: '♦', C: '♣' }[view.dealResult.partnerCard.suit]}).
            </p>
            <p className="match-line">
              {([0, 1, 2, 3] as Seat[])
                .map((s) => `${nameOf(s)} ${view.matchScore[s]}`)
                .join(' · ')}{' '}
              (first to {MATCH_TARGET})
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
              {winners.map((s) => nameOf(s)).join(' & ')} win{winners.length === 1 ? 's' : ''} the
              match!
            </p>
            <p>
              {([0, 1, 2, 3] as Seat[])
                .map((s) => `${nameOf(s)} ★${view.matchScore[s]}`)
                .join(' · ')}
            </p>
            {isHost ? (
              <button className="primary" onClick={toLobby}>
                Back to lobby
              </button>
            ) : (
              <p className="center-note">Waiting for the host…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
