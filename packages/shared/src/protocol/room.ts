export type RoomPhase = 'lobby' | 'inGame';

export type GameId = 'game304' | 'laddis' | 'badam7';

export const GAME_NAMES: Record<GameId, string> = {
  game304: '304 (hidden partner)',
  laddis: 'Laddis',
  badam7: 'Badam 7',
};

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
  gameId: GameId;
  /** One slot per seat; length varies by game (4 for 304/Laddis, up to 8 for Badam 7). */
  seats: (SeatInfo | null)[];
  spectators: SpectatorInfo[];
  hostId: string;
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS_PER_ROOM = 8;
