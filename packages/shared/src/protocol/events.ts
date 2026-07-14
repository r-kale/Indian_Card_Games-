import type { Card, Suit } from '../core/cards';
import type { Action304, DealResult, Player304View, Seat } from '../games/game304/types';
import type { BadamAction, BadamRoundResult, BadamView } from '../games/badam7/types';
import type { LaddisAction, LaddisView, RoundResult } from '../games/laddis/types';
import type { GameId, RoomState } from './room';

export type Ack<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };
export type AckFn<T = Record<never, never>> = (result: Ack<T>) => void;

/** Any game's action/view travelling over the wire. */
export type GameAction = Action304 | LaddisAction | BadamAction;
export type GameView = Player304View | LaddisView | BadamView;

/** Ephemeral cues for animations and toasts; state lives in game:view. */
export type GameEvent =
  | { type: 'trickWon'; seat: Seat; points: number }
  | { type: 'partnerRevealed'; seat: Seat; card: Card; alliance: 'allied' | 'lone' }
  | { type: 'dealScored'; result: DealResult }
  | { type: 'matchOver'; winners: Seat[] }
  | { type: 'vakhaaiCalled'; seat: Seat; bet: number }
  | { type: 'sixCalled'; seat: Seat }
  | { type: 'hukumRevealed'; suit: Suit; caller: Seat }
  | { type: 'roundScored'; result: RoundResult }
  | { type: 'badamPassed'; seat: number }
  | { type: 'badamRoundScored'; result: BadamRoundResult };

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string }, ack: AckFn<{ roomCode: string; token: string; playerId: string }>) => void;
  'room:join': (p: { roomCode: string; nickname: string }, ack: AckFn<{ token: string; playerId: string }>) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: AckFn<{ playerId: string; nickname: string }>) => void;
  'lobby:takeSeat': (p: { seat: number }, ack: AckFn) => void;
  'lobby:leaveSeat': (ack: AckFn) => void;
  'lobby:addBot': (p: { seat: number; name?: string }, ack: AckFn) => void;
  'lobby:removeBot': (p: { seat: number }, ack: AckFn) => void;
  'lobby:setGame': (p: { gameId: GameId }, ack: AckFn) => void;
  'lobby:start': (ack: AckFn) => void;
  'game:action': (p: { action: GameAction }, ack: AckFn) => void;
  'room:toLobby': (ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: RoomState) => void;
  'game:view': (p: GameView) => void;
  'game:event': (p: GameEvent) => void;
  'room:error': (p: { code: string; message: string }) => void;
}
