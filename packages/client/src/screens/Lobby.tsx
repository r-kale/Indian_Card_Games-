import { useState } from 'react';
import { GAME_NAMES } from '@icg/shared';
import type { GameId, Seat } from '@icg/shared';
import { useStore } from '../store';

const SEAT_LAYOUT: { seat: Seat; area: string }[] = [
  { seat: 2, area: 'top' },
  { seat: 1, area: 'left' },
  { seat: 3, area: 'right' },
  { seat: 0, area: 'bottom' },
];

export function Lobby() {
  const { state, takeSeat, leaveSeat, addBot, removeBot, setGame, startGame, leaveRoom } =
    useStore();
  const [copied, setCopied] = useState(false);
  const [botNames, setBotNames] = useState<Record<number, string>>({});
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = room.seats.findIndex((s) => s?.playerId === me);

  const copyCode = () => {
    const url = `${window.location.origin}${window.location.pathname}#/${room.code}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>Room</h2>
        <button className="room-code" onClick={copyCode} title="Copy invite link">
          {room.code} {copied ? '✓ copied' : '⧉'}
        </button>
        <button className="link" onClick={leaveRoom}>
          Leave room
        </button>
      </div>

      <div className="game-picker">
        {(Object.keys(GAME_NAMES) as GameId[]).map((g) =>
          isHost ? (
            <button
              key={g}
              className={`game-pick ${room.gameId === g ? 'selected' : ''}`}
              onClick={() => setGame(g)}
            >
              {GAME_NAMES[g]}
            </button>
          ) : (
            room.gameId === g && (
              <span key={g} className="game-pick selected">
                {GAME_NAMES[g]}
              </span>
            )
          ),
        )}
      </div>

      <p className="subtitle">
        {room.gameId === 'laddis'
          ? 'Fixed teams sit opposite: seats 0 & 2 vs seats 1 & 3. The shuffling team recovers kalyas by winning 4 hands.'
          : 'Partnerships change every deal: the bid winner declares a partner card, and whoever holds it is secretly on their team.'}{' '}
        Empty seats get bots when the host starts.
      </p>
      {state.mode === 'p2pHost' && (
        <p className="subtitle p2p-note">
          ⚡ P2P room — your browser is running the game. Keep this tab open.
        </p>
      )}
      {state.mode === 'p2pGuest' && (
        <p className="subtitle p2p-note">⚡ P2P room — connected directly to the host's browser.</p>
      )}

      <div className="seat-diamond">
        <div className="diamond-center">304</div>
        {SEAT_LAYOUT.map(({ seat, area }) => {
          const entry = room.seats[seat];
          return (
            <div key={seat} className={`seat-card ${area}`}>
              <div className="seat-label">Seat {seat}</div>
              {entry === null ? (
                <>
                  <div className="seat-buttons">
                    <button onClick={() => takeSeat(seat)}>Sit here</button>
                  </div>
                  {isHost && (
                    <div className="bot-add-row">
                      <input
                        className="bot-name-input"
                        placeholder="Bot name"
                        maxLength={20}
                        value={botNames[seat] ?? ''}
                        onChange={(e) => setBotNames({ ...botNames, [seat]: e.target.value })}
                      />
                      <button onClick={() => addBot(seat, botNames[seat])}>Add bot</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="seat-name">
                    {entry.kind === 'bot' ? '🤖 ' : ''}
                    {entry.nickname}
                    {entry.playerId === me ? ' (you)' : ''}
                    {!entry.connected && entry.kind === 'human' ? ' ⚠ offline' : ''}
                  </div>
                  <div className="seat-buttons">
                    {entry.playerId === me && <button onClick={leaveSeat}>Stand up</button>}
                    {isHost && entry.kind === 'bot' && (
                      <button onClick={() => removeBot(seat)}>Remove</button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {room.spectators.length > 0 && (
        <p className="spectators">Watching: {room.spectators.map((s) => s.nickname).join(', ')}</p>
      )}

      {isHost ? (
        <button className="primary big" onClick={startGame} disabled={mySeat === -1}>
          {mySeat === -1 ? 'Take a seat to start' : 'Start game'}
        </button>
      ) : (
        <p className="center-note">Waiting for the host to start…</p>
      )}
    </div>
  );
}
