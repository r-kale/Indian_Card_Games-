import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@icg/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Singleton connection. In dev, Vite proxies /socket.io to the game server.
 * Static deployments (GitHub Pages) can point at a hosted server by setting
 * VITE_SERVER_URL at build time; without one, online play stays disabled and
 * the offline vs-bots mode carries the app.
 */
const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

export const socket: GameSocket = serverUrl
  ? io(serverUrl, { transports: ['websocket', 'polling'] })
  : io({ transports: ['websocket', 'polling'] });
