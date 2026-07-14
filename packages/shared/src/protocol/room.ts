export type RoomPhase = 'lobby' | 'inGame';

export interface SeatInfo {
  kind: 'human' | 'bot';
  /** Public player id (not the secret session token). Bots have no id. */
  playerId: string | null;
  nickname: string;
  connected: boolean;
}

export interface SpectatorInfo {
  playerId: string;
  nickname: string;
}

/** Lobby snapshot broadcast to everyone in a room. */
export interface RoomState {
  code: string;
  phase: RoomPhase;
  gameId: 'game304';
  seats: [SeatInfo | null, SeatInfo | null, SeatInfo | null, SeatInfo | null];
  spectators: SpectatorInfo[];
  hostId: string;
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS_PER_ROOM = 8;
