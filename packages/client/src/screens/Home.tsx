import { useState } from 'react';
import { loadNickname, useStore } from '../store';

function codeFromHash(): string {
  const m = /^#\/?([A-Za-z0-9]{6})$/.exec(window.location.hash);
  return m?.[1]?.toUpperCase() ?? '';
}

export function Home() {
  const { state, createRoom, joinRoom, startLocalGame } = useStore();
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
        <button className="primary" disabled={!ready} onClick={() => startLocalGame(nickname)}>
          Play vs 3 bots
        </button>

        <div className="online-box">
          <div className="online-title">
            Play online with friends
            {!online && <span className="tag warn">no game server reachable</span>}
          </div>
          {!online && (
            <p className="online-hint">
              Online rooms need the game server (<code>npm run dev</code> locally, or a hosted
              server configured at build time). Solo play works everywhere.
            </p>
          )}
          <div className="online-actions">
            <button disabled={!ready || !online} onClick={() => createRoom(nickname.trim())}>
              Create a room
            </button>
            <div className="join-row">
              <input
                value={code}
                placeholder="ROOM CODE"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ready && online && code.length === 6)
                    joinRoom(code, nickname.trim());
                }}
              />
              <button
                disabled={!ready || !online || code.length !== 6}
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
        Bid 160+ points for your team, hide a trump card, then win tricks to make your bid.
      </div>
    </div>
  );
}
