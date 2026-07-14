import {
  actingSeat,
  applyAction,
  bot304,
  initDeal,
  makeRng,
  redactFor,
} from '@icg/shared';
import type { Action304, Game304State, Player304View, RoomState, Seat } from '@icg/shared';

const BOT_NAMES = ['Bot Chandu', 'Bot Meena', 'Bot Raju'];

/**
 * A complete 304 game running entirely in the browser: you at seat 0 against
 * three bots. Powers the offline mode of static (GitHub Pages) deployments —
 * same engine, same redacted views, no server involved.
 */
export class LocalGame {
  private state: Game304State;
  private readonly rng = makeRng(`local-${Date.now()}-${Math.random()}`);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly nickname: string,
    private readonly onView: (view: Player304View) => void,
  ) {
    this.state = initDeal({
      matchScore: [0, 0],
      dealer: 0,
      seed: `local-${Date.now()}-${Math.random()}`,
      dealNumber: 1,
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
      gameId: 'game304',
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

  dispatch(action: Action304): void {
    this.state = applyAction(this.state, action);
    this.emit();
    this.schedule();
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.destroy();
    if (this.state.phase === 'matchOver' || this.state.phase === 'dealOver') return;
    const seat = actingSeat(this.state);
    if (seat === null || seat === 0) return; // the human is on the clock
    this.timer = setTimeout(() => this.playBot(seat), 500 + Math.random() * 500);
  }

  private playBot(seat: Seat): void {
    if (actingSeat(this.state) !== seat) return;
    const view = redactFor(this.state, seat);
    this.dispatch(bot304.chooseAction(view, this.rng));
  }

  private emit(): void {
    this.onView(redactFor(this.state, 0));
  }
}
