import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameAction, GameEvent, GameView, RoomState, Seat } from '@icg/shared';
import { HEARTBEAT_TIMEOUT_MS, peerIdForCode, peerOptions } from './protocol';
import type { GuestToHost, HostToGuest } from './protocol';

const CONNECT_TIMEOUT_MS = 10_000;

export interface GuestCallbacks {
  onRoom: (room: RoomState) => void;
  onView: (view: GameView) => void;
  onEvent: (event: GameEvent) => void;
  onError: (message: string) => void;
  /** The host closed the room or the connection dropped for good. */
  onClosed: (reason: string) => void;
}

/** A guest's connection to a host browser's P2P room. */
export class P2PGuest {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;
  private lastHeard = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly cb: GuestCallbacks) {}

  /** Resolves once the host has welcomed us; rejects on timeout or refusal. */
  connect(code: string, nickname: string): Promise<{ playerId: string; token: string }> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      const timeout = setTimeout(() => {
        this.destroy();
        reject(new Error('no P2P room with that code (is the host tab still open?)'));
      }, CONNECT_TIMEOUT_MS);

      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') {
          clearTimeout(timeout);
          this.destroy();
          reject(new Error('no P2P room with that code (is the host tab still open?)'));
        }
      });

      peer.on('open', () => {
        const conn = peer.connect(peerIdForCode(code), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          conn.send({ t: 'hello', nickname } satisfies GuestToHost);
          // Tab-death and network drops rarely fire 'close' promptly; a silent
          // host is a gone host.
          this.lastHeard = Date.now();
          this.watchdog = setInterval(() => {
            if (!this.closed && Date.now() - this.lastHeard > HEARTBEAT_TIMEOUT_MS) {
              this.cb.onClosed('lost connection to the host — room closed');
              this.destroy();
            }
          }, 2_000);
        });
        conn.on('data', (raw) => {
          const msg = raw as HostToGuest;
          this.lastHeard = Date.now();
          switch (msg.t) {
            case 'ping':
              break;
            case 'welcome':
              clearTimeout(timeout);
              resolve({ playerId: msg.playerId, token: msg.token });
              break;
            case 'rejected':
              clearTimeout(timeout);
              this.destroy();
              reject(new Error(msg.reason));
              break;
            case 'room':
              this.cb.onRoom(msg.room);
              break;
            case 'view':
              this.cb.onView(msg.view);
              break;
            case 'event':
              this.cb.onEvent(msg.event);
              break;
            case 'error':
              this.cb.onError(msg.message);
              break;
          }
        });
        conn.on('close', () => {
          if (!this.closed) this.cb.onClosed('the host left — room closed');
        });
        conn.on('error', () => {
          if (!this.closed) this.cb.onClosed('lost connection to the host');
        });
      });
    });
  }

  takeSeat(seat: Seat): void {
    this.send({ t: 'takeSeat', seat });
  }

  leaveSeat(): void {
    this.send({ t: 'leaveSeat' });
  }

  action(action: GameAction): void {
    this.send({ t: 'action', action });
  }

  private send(msg: GuestToHost): void {
    if (this.conn?.open === true) this.conn.send(msg);
    else this.cb.onError('not connected to the host');
  }

  destroy(): void {
    this.closed = true;
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.peer?.destroy();
    this.peer = null;
    this.conn = null;
  }
}
