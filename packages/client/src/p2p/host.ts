import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { engines, makeRng, pickBotName, ROOM_CODE_ALPHABET } from '@icg/shared';
import type {
  AnyGameEngine,
  GameAction,
  GameEvent,
  GameId,
  GameView,
  Rng,
  RoomState,
  SeatInfo,
} from '@icg/shared';
import {
  backoffDelay,
  HEARTBEAT_MS,
  HEARTBEAT_TIMEOUT_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  P2P_CODE_LENGTH,
  peerIdForCode,
  peerOptions,
} from './protocol';
import type { GuestToHost, HostToGuest } from './protocol';



/** crypto.randomUUID with a fallback for older phone browsers. */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
}
const DISCONNECT_GRACE_MS = 30_000;
const DEAL_OVER_AUTO_MS = 12_000;
const MAX_GUESTS = 7;

interface P2PPlayer {
  token: string;
  id: string;
  nickname: string;
  connected: boolean;
  /** null for the host themself (no data channel to yourself). */
  conn: DataConnection | null;
  /** Last time we heard anything from them (pongs count). */
  lastSeen: number;
}

type SeatEntry = { kind: 'human'; token: string } | { kind: 'bot'; name: string };

export interface HostCallbacks {
  onReady: (code: string) => void;
  onFatal: (message: string) => void;
  /** Host's own copies of what guests receive over the wire. */
  onRoom: (room: RoomState) => void;
  onView: (view: GameView) => void;
  onEvent: (event: GameEvent) => void;
}

/**
 * The host browser's authoritative game room — a browser port of the server's
 * Room. Same engine, same redaction: guests only ever receive their own view,
 * so hands stay hidden from other guests (only the host machine holds state).
 */
export class P2PHost {
  readonly hostToken = uuid();
  readonly code = randomCode();
  private peer: Peer | null = null;
  private readonly players = new Map<string, P2PPlayer>();
  private seats: (SeatEntry | null)[] = [null, null, null, null];
  private phase: 'lobby' | 'inGame' = 'lobby';
  private gameId: GameId = 'game304';
  private game: unknown = null;
  private readonly botRng: Rng = makeRng(`p2p-${Date.now()}-${Math.random()}`);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  private announced = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.destroyed) return;
    // Back on screen: heal the broker registration right away and ping the
    // guests before their resumed watchdogs can misfire.
    this.reconnectAttempt = 0;
    this.healBroker();
    // Our own timers were frozen: silence from guests was expected. Grant
    // everyone fresh grace before the liveness sweep runs again.
    const now = Date.now();
    for (const p of this.players.values()) p.lastSeen = now;
    this.pingAll();
    this.broadcast();
  };
  private readonly lobbyGrace = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    hostNickname: string,
    private readonly cb: HostCallbacks,
  ) {
    this.players.set(this.hostToken, {
      token: this.hostToken,
      id: 'p2p-host',
      nickname: hostNickname.trim().slice(0, 24) || 'Host',
      connected: true,
      conn: null,
      lastSeen: Date.now(),
    });
    this.openPeer();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.heartbeat = setInterval(() => this.pingAll(), HEARTBEAT_MS);
  }

  /**
   * Register (or re-register) the room's deterministic peer id with the
   * broker. Re-runnable: backgrounded mobile tabs drop the broker socket and
   * PeerJS may even destroy the peer on fatal errors — the id derives from
   * the room code, so a fresh Peer resurrects the same room.
   */
  private openPeer(): void {
    const peer = new Peer(peerIdForCode(this.code), peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      this.reconnectAttempt = 0;
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (!this.announced) {
        this.announced = true;
        this.cb.onReady(this.code);
      }
      this.broadcast();
    });
    peer.on('error', (e) => {
      if (!this.announced) {
        // Could not open the room at all: give up loudly.
        this.destroy();
        this.cb.onFatal(`Could not open a P2P room: ${e.type}`);
        return;
      }
      console.warn('[p2p host]', e);
      // Fatal errors destroy the peer; schedule a full re-registration.
      if (peer.destroyed) this.scheduleReconnect();
    });
    // Broker socket lost (backgrounding, network switch): re-register the id.
    peer.on('disconnected', () => this.scheduleReconnect());
    peer.on('connection', (conn) => this.onConnection(conn));
  }

  /** Re-register with the broker after a backoff; existing data channels live on. */
  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) return;
      this.reconnectAttempt++;
      this.healBroker();
    }, backoffDelay(this.reconnectAttempt));
  }

  private healBroker(): void {
    const peer = this.peer;
    if (peer === null) return;
    try {
      if (peer.destroyed) {
        this.openPeer();
      } else if (peer.disconnected) {
        peer.reconnect();
      }
    } catch (err) {
      console.warn('[p2p host] broker reconnect failed:', err);
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      this.openPeer();
    }
  }

  private pingAll(): void {
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.conn?.open === true) {
        send(p.conn, { t: 'ping' });
        // WebRTC close events can lag by minutes when a phone dies; a guest
        // that stopped answering pings is gone even if the channel looks open.
        if (p.connected && now - p.lastSeen > HEARTBEAT_TIMEOUT_MS) {
          try {
            p.conn.close();
          } catch {
            /* ignore */
          }
          this.onGuestGone(p.token);
        }
      }
    }
  }

  // ---- guest connections --------------------------------------------------

  private onConnection(conn: DataConnection): void {
    let token: string | null = null;
    conn.on('data', (raw) => {
      const msg = raw as GuestToHost;
      try {
        if (token !== null) {
          const p = this.players.get(token);
          if (p !== undefined) p.lastSeen = Date.now();
        }
        if (msg.t === 'hello') {
          token = this.onHello(conn, msg);
        } else if (token !== null) {
          this.onGuestMessage(token, msg);
        }
      } catch (err) {
        send(conn, {
          t: 'error',
          message: err instanceof Error ? err.message : 'something went wrong',
        });
      }
    });
    // Only treat the drop as "guest gone" if this is still their live
    // connection — a reclaimed guest's zombie conn closing must not evict
    // the fresh one.
    const goneIfCurrent = () => {
      if (token !== null && this.players.get(token)?.conn === conn) {
        this.onGuestGone(token);
      }
    };
    conn.on('close', goneIfCurrent);
    conn.on('error', goneIfCurrent);
  }

  private onHello(conn: DataConnection, msg: Extract<GuestToHost, { t: 'hello' }>): string {
    // Returning guest (reload / reconnect): the stored token reclaims their
    // identity — even over a zombie connection whose close never fired.
    if (msg.token !== undefined) {
      const existing = this.players.get(msg.token);
      if (existing !== undefined) {
        if (existing.conn !== null && existing.conn !== conn) {
          try {
            existing.conn.close();
          } catch {
            /* ignore */
          }
        }
        const grace = this.lobbyGrace.get(msg.token);
        if (grace !== undefined) {
          clearTimeout(grace);
          this.lobbyGrace.delete(msg.token);
        }
        existing.conn = conn;
        existing.connected = true;
        existing.lastSeen = Date.now();
        send(conn, { t: 'welcome', playerId: existing.id, token: existing.token });
        this.broadcast();
        this.sendGameTo(existing);
        this.reschedule();
        return existing.token;
      }
    }
    const connectedCount = [...this.players.values()].filter((p) => p.connected).length;
    if (connectedCount > MAX_GUESTS) {
      send(conn, { t: 'rejected', reason: 'room is full (8 players max)' });
      conn.close();
      throw new Error('room full');
    }
    const player: P2PPlayer = {
      token: uuid(),
      id: uuid().slice(0, 8),
      nickname: msg.nickname.trim().slice(0, 24) || 'Player',
      connected: true,
      conn,
      lastSeen: Date.now(),
    };
    this.players.set(player.token, player);
    send(conn, { t: 'welcome', playerId: player.id, token: player.token });
    this.broadcast();
    this.sendGameTo(player);
    return player.token;
  }

  private onGuestMessage(token: string, msg: GuestToHost): void {
    switch (msg.t) {
      case 'takeSeat':
        this.takeSeat(token, msg.seat);
        break;
      case 'leaveSeat':
        this.leaveSeat(token);
        break;
      case 'action':
        this.handleAction(token, msg.action);
        break;
      case 'hello':
        break;
    }
  }

  private onGuestGone(token: string): void {
    const player = this.players.get(token);
    if (player === undefined) return;
    player.connected = false;
    player.conn = null;
    if (this.phase === 'lobby' && !this.lobbyGrace.has(token)) {
      // Hold the seat for a while — backgrounded phones drop and come back.
      this.lobbyGrace.set(
        token,
        setTimeout(() => {
          this.lobbyGrace.delete(token);
          const p = this.players.get(token);
          if (p === undefined || p.connected) return;
          const seat = this.seatOf(token);
          if (seat !== null && this.phase === 'lobby') this.seats[seat] = null;
          this.players.delete(token);
          this.broadcast();
        }, LOBBY_DISCONNECT_GRACE_MS),
      );
    }
    this.broadcast();
    this.reschedule();
  }

  // ---- lobby & game (host-invoked directly, guest-invoked via messages) ---

  takeSeat(token: string, seat: number): void {
    if (this.phase !== 'lobby') throw new Error('not in the lobby');
    this.assertSeatIndex(seat);
    if (this.seats[seat] !== null) throw new Error('seat is taken');
    const current = this.seatOf(token);
    if (current !== null) this.seats[current] = null;
    this.seats[seat] = { kind: 'human', token };
    this.broadcast();
  }

  leaveSeat(token: string): void {
    if (this.phase !== 'lobby') throw new Error('not in the lobby');
    const current = this.seatOf(token);
    if (current !== null) this.seats[current] = null;
    this.broadcast();
  }

  addBot(seat: number, name?: string): void {
    if (this.phase !== 'lobby') throw new Error('not in the lobby');
    this.assertSeatIndex(seat);
    if (this.seats[seat] !== null) throw new Error('seat is taken');
    const custom = name?.trim().slice(0, 20);
    this.seats[seat] = { kind: 'bot', name: custom || this.freeBotName() };
    this.broadcast();
  }

  setGame(gameId: GameId): void {
    if (this.phase !== 'lobby') throw new Error('not in the lobby');
    if (!(gameId in engines)) throw new Error('unknown game');
    this.gameId = gameId;
    this.resizeSeats();
    this.broadcast();
  }

  /** In the lobby, show one slot per possible seat for the selected game. */
  private resizeSeats(): void {
    const size = this.engine.maxSeats;
    while (this.seats.length > size) this.seats.pop();
    while (this.seats.length < size) this.seats.push(null);
  }

  private assertSeatIndex(seat: number): void {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.seats.length) {
      throw new Error('bad seat');
    }
  }

  private get engine(): AnyGameEngine {
    return engines[this.gameId];
  }

  removeBot(seat: number): void {
    if (this.seats[seat]?.kind !== 'bot') throw new Error('no bot on that seat');
    this.seats[seat] = null;
    this.broadcast();
  }

  start(): void {
    if (this.phase !== 'lobby') throw new Error('not in the lobby');
    if (this.engine.minSeats === this.engine.maxSeats) {
      for (let i = 0; i < this.seats.length; i++) {
        if (this.seats[i] === null) {
          this.seats[i] = { kind: 'bot', name: this.freeBotName() };
        }
      }
    } else {
      // Variable-size game (Badam 7): play with whoever is seated; fewer than
      // four seated players get bot company up to a table of four.
      this.seats = this.seats.filter((s) => s !== null);
      while (this.seats.length < 4) {
        this.seats.push({ kind: 'bot', name: this.freeBotName() });
      }
    }
    this.phase = 'inGame';
    this.game = this.engine.init({
      seed: `p2p-${Date.now()}-${Math.random()}`,
      hostSeat: this.seatOf(this.hostToken) ?? 0,
      players: this.seats.length,
    });
    this.broadcast();
    this.broadcastGame();
    this.reschedule();
  }

  toLobby(): void {
    this.phase = 'lobby';
    this.game = null;
    this.resizeSeats();
    this.clearTimer();
    this.broadcast();
  }

  handleAction(token: string, action: GameAction): void {
    if (this.phase !== 'inGame' || this.game === null) throw new Error('no game in progress');
    const seat = this.seatOf(token);
    if (seat === null) throw new Error('you are spectating this game');
    if (action.seat !== seat) throw new Error('cannot act for another seat');
    if (this.engine.hostOnly(action) && token !== this.hostToken) {
      throw new Error('only the host can do that');
    }
    this.applyAndBroadcast(action);
  }

  private applyAndBroadcast(action: GameAction): void {
    const prev = this.game!;
    const next: unknown = this.engine.apply(prev, action);
    this.game = next;
    for (const event of this.engine.deriveEvents(prev, next) as GameEvent[]) {
      this.cb.onEvent(event);
      for (const p of this.players.values()) {
        if (p.conn?.open === true) send(p.conn, { t: 'event', event });
      }
    }
    this.broadcastGame();
    this.reschedule();
  }

  // ---- bot / timer driver --------------------------------------------------

  private reschedule(): void {
    this.clearTimer();
    if (this.destroyed || this.phase !== 'inGame' || this.game === null) return;
    const game = this.game;
    const kind = this.engine.phaseKind(game);
    if (kind === 'matchOver') return; // host clicks back to lobby
    if (kind === 'roundOver') {
      this.timer = setTimeout(
        () => this.applyAndBroadcast(this.engine.autoAdvance(game) as GameAction),
        DEAL_OVER_AUTO_MS,
      );
      return;
    }
    const seat = this.engine.actingSeat(game) as number | null;
    if (seat === null) return;
    const entry = this.seats[seat] ?? null;
    if (entry === null) return;
    if (entry.kind === 'bot') {
      this.timer = setTimeout(
        () => this.playBotMove(seat),
        this.engine.newTrickPause(game)
          ? 2300 + Math.random() * 400
          : (this.engine.botDelayMs?.() ?? 600 + Math.random() * 600),
      );
      return;
    }
    const player = this.players.get(entry.token);
    if (player !== undefined && !player.connected) {
      this.timer = setTimeout(() => this.playBotMove(seat), DISCONNECT_GRACE_MS);
    }
  }

  private playBotMove(seat: number): void {
    if (this.destroyed || this.phase !== 'inGame' || this.game === null) return;
    if (this.engine.actingSeat(this.game) !== seat) return;
    try {
      const view: unknown = this.engine.viewFor(this.game, seat);
      this.applyAndBroadcast(this.engine.botAction(view, this.botRng) as GameAction);
    } catch (err) {
      console.error('[p2p host] bot move failed:', err);
    }
  }

  // ---- broadcasting ----------------------------------------------------------

  roomState(): RoomState {
    const seats = this.seats.map((entry): SeatInfo | null => {
      if (entry === null) return null;
      if (entry.kind === 'bot') {
        return { kind: 'bot', playerId: null, nickname: entry.name, connected: true };
      }
      const p = this.players.get(entry.token)!;
      return { kind: 'human', playerId: p.id, nickname: p.nickname, connected: p.connected };
    }) as RoomState['seats'];
    const seated = new Set(
      this.seats
        .filter((s): s is Extract<SeatEntry, { kind: 'human' }> => s?.kind === 'human')
        .map((s) => s.token),
    );
    return {
      code: this.code,
      phase: this.phase,
      gameId: this.gameId,
      seats,
      spectators: [...this.players.values()]
        .filter((p) => !seated.has(p.token) && p.connected)
        .map((p) => ({ playerId: p.id, nickname: p.nickname })),
      hostId: 'p2p-host',
    };
  }

  private broadcast(): void {
    const room = this.roomState();
    this.cb.onRoom(room);
    for (const p of this.players.values()) {
      if (p.conn?.open === true) send(p.conn, { t: 'room', room });
    }
  }

  private broadcastGame(): void {
    if (this.game === null) return;
    for (const p of this.players.values()) this.sendGameTo(p);
  }

  private sendGameTo(player: P2PPlayer): void {
    if (this.game === null) return;
    const view = this.engine.viewFor(this.game, this.seatOf(player.token)) as GameView;
    if (player.conn === null) this.cb.onView(view);
    else if (player.conn.open) send(player.conn, { t: 'view', view });
  }

  // ---- helpers ---------------------------------------------------------------

  private seatOf(token: string): number | null {
    for (let i = 0; i < this.seats.length; i++) {
      const entry = this.seats[i];
      if (entry?.kind === 'human' && entry.token === token) return i;
    }
    return null;
  }

  private freeBotName(): string {
    return pickBotName(
      this.seats
        .filter((s): s is Extract<SeatEntry, { kind: 'bot' }> => s?.kind === 'bot')
        .map((s) => s.name),
      this.botRng,
    );
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const t of this.lobbyGrace.values()) clearTimeout(t);
    this.lobbyGrace.clear();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.peer?.destroy();
    this.peer = null;
  }
}

function send(conn: DataConnection, msg: HostToGuest): void {
  conn.send(msg);
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < P2P_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
