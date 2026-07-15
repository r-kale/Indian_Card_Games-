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
  const [badamPlayers, setBadamPlayers] = useState(4);
  const ready = nickname.trim().length > 0;
  const online = state.connected;

  return (
    <div className="home">
      <h1>Indian Card Games</h1>
      <p className="subtitle">
        304, Laddis and Badam 7 — play instantly against bots, or online with up to 8 friends.
      </p>

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
        <div className="game-cards">
          <div className="game-card">
            <div className="game-card-name">304</div>
            <p className="game-card-desc">
              Bid 160+, declare the hukum and a secret partner card, chase the points.
            </p>
            <button
              className="primary"
              disabled={!ready}
              onClick={() => startLocalGame(nickname, 'game304')}
            >
              Play vs bots
            </button>
          </div>
          <div className="game-card">
            <div className="game-card-name">Laddis</div>
            <p className="game-card-desc">
              Team trick-taking with a hidden hukum — win hands, settle the kalya ledger.
            </p>
            <button
              className="primary"
              disabled={!ready}
              onClick={() => startLocalGame(nickname, 'laddis')}
            >
              Play vs bots
            </button>
          </div>
          <div className="game-card">
            <div className="game-card-name">Badam 7</div>
            <p className="game-card-desc">
              Sevens: build the layout up and down, shed your whole hand first.
            </p>
            <div className="game-card-row">
              <button
                className="primary grow"
                disabled={!ready}
                onClick={() => startLocalGame(nickname, 'badam7', badamPlayers)}
              >
                Play vs bots
              </button>
              <select
                className="players-select"
                value={badamPlayers}
                title="Table size"
                onChange={(e) => setBadamPlayers(Number(e.target.value))}
              >
                {[4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </div>
          </div>
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
        Pick the game in the room lobby — everyone plays the house rules: hidden partners in 304,
        the hidden hukum and vakhaai in Laddis, and 3–8 player Badam 7.
      </div>
    </div>
  );
}
