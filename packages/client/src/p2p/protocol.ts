import type { GameAction, GameEvent, GameView, RoomState } from '@icg/shared';

/**
 * Message protocol between a guest browser and the host browser over a
 * PeerJS/WebRTC data channel. Mirrors the Socket.IO protocol: guests send
 * intents, the host validates and pushes redacted state.
 */
export type GuestToHost =
  | { t: 'hello'; nickname: string; token?: string }
  | { t: 'takeSeat'; seat: number }
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
 * STUN finds a direct path between the two browsers; the TURN entries are a
 * relay of last resort for when no direct path exists (strict NATs, Wi-Fi
 * routers with client isolation, in-app browsers) — without a working relay
 * those joins simply time out. Several free public relays are listed since
 * none is perfectly reliable; ICE races them all and uses whatever answers.
 * A dedicated relay (e.g. a free metered.ca account key, domain-locked) can
 * be baked in at build time via VITE_TURN_URL/USERNAME/CREDENTIAL and is
 * tried first.
 */
function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_TURN_URL) {
    servers.push({
      urls: env.VITE_TURN_URL.split(',').map((u) => u.trim()),
      username: env.VITE_TURN_USERNAME ?? '',
      credential: env.VITE_TURN_CREDENTIAL ?? '',
    });
  }
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: ['turn:freeturn.net:3478', 'turn:freeturn.net:5349'],
      username: 'free',
      credential: 'free',
    },
  );
  return servers;
}

/**
 * Optional self-hosted PeerJS broker via ?srv=host:port (same convention as
 * the beer game); defaults to the free public PeerJS cloud broker, which only
 * introduces peers — game data flows browser-to-browser (or via TURN relay).
 */
export function peerOptions(): Record<string, unknown> {
  const iceConfig = { config: { iceServers: iceServers() } };
  const srv = new URLSearchParams(window.location.search).get('srv');
  if (srv === null) return iceConfig;
  const [host, port] = srv.split(':');
  const local = srv.startsWith('localhost') || srv.startsWith('127.');
  return {
    host,
    port: Number(port) || 443,
    path: '/',
    key: 'peerjs',
    secure: !local,
    ...iceConfig,
  };
}
