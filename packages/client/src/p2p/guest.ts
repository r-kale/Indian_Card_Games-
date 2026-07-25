import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameAction, GameEvent, GameView, RoomState } from '@icg/shared';
import {
  backoffDelay,
  GUEST_REDIAL_ATTEMPTS,
  HEARTBEAT_TIMEOUT_MS,
  peerIdForCode,
  peerOptions,
} from './protocol';
import type { GuestToHost, HostToGuest } from './protocol';

const CONNECT_TIMEOUT_MS = 15_000; // TURN relay negotiation can take a while

export interface GuestCallbacks {
  onRoom: (room: RoomState) => void;
  onView: (view: GameView) => void;
  onEvent: (event: GameEvent) => void;
  onError: (message: string) => void;
  /** A drop was detected; an automatic re-dial (attempt n) is starting. */
  onReconnecting: (attempt: number) => void;
  /** The automatic re-dial succeeded; the host restored our identity. */
  onReconnected: () => void;
  /** The host closed the room, or reconnection gave up for good. */
  onClosed: (reason: string) => void;
}

/** The host refused us (room full, etc.) — retrying is pointless. */
class RejectedError extends Error {}

/**
 * A guest's connection to a host browser's P2P room. Drops (backgrounded
 * phones, network switches) trigger automatic re-dials that reclaim the
 * same identity via the session token, instead of evicting the player.
 */
export class P2PGuest {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;
  private welcomed = false;
  private reconnecting = false;
  private lastHeard = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private code = '';
  private nickname = '';
  private token: string | undefined;

  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.closed) return;
    // Fresh grace on resume: the timers were suspended, silence was expected.
    this.lastHeard = Date.now();
    if (this.welcomed && this.conn?.open !== true) {
      void this.tryReconnect('lost connection to the host');
    }
  };

  constructor(private readonly cb: GuestCallbacks) {}

  /** Resolves once the host has welcomed us; rejects on timeout or refusal.
   *  A stored token reclaims a previous identity (same seat) after a drop. */
  connect(
    code: string,
    nickname: string,
    token?: string,
  ): Promise<{ playerId: string; token: string }> {
    this.code = code;
    this.nickname = nickname;
    this.token = token;
    document.addEventListener('visibilitychange', this.onVisibility);
    return this.dial();
  }

  /** One full broker + data-channel dial using the stored code/nickname/token. */
  private dial(): Promise<{ playerId: string; token: string }> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      // Track how far the handshake got, so the timeout can say what failed.
      let brokerReached = false;
      let channelOpened = false;
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      };
      const timeout = setTimeout(() => {
        if (!brokerReached) {
          fail(
            new Error(
              'could not reach the P2P broker — a firewall or this network may block it; try another network',
            ),
          );
        } else if (!channelOpened) {
          fail(
            new Error(
              'found the room but could not open a connection to the host — try again; open the link in Safari/Chrome (not inside WhatsApp), and if you are on Wi-Fi try mobile data (some routers block device-to-device play)',
            ),
          );
        } else {
          fail(new Error('the host did not respond — ask them to check their tab is open'));
        }
      }, CONNECT_TIMEOUT_MS);

      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') {
          fail(
            new Error(
              "no P2P room with that code — the room pauses while the host's screen is off; ask them to open the game tab and try again",
            ),
          );
        }
      });
      peer.on('disconnected', () => {
        // Broker socket lost after we registered: harmless post-handshake,
        // but keep it alive so future re-dials are fast.
        if (!this.closed && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            /* ignore */
          }
        }
      });

      peer.on('open', () => {
        brokerReached = true;
        const conn = peer.connect(peerIdForCode(this.code), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          channelOpened = true;
          conn.send({ t: 'hello', nickname: this.nickname, token: this.token } satisfies GuestToHost);
          this.lastHeard = Date.now();
          this.startWatchdog();
        });
        conn.on('data', (raw) => {
          const msg = raw as HostToGuest;
          this.lastHeard = Date.now();
          switch (msg.t) {
            case 'ping':
              if (conn.open) conn.send({ t: 'pong' } satisfies GuestToHost);
              break;
            case 'welcome':
              this.welcomed = true;
              this.token = msg.token;
              if (!settled) {
                settled = true;
                clearTimeout(timeout);
                resolve({ playerId: msg.playerId, token: msg.token });
              }
              break;
            case 'rejected':
              fail(new RejectedError(msg.reason));
              this.destroyPeerOnly();
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
        conn.on('close', () => this.onConnDown(settled, fail));
        conn.on('error', () => this.onConnDown(settled, fail));
      });
    });
  }

  /** A live data channel died: re-dial if we ever got in; else fail the dial. */
  private onConnDown(settled: boolean, fail: (err: Error) => void): void {
    if (this.closed) return;
    if (this.welcomed) {
      void this.tryReconnect('lost connection to the host');
    } else if (!settled) {
      fail(new Error('the connection to the host dropped during the handshake — try again'));
    }
  }

  private startWatchdog(): void {
    if (this.watchdog !== null) return;
    this.watchdog = setInterval(() => {
      if (this.closed || this.reconnecting) return;
      // A hidden tab hears nothing by design — judge only while visible.
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - this.lastHeard > HEARTBEAT_TIMEOUT_MS) {
        void this.tryReconnect('lost connection to the host');
      }
    }, 2_000);
  }

  /** Automatic re-dials with backoff; the token reclaims our seat. */
  private async tryReconnect(reason: string): Promise<void> {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    this.destroyPeerOnly();
    for (let attempt = 1; attempt <= GUEST_REDIAL_ATTEMPTS; attempt++) {
      this.cb.onReconnecting(attempt);
      await new Promise((r) => setTimeout(r, backoffDelay(attempt - 1)));
      if (this.closed) return;
      try {
        await this.dial();
        this.reconnecting = false;
        // The host's reclaim already re-sent the room and our view.
        this.cb.onReconnected();
        return;
      } catch (err) {
        this.destroyPeerOnly();
        if (err instanceof RejectedError) {
          reason = err.message;
          break;
        }
      }
    }
    this.reconnecting = false;
    if (this.closed) return;
    this.cb.onClosed(`${reason} — could not reconnect`);
    this.destroy();
  }

  /** Tear down the transport without ending the session (for re-dials). */
  private destroyPeerOnly(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
    this.conn = null;
  }

  takeSeat(seat: number): void {
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
    else if (this.reconnecting) this.cb.onError('reconnecting to the host — try again in a moment');
    else this.cb.onError('not connected to the host');
  }

  destroy(): void {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.destroyPeerOnly();
  }
}
