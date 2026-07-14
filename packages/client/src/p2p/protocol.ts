import type { GameAction, GameEvent, GameView, RoomState, Seat } from '@icg/shared';

/**
 * Message protocol between a guest browser and the host browser over a
 * PeerJS/WebRTC data channel. Mirrors the Socket.IO protocol: guests send
 * intents, the host validates and pushes redacted state.
 */
export type GuestToHost =
  | { t: 'hello'; nickname: string; token?: string }
  | { t: 'takeSeat'; seat: Seat }
  | { t: 'leaveSeat' }
  | { t: 'action'; action: GameAction };

export type HostToGuest =
  | { t: 'welcome'; playerId: string; token: string }
  | { t: 'room'; room: RoomState }
  | { t: 'view'; view: GameView }
  | { t: 'event'; event: GameEvent }
  | { t: 'error'; message: string }
  | { t: 'rejected'; reason: string }
  | { t: 'ping' };

/** Host pings every HEARTBEAT_MS; a guest that hears nothing for
 *  HEARTBEAT_TIMEOUT_MS treats the room as gone (WebRTC close events can
 *  take minutes to fire when a tab dies). */
export const HEARTBEAT_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 15_000;

export const P2P_CODE_LENGTH = 6;

/** Namespaced PeerJS id so random codes cannot collide with other apps. */
export function peerIdForCode(code: string): string {
  return `icg-304-${code.toLowerCase()}`;
}

/**
 * Optional self-hosted PeerJS broker via ?srv=host:port (same convention as
 * the beer game); defaults to the free public PeerJS cloud broker, which only
 * introduces peers — game data flows browser-to-browser.
 */
export function peerOptions(): Record<string, unknown> {
  const srv = new URLSearchParams(window.location.search).get('srv');
  if (srv === null) return {};
  const [host, port] = srv.split(':');
  const local = srv.startsWith('localhost') || srv.startsWith('127.');
  return { host, port: Number(port) || 443, path: '/', key: 'peerjs', secure: !local };
}
