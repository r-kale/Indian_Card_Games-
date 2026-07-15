import { engines, makeRng, pickBotName } from '@icg/shared';
import type {
  AnyGameEngine,
  GameAction,
  GameEvent,
  GameId,
  GameView,
  RoomState,
  SeatInfo,
} from '@icg/shared';

/**
 * A complete game running entirely in the browser: you at seat 0 against
 * bots (three by default; Badam 7 tables can go up to eight players).
 * Powers the offline mode of static (GitHub Pages) deployments — same
 * engines, same redacted views, no server involved.
 */
export class LocalGame {
  private state: unknown;
  private readonly engine: AnyGameEngine;
  private readonly rng = makeRng(`local-${Date.now()}-${Math.random()}`);
  private readonly botNames: string[] = [];
  private readonly players: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly nickname: string,
    private readonly gameId: GameId,
    private readonly onView: (view: GameView) => void,
    players = 4,
    private readonly onEvent: (event: GameEvent) => void = () => {},
  ) {
    this.engine = engines[gameId];
    this.players = Math.min(Math.max(players, this.engine.minSeats), this.engine.maxSeats);
    for (let i = 1; i < this.players; i++) {
      this.botNames.push(pickBotName(this.botNames, this.rng));
    }
    this.state = this.engine.init({
      seed: `local-${Date.now()}-${Math.random()}`,
      hostSeat: 0,
      players: this.players,
    });
  }

  start(): void {
    this.emit();
    this.schedule();
  }

  roomState(): RoomState {
    const seats: (SeatInfo | null)[] = [
      { kind: 'human', playerId: 'local-you', nickname: this.nickname, connected: true },
      ...this.botNames.map(
        (name): SeatInfo => ({ kind: 'bot', playerId: null, nickname: name, connected: true }),
      ),
    ];
    return {
      code: 'SOLO',
      phase: 'inGame',
      gameId: this.gameId,
      seats,
      spectators: [],
      hostId: 'local-you',
    };
  }

  dispatch(action: GameAction): void {
    const prev = this.state;
    this.state = this.engine.apply(prev, action);
    for (const event of this.engine.deriveEvents(prev, this.state) as GameEvent[]) {
      this.onEvent(event);
    }
    this.emit();
    this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.destroy();
    if (this.engine.phaseKind(this.state) !== 'acting') return; // human advances rounds
    const seat = this.engine.actingSeat(this.state);
    if (seat === null || seat === 0) return; // the human is on the clock
    this.timer = setTimeout(
      () => this.playBot(seat),
      this.engine.newTrickPause(this.state)
        ? 2300 + Math.random() * 400
        : (this.engine.botDelayMs?.() ?? 500 + Math.random() * 500),
    );
  }

  private playBot(seat: number): void {
    if (this.engine.actingSeat(this.state) !== seat) return;
    const view: unknown = this.engine.viewFor(this.state, seat);
    this.dispatch(this.engine.botAction(view, this.rng) as GameAction);
  }

  private emit(): void {
    this.onView(this.engine.viewFor(this.state, 0) as GameView);
  }
}
