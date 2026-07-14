import { engines, makeRng } from '@icg/shared';
import type { AnyGameEngine, GameAction, GameId, GameView, RoomState } from '@icg/shared';

const BOT_NAMES = ['Bot Chandu', 'Bot Meena', 'Bot Raju'];

/**
 * A complete game running entirely in the browser: you at seat 0 against
 * three bots. Powers the offline mode of static (GitHub Pages) deployments —
 * same engines, same redacted views, no server involved.
 */
export class LocalGame {
  private state: unknown;
  private readonly engine: AnyGameEngine;
  private readonly rng = makeRng(`local-${Date.now()}-${Math.random()}`);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly nickname: string,
    private readonly gameId: GameId,
    private readonly onView: (view: GameView) => void,
  ) {
    this.engine = engines[gameId];
    this.state = this.engine.init({
      seed: `local-${Date.now()}-${Math.random()}`,
      hostSeat: 0,
    });
  }

  start(): void {
    this.emit();
    this.schedule();
  }

  roomState(): RoomState {
    return {
      code: 'SOLO',
      phase: 'inGame',
      gameId: this.gameId,
      seats: [
        { kind: 'human', playerId: 'local-you', nickname: this.nickname, connected: true },
        { kind: 'bot', playerId: null, nickname: BOT_NAMES[0]!, connected: true },
        { kind: 'bot', playerId: null, nickname: BOT_NAMES[1]!, connected: true },
        { kind: 'bot', playerId: null, nickname: BOT_NAMES[2]!, connected: true },
      ],
      spectators: [],
      hostId: 'local-you',
    };
  }

  dispatch(action: GameAction): void {
    this.state = this.engine.apply(this.state, action);
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
      this.engine.newTrickPause(this.state) ? 2300 + Math.random() * 400 : 500 + Math.random() * 500,
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
