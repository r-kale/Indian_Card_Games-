import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@icg/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Singleton connection; Vite proxies /socket.io to the game server in dev. */
export const socket: GameSocket = io({ transports: ['websocket', 'polling'] });
