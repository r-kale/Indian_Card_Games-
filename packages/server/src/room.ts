import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { engines, makeRng, MAX_PLAYERS_PER_ROOM } from '@icg/shared';
import type {
  AnyGameEngine,
  ClientToServerEvents,
  GameAction,
  GameId,
  RoomState,
  Rng,
  SeatInfo,
  ServerToClientEvents,
} from '@icg/shared';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const BOT_NAMES = [
  'Bot Chandu',
  'Bot Meena',
  'Bot Raju',
  'Bot Lakshmi',
  'Bot Ganpat',
  'Bot Shalu',
  'Bot Pinky',
  'Bot Bablu',
];
const BOT_DELAY_MS = () => 600 + Math.floor(Math.random() * 600);
/** Extra thinking time before the first card of a new trick, so the finished
 *  trick stays on the table long enough for everyone to see it. */
const NEW_TRICK_DELAY_MS = () => 2300 + Math.floor(Math.random() * 400);
const DISCONNECT_GRACE_MS = 30_000;
const DEAL_OVER_AUTO_MS = 12_000;
const MATCH_OVER_AUTO_MS = 20_000;

export interface HumanPlayer {
  token: string;
  id: string;
  nickname: string;
  connected: boolean;
  socketId: string | null;
}

type SeatEntry = { kind: 'human'; token: string } | { kind: 'bot'; name: string };

export class Room {
  readonly code: string;
  /** Session token of the room creator; set right after the host joins. */
  hostToken = '';
  readonly players = new Map<string, HumanPlayer>();
  seats: (SeatEntry | null)[] = [null, null, null, null];
  phase: 'lobby' | 'inGame' = 'lobby';
  gameId: GameId = 'game304';
  game: unknown = null;
  /** Wall-clock ms since every human disconnected, for garbage collection. */
  emptySince: number | null = null;

  private get engine(): AnyGameEngine {
    return engines[this.gameId];
  }

  /** In the lobby, show one slot per possible seat for the selected game. */
  private resizeSeats(): void {
    const size = this.engine.maxSeats;
    while (this.seats.length > size) this.seats.pop();
    while (this.seats.length < size) this.seats.push(null);
  }

  private readonly io: IoServer;
  private readonly botRng: Rng;
  private timer: NodeJS.Timeout | null = null;

  constructor(io: IoServer, code: string) {
    this.io = io;
    this.code = code;
    this.botRng = makeRng(`${code}:${randomUUID()}`);
  }

  // ---- membership -------------------------------------------------------

  addPlayer(nickname: string): HumanPlayer {
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new RoomError('room is full (8 players max)');
    }
    const player: HumanPlayer = {
      token: randomUUID(),
      id: randomUUID().slice(0, 8),
      nickname: nickname.trim().slice(0, 24) || 'Player',
      connected: true,
      socketId: null,
    };
    this.players.set(player.token, player);
    return player;
  }

  seatOf(token: string): number | null {
    for (let i = 0; i < this.seats.length; i++) {
      const entry = this.seats[i];
      if (entry?.kind === 'human' && entry.token === token) return i;
    }
    return null;
  }

  connect(token: string, socketId: string): HumanPlayer {
    const player = this.players.get(token);
    if (player === undefined) throw new RoomError('unknown session for this room');
    player.connected = true;
    player.socketId = socketId;
    this.emptySince = null;
    this.reschedule();
    return player;
  }

  disconnect(token: string): void {
    const player = this.players.get(token);
    if (player === undefined) return;
    player.connected = false;
    player.socketId = null;
    if (![...this.players.values()].some((p) => p.connected)) {
      this.emptySince = Date.now();
    }
    this.reschedule();
    this.broadcast();
  }

  // ---- lobby actions ----------------------------------------------------

  takeSeat(token: string, seat: number): void {
    this.assertLobby();
    this.assertSeatIndex(seat);
    if (this.seats[seat] !== null) throw new RoomError('seat is taken');
    const current = this.seatOf(token);
    if (current !== null) this.seats[current] = null;
    this.seats[seat] = { kind: 'human', token };
    this.broadcast();
  }

  leaveSeat(token: string): void {
    this.assertLobby();
    const current = this.seatOf(token);
    if (current !== null) this.seats[current] = null;
    this.broadcast();
  }

  addBot(token: string, seat: number, name?: string): void {
    this.assertLobby();
    this.assertHost(token);
    this.assertSeatIndex(seat);
    if (this.seats[seat] !== null) throw new RoomError('seat is taken');
    const custom = name?.trim().slice(0, 20);
    this.seats[seat] = { kind: 'bot', name: custom || this.defaultBotName(seat) };
    this.broadcast();
  }

  private defaultBotName(seat: number): string {
    const used = new Set(
      this.seats
        .filter((s): s is Extract<SeatEntry, { kind: 'bot' }> => s?.kind === 'bot')
        .map((s) => s.name),
    );
    return BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${seat}`;
  }

  removeBot(token: string, seat: number): void {
    this.assertLobby();
    this.assertHost(token);
    if (this.seats[seat]?.kind !== 'bot') throw new RoomError('no bot on that seat');
    this.seats[seat] = null;
    this.broadcast();
  }

  setGame(token: string, gameId: GameId): void {
    this.assertLobby();
    this.assertHost(token);
    if (!(gameId in engines)) throw new RoomError('unknown game');
    this.gameId = gameId;
    this.resizeSeats();
    this.broadcast();
  }

  /**
   * Fixed-size games fill every empty seat with a bot. Variable-size games
   * (Badam 7) play with whoever is seated: gaps close up, and fewer than four
   * seated players get bot company up to a table of four.
   */
  start(token: string): void {
    this.assertLobby();
    this.assertHost(token);
    if (this.engine.minSeats === this.engine.maxSeats) {
      for (let i = 0; i < this.seats.length; i++) {
        if (this.seats[i] === null) this.addBotToSeat(i);
      }
    } else {
      this.seats = this.seats.filter((s) => s !== null);
      while (this.seats.length < 4) this.addBotToSeat(this.seats.length);
    }
    this.phase = 'inGame';
    this.game = this.engine.init({
      seed: randomUUID(),
      hostSeat: this.seatOf(token) ?? 0,
      players: this.seats.length,
    });
    this.broadcast();
    this.broadcastGame();
    this.reschedule();
  }

  private addBotToSeat(seat: number): void {
    this.seats[seat] = { kind: 'bot', name: this.defaultBotName(seat) };
  }

  toLobby(token: string): void {
    this.assertHost(token);
    this.phase = 'lobby';
    this.game = null;
    this.resizeSeats();
    this.clearTimer();
    this.broadcast();
  }

  // ---- game actions -----------------------------------------------------

  handleAction(token: string, action: GameAction): void {
    if (this.phase !== 'inGame' || this.game === null) throw new RoomError('no game in progress');
    const seat = this.seatOf(token);
    if (seat === null) throw new RoomError('you are spectating this game');
    if (action.seat !== seat) throw new RoomError('cannot act for another seat');
    if (this.engine.hostOnly(action)) this.assertHost(token);
    this.applyAndBroadcast(action);
  }

  private applyAndBroadcast(action: GameAction): void {
    const prev = this.game!;
    const next: unknown = this.engine.apply(prev, action);
    this.game = next;
    for (const event of this.engine.deriveEvents(prev, next)) {
      this.io.to(this.code).emit('game:event', event);
    }
    this.broadcastGame();
    this.reschedule();
  }

  // ---- bot / timer driver ----------------------------------------------

  /**
   * Recompute the room's single pending timer from current state: bots act
   * after a short "thinking" delay, disconnected humans are played for after
   * a grace period, and finished deals advance on their own.
   */
  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'inGame' || this.game === null) return;
    const game = this.game;
    const kind = this.engine.phaseKind(game);

    if (kind === 'matchOver') {
      this.timer = setTimeout(() => {
        this.phase = 'lobby';
        this.game = null;
        this.broadcast();
      }, MATCH_OVER_AUTO_MS);
      return;
    }
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
        this.engine.newTrickPause(game) ? NEW_TRICK_DELAY_MS() : BOT_DELAY_MS(),
      );
      return;
    }
    const player = this.players.get(entry.token);
    if (player !== undefined && !player.connected) {
      this.timer = setTimeout(() => this.playBotMove(seat), DISCONNECT_GRACE_MS);
    }
  }

  private playBotMove(seat: number): void {
    if (this.phase !== 'inGame' || this.game === null) return;
    if (this.engine.actingSeat(this.game) !== seat) return;
    try {
      // Bots get the same redacted view a human at that seat would.
      const view: unknown = this.engine.viewFor(this.game, seat);
      const action = this.engine.botAction(view, this.botRng) as GameAction;
      this.applyAndBroadcast(action);
    } catch (err) {
      console.error(`[room ${this.code}] bot move failed:`, err);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.clearTimer();
  }

  // ---- broadcasting ------------------------------------------------------

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
      hostId: this.players.get(this.hostToken)?.id ?? '',
    };
  }

  broadcast(): void {
    this.io.to(this.code).emit('room:state', this.roomState());
  }

  /** Send each connected human their own redacted view (spectators get the blind view). */
  broadcastGame(): void {
    if (this.game === null) return;
    for (const player of this.players.values()) {
      if (!player.connected || player.socketId === null) continue;
      this.sendGameTo(player);
    }
  }

  sendGameTo(player: HumanPlayer): void {
    if (this.game === null || player.socketId === null) return;
    const view = this.engine.viewFor(this.game, this.seatOf(player.token)) as Parameters<
      ServerToClientEvents['game:view']
    >[0];
    this.io.to(player.socketId).emit('game:view', view);
  }

  // ---- guards ------------------------------------------------------------

  private assertLobby(): void {
    if (this.phase !== 'lobby') throw new RoomError('not in the lobby');
  }

  private assertSeatIndex(seat: number): void {
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.seats.length) {
      throw new RoomError('bad seat');
    }
  }

  private assertHost(token: string): void {
    if (token !== this.hostToken) throw new RoomError('only the host can do that');
  }
}

export class RoomError extends Error {}
