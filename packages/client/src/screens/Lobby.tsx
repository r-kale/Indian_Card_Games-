import { useState } from 'react';
import type { Seat } from '@icg/shared';
import { useStore } from '../store';

const SEAT_LAYOUT: { seat: Seat; area: string }[] = [
  { seat: 2, area: 'top' },
  { seat: 1, area: 'left' },
  { seat: 3, area: 'right' },
  { seat: 0, area: 'bottom' },
];

export function Lobby() {
  const { state, takeSeat, leaveSeat, addBot, removeBot, startGame, leaveRoom } = useStore();
  const [copied, setCopied] = useState(false);
  const room = state.roomState!;
  const me = state.session!.playerId;
  const isHost = room.hostId === me;
  const mySeat = room.seats.findIndex((s) => s?.playerId === me);

  const copyCode = () => {
    const url = `${window.location.origin}/#/${room.code}`;
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

      <p className="subtitle">
        Teams sit across from each other: <span className="team-a">seats 0 &amp; 2</span> vs{' '}
        <span className="team-b">seats 1 &amp; 3</span>. Empty seats get bots when the host starts.
      </p>

      <div className="seat-diamond">
        <div className="diamond-center">304</div>
        {SEAT_LAYOUT.map(({ seat, area }) => {
          const entry = room.seats[seat];
          const team = seat % 2 === 0 ? 'team-a' : 'team-b';
          return (
            <div key={seat} className={`seat-card ${area} ${team}`}>
              <div className="seat-label">Seat {seat}</div>
              {entry === null ? (
                <>
                  <div className="seat-empty">empty</div>
                  <div className="seat-buttons">
                    <button onClick={() => takeSeat(seat)}>Sit here</button>
                    {isHost && <button onClick={() => addBot(seat)}>Add bot</button>}
                  </div>
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
        <p className="spectators">
          Watching: {room.spectators.map((s) => s.nickname).join(', ')}
        </p>
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
