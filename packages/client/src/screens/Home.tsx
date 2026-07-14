import { useState } from 'react';
import { loadNickname, useStore } from '../store';

function codeFromHash(): string {
  const m = /^#\/?([A-Za-z0-9]{6})$/.exec(window.location.hash);
  return m?.[1]?.toUpperCase() ?? '';
}

export function Home() {
  const { createRoom, joinRoom } = useStore();
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState(codeFromHash());
  const ready = nickname.trim().length > 0;

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
        <button className="primary" disabled={!ready} onClick={() => createRoom(nickname.trim())}>
          Create a room
        </button>
        <div className="join-row">
          <input
            value={code}
            placeholder="ROOM CODE"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && code.length === 6) joinRoom(code, nickname.trim());
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

      <div className="rules-note">
        <strong>How 304 works:</strong> 32 cards, J &gt; 9 &gt; A &gt; 10 &gt; K &gt; Q &gt; 8 &gt; 7.
        Bid 160+ points for your team, hide a trump card, then win tricks to make your bid.
      </div>
    </div>
  );
}
