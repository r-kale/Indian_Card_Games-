import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@icg/shared';
import { Room, RoomError } from './room';
import type { IoServer } from './room';

const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const GC_INTERVAL_MS = 60 * 1000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** session token -> room code, for reconnection. */
  private readonly sessions = new Map<string, string>();

  constructor(private readonly io: IoServer) {
    setInterval(() => this.collectGarbage(), GC_INTERVAL_MS).unref();
  }

  createRoom(): Room {
    let code: string;
    do {
      code = this.randomCode();
    } while (this.rooms.has(code));
    const room = new Room(this.io, code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (room === undefined) throw new RoomError('no such room');
    return room;
  }

  registerSession(token: string, roomCode: string): void {
    this.sessions.set(token, roomCode);
  }

  roomForToken(token: string): Room | null {
    const code = this.sessions.get(token);
    return code !== undefined ? (this.rooms.get(code) ?? null) : null;
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  private collectGarbage(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        room.destroy();
        this.rooms.delete(code);
        for (const token of room.players.keys()) this.sessions.delete(token);
      }
    }
  }
}
