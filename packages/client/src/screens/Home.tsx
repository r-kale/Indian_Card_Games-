import { useState } from 'react';
import { loadNickname, useStore } from '../store';

function codeFromHash(): string {
  const m = /^#\/?([A-Za-z0-9]{6})$/.exec(window.location.hash);
  return m?.[1]?.toUpperCase() ?? '';
}

export function Home() {
  const { state, createRoom, joinRoom, hostP2PRoom, startLocalGame } = useStore();
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState(codeFromHash());
  const ready = nickname.trim().length > 0;
  const online = state.connected;

  return (
    <div className="home">
      <h1>
        Indian Card Games <span className="game-tag">304</span>
      </h1>
      <p className="subtitle">Partnership trick-taking for 4 players — bots fill empty seats.</p>

      <label className="field">
        Your name
        <input
          value={nickname}
          maxLength={24}
          placeholder="e.g. Rahul"
          onChange={(e) => setNickname(e.target.value)}
          autoFocus
        />
      </label>

      <div className="home-actions">
        <div className="button-row">
          <button
            className="primary grow"
            disabled={!ready}
            onClick={() => startLocalGame(nickname, 'game304')}
          >
            Play 304 vs bots
          </button>
          <button
            className="primary grow"
            disabled={!ready}
            onClick={() => startLocalGame(nickname, 'laddis')}
          >
            Play Laddis vs bots
          </button>
        </div>

        <div className="online-box">
          <div className="online-title">Play online with friends</div>
          <p className="online-hint">
            <strong>Host a room</strong> runs the game in your browser and connects friends
            directly to you (peer-to-peer) — keep your tab open while playing.
            {online
              ? ' A game server is also available for server-hosted rooms.'
              : ' No game server is reachable, so P2P is the way to play online here.'}
          </p>
          <div className="online-actions">
            <div className="button-row">
              <button
                className="grow"
                disabled={!ready}
                onClick={() => hostP2PRoom(nickname.trim())}
              >
                Host a room (P2P)
              </button>
              {online && (
                <button
                  className="grow"
                  disabled={!ready}
                  onClick={() => createRoom(nickname.trim())}
                >
                  Create a server room
                </button>
              )}
            </div>
            <div className="join-row">
              <input
                value={code}
                placeholder="ROOM CODE"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ready && code.length === 6)
                    joinRoom(code, nickname.trim());
                }}
              />
              <button
                disabled={!ready || code.length !== 6}
                onClick={() => joinRoom(code, nickname.trim())}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rules-note">
        <strong>How 304 works:</strong> 32 cards, J &gt; 9 &gt; A &gt; 10 &gt; K &gt; Q &gt; 8 &gt; 7.
        Bid 160+ (in tens), declare the hukum openly, and name a partner card — whoever holds it
        is secretly your partner until it hits the table. Trump only wins from a void hand.
      </div>
    </div>
  );
}
