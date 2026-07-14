import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  actingSeat,
  applyAction,
  cardPoints,
  initDeal,
  makeRng,
  matchWinner,
  redactFor,
  bot304,
  MAX_PLAYERS_PER_ROOM,
} from '@icg/shared';
import type {
  Action304,
  ClientToServerEvents,
  Game304State,
  GameEvent,
  RoomState,
  Rng,
  Seat,
  SeatInfo,
  ServerToClientEvents,
} from '@icg/shared';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const BOT_NAMES = ['Bot Chandu', 'Bot Meena', 'Bot Raju', 'Bot Lakshmi'];
const BOT_DELAY_MS = () => 600 + Math.floor(Math.random() * 600);
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
  seats: [SeatEntry | null, SeatEntry | null, SeatEntry | null, SeatEntry | null] = [
    null,
    null,
    null,
    null,
  ];
  phase: 'lobby' | 'inGame' = 'lobby';
  game: Game304State | null = null;
  /** Wall-clock ms since every human disconnected, for garbage collection. */
  emptySince: number | null = null;

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

  seatOf(token: string): Seat | null {
    for (let i = 0; i < 4; i++) {
      const entry = this.seats[i];
      if (entry?.kind === 'human' && entry.token === token) return i as Seat;
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

  takeSeat(token: string, seat: Seat): void {
    this.assertLobby();
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

  addBot(token: string, seat: Seat): void {
    this.assertLobby();
    this.assertHost(token);
    if (this.seats[seat] !== null) throw new RoomError('seat is taken');
    const used = new Set(
      this.seats.filter((s): s is Extract<SeatEntry, { kind: 'bot' }> => s?.kind === 'bot').map((s) => s.name),
    );
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${seat}`;
    this.seats[seat] = { kind: 'bot', name };
    this.broadcast();
  }

  removeBot(token: string, seat: Seat): void {
    this.assertLobby();
    this.assertHost(token);
    if (this.seats[seat]?.kind !== 'bot') throw new RoomError('no bot on that seat');
    this.seats[seat] = null;
    this.broadcast();
  }

  start(token: string): void {
    this.assertLobby();
    this.assertHost(token);
    for (let i = 0; i < 4; i++) {
      if (this.seats[i] === null) this.addBotToSeat(i as Seat);
    }
    this.phase = 'inGame';
    this.game = initDeal({
      matchScore: [0, 0],
      dealer: 0,
      seed: randomUUID(),
      dealNumber: 1,
    });
    this.broadcast();
    this.broadcastGame();
    this.reschedule();
  }

  private addBotToSeat(seat: Seat): void {
    const used = new Set(
      this.seats.filter((s): s is Extract<SeatEntry, { kind: 'bot' }> => s?.kind === 'bot').map((s) => s.name),
    );
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${seat}`;
    this.seats[seat] = { kind: 'bot', name };
  }

  toLobby(token: string): void {
    this.assertHost(token);
    this.phase = 'lobby';
    this.game = null;
    this.clearTimer();
    this.broadcast();
  }

  // ---- game actions -----------------------------------------------------

  handleAction(token: string, action: Action304): void {
    if (this.phase !== 'inGame' || this.game === null) throw new RoomError('no game in progress');
    const seat = this.seatOf(token);
    if (seat === null) throw new RoomError('you are spectating this game');
    if (action.seat !== seat) throw new RoomError('cannot act for another seat');
    this.applyAndBroadcast(action);
  }

  private applyAndBroadcast(action: Action304): void {
    const prev = this.game!;
    const next = applyAction(prev, action);
    this.game = next;
    for (const event of deriveEvents(prev, next)) {
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

    if (game.phase === 'matchOver') {
      this.timer = setTimeout(() => {
        this.phase = 'lobby';
        this.game = null;
        this.broadcast();
      }, MATCH_OVER_AUTO_MS);
      return;
    }
    if (game.phase === 'dealOver') {
      this.timer = setTimeout(() => this.applyAndBroadcast({ type: 'nextDeal', seat: 0 }), DEAL_OVER_AUTO_MS);
      return;
    }

    const seat = actingSeat(game);
    if (seat === null) return;
    const entry = this.seats[seat];
    if (entry === null) return;
    if (entry.kind === 'bot') {
      this.timer = setTimeout(() => this.playBotMove(seat), BOT_DELAY_MS());
      return;
    }
    const player = this.players.get(entry.token);
    if (player !== undefined && !player.connected) {
      this.timer = setTimeout(() => this.playBotMove(seat), DISCONNECT_GRACE_MS);
    }
  }

  private playBotMove(seat: Seat): void {
    if (this.phase !== 'inGame' || this.game === null) return;
    if (actingSeat(this.game) !== seat) return;
    try {
      // Bots get the same redacted view a human at that seat would.
      const view = redactFor(this.game, seat);
      const action = bot304.chooseAction(view, this.botRng);
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
      gameId: 'game304',
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
    const view = redactFor(this.game, this.seatOf(player.token));
    this.io.to(player.socketId).emit('game:view', view);
  }

  // ---- guards ------------------------------------------------------------

  private assertLobby(): void {
    if (this.phase !== 'lobby') throw new RoomError('not in the lobby');
  }

  private assertHost(token: string): void {
    if (token !== this.hostToken) throw new RoomError('only the host can do that');
  }
}

export class RoomError extends Error {}

function deriveEvents(prev: Game304State, next: Game304State): GameEvent[] {
  const events: GameEvent[] = [];
  if (
    next.lastTrickWinner !== null &&
    next.lastTrick !== null &&
    next.dealNumber === prev.dealNumber &&
    (prev.lastTrick === null || next.tricksTaken !== prev.tricksTaken) &&
    next.trick.length === 0 &&
    prev.trick.length === 3
  ) {
    events.push({
      type: 'trickWon',
      seat: next.lastTrickWinner,
      points: next.lastTrick.reduce((s, p) => s + cardPoints(p.card), 0),
    });
  }
  if (prev.trump !== null && !prev.trump.revealed && next.trump?.revealed === true) {
    events.push({ type: 'trumpRevealed', suit: next.trump.suit });
  }
  if (prev.dealResult === null && next.dealResult !== null) {
    events.push({ type: 'dealScored', result: next.dealResult });
  }
  if (next.phase === 'matchOver' && prev.phase !== 'matchOver') {
    const winner = matchWinner(next.matchScore);
    if (winner !== null) events.push({ type: 'matchOver', winner });
  }
  return events;
}
