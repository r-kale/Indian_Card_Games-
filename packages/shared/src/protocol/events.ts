import type { Card } from '../core/cards';
import type { Action304, DealResult, Player304View, Seat } from '../games/game304/types';
import type { RoomState } from './room';

export type Ack<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };
export type AckFn<T = Record<never, never>> = (result: Ack<T>) => void;

/** Ephemeral cues for animations and toasts; state lives in game:view. */
export type GameEvent =
  | { type: 'trickWon'; seat: Seat; points: number }
  | { type: 'partnerRevealed'; seat: Seat; card: Card; alliance: 'allied' | 'lone' }
  | { type: 'dealScored'; result: DealResult }
  | { type: 'matchOver'; winners: Seat[] };

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string }, ack: AckFn<{ roomCode: string; token: string; playerId: string }>) => void;
  'room:join': (p: { roomCode: string; nickname: string }, ack: AckFn<{ token: string; playerId: string }>) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: AckFn<{ playerId: string; nickname: string }>) => void;
  'lobby:takeSeat': (p: { seat: Seat }, ack: AckFn) => void;
  'lobby:leaveSeat': (ack: AckFn) => void;
  'lobby:addBot': (p: { seat: Seat; name?: string }, ack: AckFn) => void;
  'lobby:removeBot': (p: { seat: Seat }, ack: AckFn) => void;
  'lobby:start': (ack: AckFn) => void;
  'game:action': (p: { action: Action304 }, ack: AckFn) => void;
  'room:toLobby': (ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: RoomState) => void;
  'game:view': (p: Player304View) => void;
  'game:event': (p: GameEvent) => void;
  'room:error': (p: { code: string; message: string }) => void;
}
