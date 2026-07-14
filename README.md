# Indian Card Games

A web-based multiplayer platform for classic Indian card games, played in rooms of up to
8 people — no accounts, just a nickname and a shareable 6-character room code. Empty seats
are filled by simple bots so you can always get a game going.

**Playable now: 304 (Three Nought Four)** — 4-player partnership trick-taking.
Coming next on the same foundation: **Badam 7 (Sevens)** and **Ladiez**.

## Quick start

```bash
npm install
npm run dev        # game server on :3001, web client on :5173
```

Open http://localhost:5173, enter a name, create a room, take a seat, and hit
**Start game** — bots fill the remaining seats. Friends join with the room code
(or the copied invite link) from the lobby. **Play vs 3 bots** starts an instant
offline game that runs entirely in your browser — no server needed.

## Three ways to play multiplayer

| Mode | Needs | How it works |
| --- | --- | --- |
| **P2P room** (works on GitHub Pages) | Nothing — just browsers | The host's browser runs the game; friends connect directly to it over WebRTC (PeerJS). The free PeerJS broker only introduces peers — game data never touches a server. Keep the host tab open. |
| **Server room** | The Node game server | A neutral server holds all state and validates every move — hands are hidden even from the host machine, and reconnection/bot-takeover are the most robust. |
| **Offline** | Nothing | You vs 3 bots, fully in-browser. |

Both online modes send each player only their own **redacted view**, so guests can
never see other hands. In P2P the host *machine* holds the full state (like being
the dealer at a real table) — fine among friends; use a server room when that
matters. A self-hosted PeerJS broker can be used via `?srv=host:port` in the URL.

## GitHub Pages deployment

Pushing to `main` runs `.github/workflows/pages.yml`, which tests, builds the
client, and deploys it to GitHub Pages (one-time setup: repo **Settings →
Pages → Source: GitHub Actions**). The site lands at
`https://<user>.github.io/<repo>/`.

Pages is static hosting, so the deployed site offers **offline vs bots** and
**P2P rooms** (host a room, share the code — no server anywhere). To also
enable server rooms from the Pages site, host `packages/server` anywhere that
runs Node (Render, Fly.io, Railway, a VPS — `npm install && npm run start -w
@icg/server`) and set a repository variable `GAME_SERVER_URL` (Settings →
Secrets and variables → Actions → Variables) to that server's URL; the next
deploy bakes it in via `VITE_SERVER_URL`.

```bash
npm test           # rules-engine unit tests + 40-match bot simulation
npm run typecheck  # strict TS across all packages
npx tsx packages/shared/scripts/sim.ts [seed]   # print a bot-vs-bot deal turn by turn
```

## How 304 is played here (hidden-partner variant)

- 32-card deck (7–A), 8 cards each, all dealt up front.
- Card rank (high→low): **J, 9, A, 10, K, Q, 8, 7**; points J=30, 9=20, A=11, 10=10, K=3, Q=2
  (304 points per deal).
- Bidding: the player right of the dealer must open at 160+; raises go in steps of 10
  (304 is the top bid); pass and you're out.
- The bid winner **openly declares the hukum (trump suit)** and names a **partner card**
  they don't hold. Whoever holds that card is secretly the bidder's partner for the deal.
- The partnership stays hidden until the partner card is played. The bidder can force the
  reveal by **leading the partner-card suit** — the holder must then play it.
- Follow suit if you can; trump can only be played (and only wins) from a void hand.
- The bidder + partner must capture at least the bid in points. Each player on the winning
  side scores +1; partnerships reshuffle every deal, and the first player to 5 wins the match.

## Architecture

npm-workspaces monorepo, TypeScript end to end:

```
packages/
├── shared/   pure rules: cards, seeded RNG, generic trick logic, the 304 engine
│             (reducer-style: initDeal / legalActions / applyAction), per-seat
│             redacted views, bot heuristics, Socket.IO protocol types
├── server/   Node + Socket.IO: rooms & lobby, session tokens + reconnection,
│             bot driver (bots see only redacted views), disconnect grace with
│             bot takeover, room garbage collection
└── client/   React + Vite: home / lobby / table screens, CSS-only cards
```

Design principles:

- **Server-authoritative**: clients send intents; the server validates every action
  against `legalActions` and pushes fresh redacted views. Your opponents' hands never
  leave the server.
- **Pure, deterministic rules engine** with seeded shuffles — fully unit-testable, and
  the keystone `simulation.test.ts` has four bots play 40 complete matches through the
  public engine surface on every test run.
- **Game-agnostic room layer**: rooms drive any `GameEngine<State, Action, View>`
  implementation (`packages/shared/src/gameAdapter.ts`), so Badam 7 and Ladiez slot in
  as new engine modules without touching the lobby, protocol, or reconnection code.

## Roadmap

- [ ] Badam 7 (Sevens): 3–8 players, shedding game — uses the same room/lobby layer
- [ ] Ladiez: partnership trick-taking — reuses the generic trick logic in `core/tricks.ts`
- [ ] Game picker in the lobby
- [ ] Nicer animations, sounds, and mobile polish
