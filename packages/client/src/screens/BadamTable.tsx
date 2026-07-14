import { useEffect, useState } from 'react';
import { badamMatchWinners, cardKey, rankAtValue } from '@icg/shared';
import type { BadamAction, BadamView, RoomState, SuitLayout } from '@icg/shared';
import { Hand } from '../components/Hand';
import { useStore } from '../store';

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
const SUIT_ORDER = ['S', 'H', 'D', 'C'] as const;

export function BadamTable() {
  const { state, sendAction, toLobby } = useStore();
  const view = state.view as BadamView;
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = view.seat;
  const nameOf = (seat: number) => room.seats[seat]?.nickname ?? `Seat ${seat}`;

  const passAction = view.legalActions.find((a) => a.type === 'pass');
  const playable = new Set(
    view.legalActions
      .filter((a): a is Extract<BadamAction, { type: 'playCard' }> => a.type === 'playCard')
      .map((a) => cardKey(a.card)),
  );

  // Everyone else, in play order starting from the seat after mine.
  const others = Array.from({ length: view.players - 1 }, (_, i) =>
    mySeat === null ? i : (mySeat + 1 + i) % view.players,
  ).filter((s) => s !== mySeat);

  return (
    <div className="table-screen badam">
      <div className="badam-opponents">
        {others.map((seat) => (
          <BadamSeatBadge key={seat} seat={seat} room={room} view={view} nameOf={nameOf} />
        ))}
      </div>

      <div className="badam-board">
        {SUIT_ORDER.map((suit) => (
          <SuitRow key={suit} suit={suit} row={view.layout[suit]} />
        ))}
      </div>

      <div className="table-bottom">
        {mySeat !== null ? (
          <>
            <BadamSeatBadge seat={mySeat} room={room} view={view} nameOf={nameOf} />
            {passAction !== undefined && (
              <button className="reveal-btn" onClick={() => sendAction(passAction)}>
                No playable card — pass
              </button>
            )}
            <Hand
              cards={view.hand}
              showPoints={false}
              playable={playable}
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
        <BadamScorePanel view={view} nameOf={nameOf} />
        {isHost && mySeat !== null && view.phase !== 'matchOver' && (
          <EndMatchButton seat={mySeat} onAction={sendAction} />
        )}
        {isHost && (
          <button className="link" onClick={toLobby}>
            End game → lobby
          </button>
        )}
      </div>

      {view.phase === 'roundOver' && view.roundResult !== null && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>{nameOf(view.roundResult.winner)} is out of cards!</h3>
            <p>Everyone else adds their leftover cards to their score:</p>
            <div className="badam-standings">
              {view.roundResult.cardsLeft.map((left, seat) => (
                <div key={seat} className="score-row player">
                  <span className="player-name">{nameOf(seat)}</span>
                  <span className="points">{left > 0 ? `+${left}` : 'winner 🎉'}</span>
                  <span className="match">{view.roundResult!.totalsAfter[seat]} total</span>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              {mySeat !== null && (
                <button
                  className="primary"
                  onClick={() => sendAction({ type: 'nextRound', seat: mySeat })}
                >
                  Next round
                </button>
              )}
              {isHost && mySeat !== null && (
                <button onClick={() => sendAction({ type: 'endMatch', seat: mySeat })}>
                  End match
                </button>
              )}
            </div>
            {mySeat === null && <p className="center-note">Next round starts shortly…</p>}
          </div>
        </div>
      )}

      {view.phase === 'matchOver' && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>Match over!</h3>
            <p className="match-line">
              {badamMatchWinners(view.totals)
                .map((s) => nameOf(s))
                .join(' & ')}{' '}
              win with the fewest cards conceded.
            </p>
            <div className="badam-standings">
              {[...view.totals.keys()]
                .sort((a, b) => view.totals[a]! - view.totals[b]!)
                .map((seat) => (
                  <div key={seat} className="score-row player">
                    <span className="player-name">{nameOf(seat)}</span>
                    <span className="points">{view.totals[seat]}</span>
                  </div>
                ))}
            </div>
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

/** One suit's run on the table: chips from the low end to the high end. */
function SuitRow({ suit, row }: { suit: keyof typeof SUIT_GLYPH; row: SuitLayout }) {
  const red = suit === 'H' || suit === 'D';
  return (
    <div className="suit-row-board">
      <span className={`suit-row-glyph ${red ? 'red' : ''}`}>{SUIT_GLYPH[suit]}</span>
      {row.low === null || row.high === null ? (
        <span className="suit-row-empty">waiting for the 7…</span>
      ) : (
        <div className="suit-row-chips">
          {Array.from({ length: row.high - row.low + 1 }, (_, i) => row.low! + i).map((v) => (
            <span key={v} className={`layout-chip ${red ? 'red' : ''} ${v === 7 ? 'seven' : ''}`}>
              {rankAtValue(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BadamSeatBadge({
  seat,
  room,
  view,
  nameOf,
}: {
  seat: number;
  room: RoomState;
  view: BadamView;
  nameOf: (seat: number) => string;
}) {
  const entry = room.seats[seat];
  const active = view.turn === seat;
  const passed = view.lastMove !== null && view.lastMove.seat === seat && view.lastMove.card === null;
  const offline = entry?.kind === 'human' && entry.connected === false;
  return (
    <div className={`seat-badge badam-badge ${active ? 'active' : ''}`}>
      <div className="seat-badge-name">
        {entry?.kind === 'bot' ? '🤖 ' : ''}
        {nameOf(seat)}
        {seat === view.seat ? ' (you)' : ''}
      </div>
      <div className="seat-badge-tags">
        {view.dealer === seat && <span className="tag">dealer</span>}
        {passed && <span className="tag warn">passed</span>}
        {offline && <span className="tag warn">offline</span>}
        <span className="tag hands">{view.handCounts[seat]} cards</span>
        <span className="tag muted">{view.totals[seat]} pts</span>
      </div>
    </div>
  );
}

function BadamScorePanel({ view, nameOf }: { view: BadamView; nameOf: (seat: number) => string }) {
  return (
    <div className="score-panel">
      <div className="score-row header">
        <span>Round #{view.roundNumber}</span>
        <span className="room-code-small">{view.players} players</span>
      </div>
      {Array.from({ length: view.players }, (_, seat) => (
        <div key={seat} className="score-row player">
          <span className="player-name">
            {nameOf(seat)}
            {view.turn === seat ? ' ▸' : ''}
          </span>
          <span className="points">{view.handCounts[seat]} cards</span>
          <span className="match">{view.totals[seat]} pts</span>
        </div>
      ))}
      <p className="score-hint">Leftover cards count against you — lowest total wins.</p>
    </div>
  );
}

/** Host control to stop the match at any point; two taps against stray clicks. */
function EndMatchButton({
  seat,
  onAction,
}: {
  seat: number;
  onAction: (a: BadamAction) => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className="link"
      onClick={() => {
        if (armed) onAction({ type: 'endMatch', seat });
        else setArmed(true);
      }}
    >
      {armed ? 'Tap again to end the match' : 'End match — settle the score'}
    </button>
  );
}
