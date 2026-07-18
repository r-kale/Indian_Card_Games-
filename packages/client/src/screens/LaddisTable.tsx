import { useEffect, useRef, useState } from 'react';
import { cardKey, formatKalyas, SUIT_NAMES, SUITS, VAKHAAI_BETS } from '@icg/shared';
import type { LaddisAction, LaddisView, RoomState, Seat, Suit, TrickPlay, VakhaaiBet } from '@icg/shared';
import { CardBack, CardFace } from '../components/CardFace';
import { EndMatchButton } from '../components/EndMatchButton';
import { Hand } from '../components/Hand';
import { TrickArea } from '../components/TrickArea';
import { useStore } from '../store';

const TRICK_LINGER_MS = 2500;
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

export function LaddisTable() {
  const { state, sendAction, toLobby } = useStore();
  const view = state.view as LaddisView;
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = view.seat;
  const perspective: Seat = mySeat ?? 0;
  const nameOf = (seat: Seat) => room.seats[seat]?.nickname ?? `Seat ${seat}`;
  const teamNames = (team: 0 | 1) =>
    team === 0 ? `${nameOf(0)} & ${nameOf(2)}` : `${nameOf(1)} & ${nameOf(3)}`;

  // Let a completed trick linger before it is swept away.
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

  // Flash the hukum over the playing area the moment someone calls it.
  const [flash, setFlash] = useState<{ suit: Suit; caller: Seat | null } | null>(null);
  const wasRevealed = useRef(false);
  useEffect(() => {
    const revealed = view.hukum?.revealed === true && view.phase === 'playing';
    if (revealed && !wasRevealed.current && view.hukum?.suit) {
      setFlash({ suit: view.hukum.suit, caller: view.mustPlayHukum ?? view.turn });
      const t = setTimeout(() => setFlash(null), 3000);
      wasRevealed.current = true;
      return () => clearTimeout(t);
    }
    if (view.hukum === null || !view.hukum.revealed) wasRevealed.current = false;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.hukum?.revealed, view.phase]);

  const actor: Seat | null =
    view.phase === 'vakhaai' || view.phase === 'sixCall'
      ? view.window.turn
      : view.phase === 'declaring'
        ? (((view.dealer + 1) % 4) as Seat)
        : view.turn;

  const seatAt = (rel: 1 | 2 | 3): Seat => ((perspective + rel) % 4) as Seat;
  const myVakhaaiTurn =
    view.phase === 'vakhaai' && mySeat !== null && view.window.turn === mySeat;
  const myDeclareTurn =
    view.phase === 'declaring' && mySeat !== null && actor === mySeat;
  const mySixTurn = view.phase === 'sixCall' && mySeat !== null && view.window.turn === mySeat;
  const callHukumAction = view.legalActions.find((a) => a.type === 'callHukum');
  const endRoundAction = view.legalActions.find((a) => a.type === 'endRound');

  const badge = (seat: Seat) => (
    <LaddisSeatBadge seat={seat} room={room} view={view} active={actor === seat} />
  );

  return (
    <div className="table-screen">
      <div className="table-top">{badge(seatAt(2))}</div>
      <div className="table-left">{badge(seatAt(3))}</div>
      <div className="table-center">
        {view.phase === 'vakhaai' && !myVakhaaiTurn && (
          <div className="center-note">
            Vakhaai window — {actor !== null ? nameOf(actor) : '…'} is thinking…
          </div>
        )}
        {view.phase === 'declaring' && !myDeclareTurn && (
          <div className="center-note">
            Waiting for {actor !== null ? nameOf(actor) : '…'} to set the hidden hukum…
          </div>
        )}
        {view.phase === 'sixCall' && !mySixTurn && (
          <div className="center-note">
            Six-hand window — {actor !== null ? nameOf(actor) : '…'} is deciding…
          </div>
        )}
        <TrickArea
          trick={showLinger ? linger.trick : view.trick}
          perspective={perspective}
          winner={showLinger ? linger.winner : null}
          showPoints={false}
        />
        {showLinger && (
          <div className="trick-note">{nameOf(linger.winner)} takes the hand</div>
        )}
        {flash !== null && (
          <div className="hukum-flash">
            <div className={`hukum-flash-suit ${flash.suit === 'H' || flash.suit === 'D' ? 'red' : ''}`}>
              {SUIT_GLYPH[flash.suit]}
            </div>
            <div className="hukum-flash-text">
              {flash.caller !== null ? `${nameOf(flash.caller)} called it — ` : ''}hukum is{' '}
              {SUIT_NAMES[flash.suit]}!
            </div>
          </div>
        )}
      </div>
      <div className="table-right">{badge(seatAt(1))}</div>

      <div className="table-bottom">
        {mySeat !== null ? (
          <>
            {badge(mySeat)}
            {callHukumAction !== undefined && (
              <button className="reveal-btn" onClick={() => sendAction(callHukumAction)}>
                Call for the hukum
              </button>
            )}
            {endRoundAction !== undefined && (
              <button className="reveal-btn" onClick={() => sendAction(endRoundAction)}>
                {view.mode === 'vakhaai'
                  ? 'Vakhaai broken — end the round'
                  : 'Outcome decided — end the round'}
              </button>
            )}
            <Hand
              cards={view.hand}
              showPoints={false}
              playable={
                new Set(
                  view.legalActions
                    .filter((a) => a.type === 'playCard')
                    .map((a) => cardKey((a as { card: (typeof view.hand)[0] }).card)),
                )
              }
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
        <HukumStatus view={view} room={room} />
        <LaddisScorePanel view={view} room={room} />
        {view.lastTrick !== null && view.lastTrickWinner !== null && (
          <div className="last-trick">
            <div className="hukum-label">Last hand — {nameOf(view.lastTrickWinner)}</div>
            <div className="last-trick-cards">
              {view.lastTrick.map((p, i) => (
                <div key={p.seat} className="last-trick-card" title={nameOf(p.seat as Seat)}>
                  <CardFace card={p.card} size="small" showPoints={false} />
                  <span className="last-trick-who">
                    {i === 0 ? '· ' : ''}
                    {nameOf(p.seat as Seat).slice(0, 6)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {isHost && mySeat !== null && view.phase !== 'matchOver' && (
          <EndMatchButton onEnd={() => sendAction({ type: 'endMatch', seat: mySeat })} />
        )}
        {isHost && (
          <button className="link" onClick={toLobby}>
            End game → lobby
          </button>
        )}
      </div>

      {myVakhaaiTurn && <VakhaaiDialog view={view} onAction={sendAction} />}
      {myDeclareTurn && <HukumDialog view={view} onAction={sendAction} />}
      {mySixTurn && <SixDialog view={view} onAction={sendAction} />}

      {view.phase === 'roundOver' && view.roundResult !== null && (
        <RoundOverDialog
          view={view}
          room={room}
          isHost={isHost}
          mySeat={mySeat}
          nameOf={nameOf}
          teamNames={teamNames}
          onAction={sendAction}
        />
      )}

      {view.phase === 'matchOver' && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>Match over!</h3>
            <p className="match-line">
              {view.deficit > 0
                ? `${teamNames(view.shufflingTeam)} end ${formatKalyas(view.deficit)} in deficit — ${teamNames((1 - view.shufflingTeam) as 0 | 1)} win!`
                : 'All square — no team ends in deficit.'}
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

function LaddisSeatBadge({
  seat,
  room,
  view,
  active,
}: {
  seat: Seat;
  room: RoomState;
  view: LaddisView;
  active: boolean;
}) {
  const entry = room.seats[seat];
  const name = entry?.nickname ?? `Seat ${seat}`;
  const team = seat % 2;
  const shuffling = team === view.shufflingTeam;
  const offline = entry?.kind === 'human' && !entry.connected;
  const playOrder =
    view.phase === 'playing'
      ? (['1st', '2nd', '3rd', '4th'] as const)[(seat - view.trickLeader + 4) % 4]
      : null;
  return (
    <div className={`seat-badge ${team === 0 ? 'team-a' : 'team-b'} ${active ? 'active' : ''}`}>
      <div className="seat-badge-name">
        {entry?.kind === 'bot' ? '🤖 ' : ''}
        {name}
        {seat === view.seat ? ' (you)' : ''}
      </div>
      <div className="seat-badge-tags">
        {playOrder !== null && <span className="tag order">{playOrder}</span>}
        {view.dealer === seat && <span className="tag">dealer</span>}
        {shuffling && <span className="tag muted">shuffling</span>}
        {view.hukum?.declarer === seat && <span className="tag bidder">hukum</span>}
        {view.vakhaai?.caller === seat && (
          <span className="tag partner">vakhaai {view.vakhaai.bet}</span>
        )}
        {view.six?.caller === seat && <span className="tag partner">6 hands</span>}
        {offline && <span className="tag warn">offline</span>}
        <span className="tag hands">✋ {view.tricksTaken[seat]}</span>
      </div>
      {seat !== view.seat && view.handCounts[seat] > 0 && (
        <div className="card-count">
          <CardBack size="small" />
          <span>{view.handCounts[seat]}</span>
        </div>
      )}
    </div>
  );
}

function HukumStatus({ view, room }: { view: LaddisView; room: RoomState }) {
  if (view.mode === 'vakhaai') {
    return (
      <div className="hukum-panel">
        <div className="hukum-row">
          <span className="hukum-label">Vakhaai</span>
          <span className="partner-status">no trumps — the partner's cards are dead</span>
        </div>
      </div>
    );
  }
  if (view.hukum === null) return null;
  const declarerName = room.seats[view.hukum.declarer]?.nickname ?? `Seat ${view.hukum.declarer}`;
  const red = view.hukum.suit === 'H' || view.hukum.suit === 'D';
  return (
    <div className="hukum-panel">
      <div className="hukum-row">
        <span className="hukum-label">Hukum ({declarerName})</span>
        {view.hukum.suit !== null ? (
          <span className={`trump-suit ${red ? 'red' : ''}`}>
            {SUIT_GLYPH[view.hukum.suit]} {SUIT_NAMES[view.hukum.suit]}
            {!view.hukum.revealed && ' (only you see this)'}
          </span>
        ) : (
          <span className="partner-status">hidden 🎭</span>
        )}
      </div>
    </div>
  );
}

function LaddisScorePanel({ view, room }: { view: LaddisView; room: RoomState }) {
  const teamName = (team: 0 | 1) =>
    team === 0
      ? `${room.seats[0]?.nickname ?? 'Seat 0'} & ${room.seats[2]?.nickname ?? 'Seat 2'}`
      : `${room.seats[1]?.nickname ?? 'Seat 1'} & ${room.seats[3]?.nickname ?? 'Seat 3'}`;
  const teamTricks: [number, number] = [
    view.tricksTaken[0] + view.tricksTaken[2],
    view.tricksTaken[1] + view.tricksTaken[3],
  ];
  const target = (team: 0 | 1): string => {
    if (view.mode === 'vakhaai' && view.vakhaai !== null) {
      return team === view.vakhaai.caller % 2 ? 'caller needs all 4' : 'stop the caller';
    }
    if (view.mode === 'six') {
      return team === view.shufflingTeam ? 'needs 3' : 'needs 6';
    }
    return team === view.shufflingTeam ? 'needs 4' : 'needs 5';
  };
  return (
    <div className="score-panel">
      <div className="score-row header">
        <span>Round #{view.roundNumber}</span>
        <span className="room-code-small">{room.code}</span>
      </div>
      <div className="score-row">
        <span>
          {teamName(view.shufflingTeam)} shuffling — down{' '}
          <strong>{formatKalyas(view.deficit)}</strong>
        </span>
      </div>
      {([0, 1] as const).map((team) => (
        <div key={team} className={`score-row player ${team === 0 ? 'ladd-a' : 'ladd-b'}`}>
          <span className="player-name">{teamName(team)}</span>
          <span className="points">✋ {teamTricks[team]}</span>
          <span className="match">{target(team)}</span>
        </div>
      ))}
    </div>
  );
}

function VakhaaiDialog({
  view,
  onAction,
}: {
  view: LaddisView;
  onAction: (a: LaddisAction) => void;
}) {
  const [bet, setBet] = useState<VakhaaiBet | null>(null);
  const seat = view.seat as Seat;
  return (
    <div className="dialog-backdrop">
      <div className="dialog declare">
        <h3>Vakhaai?</h3>
        <p className="subtitle">
          Only these <strong>4 cards</strong> are played — 4 hands, <strong>no trumps</strong>,
          and you lead. You must win <strong>all 4 hands yourself</strong> — your partner's cards
          are dead and can never take a hand. Win: the bet moves your way. Lose:{' '}
          <strong>double</strong> goes against you.
        </p>
        <div className="declare-section">
          <div className="declare-label">Bet (kalyas)</div>
          <div className="suit-row">
            {VAKHAAI_BETS.map((b) => (
              <button
                key={b}
                className={`rank-btn ${bet === b ? 'selected' : ''}`}
                onClick={() => setBet(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <button onClick={() => onAction({ type: 'passVakhaai', seat })}>Pass</button>
          <button
            className="primary"
            disabled={bet === null}
            onClick={() => onAction({ type: 'vakhaai', seat, bet: bet! })}
          >
            {bet !== null ? `Vakhaai for ${bet}!` : 'Pick a bet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HukumDialog({
  view,
  onAction,
}: {
  view: LaddisView;
  onAction: (a: LaddisAction) => void;
}) {
  const seat = view.seat as Seat;
  return (
    <div className="dialog-backdrop">
      <div className="dialog declare">
        <h3>Set the hidden hukum</h3>
        <p className="subtitle">
          Only you will know the suit until someone void in a trick calls for it.
        </p>
        <div className="suit-row">
          {SUITS.map((s) => (
            <button
              key={s}
              className={`suit-btn ${s === 'H' || s === 'D' ? 'red' : ''}`}
              onClick={() => onAction({ type: 'declareHukum', seat, suit: s })}
            >
              {SUIT_GLYPH[s]} {SUIT_NAMES[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SixDialog({
  view,
  onAction,
}: {
  view: LaddisView;
  onAction: (a: LaddisAction) => void;
}) {
  const seat = view.seat as Seat;
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Call six hands?</h3>
        <p className="subtitle">
          Commit your team to <strong>6 of 8 hands</strong>:{' '}
          {view.seat !== null && view.seat % 2 === view.shufflingTeam
            ? 'succeed and you recover 6 kalyas; fail and your deficit grows by 12.'
            : 'succeed and the shuffling side pays 6 kalyas; fail and 12 go their way.'}
        </p>
        <div className="dialog-actions">
          <button onClick={() => onAction({ type: 'passSix', seat })}>Pass</button>
          <button className="primary" onClick={() => onAction({ type: 'callSix', seat })}>
            Call 6 hands
          </button>
        </div>
      </div>
    </div>
  );
}

function RoundOverDialog({
  view,
  room,
  isHost,
  mySeat,
  nameOf,
  teamNames,
  onAction,
}: {
  view: LaddisView;
  room: RoomState;
  isHost: boolean;
  mySeat: Seat | null;
  nameOf: (seat: Seat) => string;
  teamNames: (team: 0 | 1) => string;
  onAction: (a: LaddisAction) => void;
}) {
  const r = view.roundResult!;
  const what =
    r.mode === 'vakhaai'
      ? `${nameOf(r.vakhaai!.caller as Seat)}'s vakhaai of ${r.vakhaai!.bet} ${r.made ? 'succeeded' : 'failed'}`
      : r.mode === 'six'
        ? `The six-hand call ${r.made ? 'succeeded' : 'failed'}`
        : `${teamNames(r.attemptingTeam)} ${r.made ? 'made' : 'missed'} their hands`;
  void room;
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>{what}</h3>
        <p>
          Hands: {teamNames(0)} {r.teamTricks[0]} — {r.teamTricks[1]} {teamNames(1)}.
        </p>
        <p className="match-line">
          {r.delta < 0 ? `${-r.delta} kalyas recovered` : `${r.delta} kalyas added`} ·{' '}
          {r.swapped
            ? `roles swap! ${teamNames(r.shufflingTeamAfter)} now shuffle at ${formatKalyas(r.deficitAfter)}`
            : `${teamNames(r.shufflingTeamAfter)} still down ${formatKalyas(r.deficitAfter)}`}
        </p>
        {r.deficitAfter >= 32 && (
          <p className="center-note">
            {teamNames(r.shufflingTeamAfter)} are {r.deficitAfter} kalyas down — the host can
            end the match here.
          </p>
        )}
        <div className="dialog-actions">
          {mySeat !== null && (
            <button className="primary" onClick={() => onAction({ type: 'nextRound', seat: mySeat })}>
              Next round
            </button>
          )}
          {isHost && mySeat !== null && (
            <button onClick={() => onAction({ type: 'endMatch', seat: mySeat })}>
              End match
            </button>
          )}
        </div>
        {mySeat === null && <p className="center-note">Next round starts shortly…</p>}
      </div>
    </div>
  );
}
