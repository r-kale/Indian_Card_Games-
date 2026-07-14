import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Action304, GameEvent, Player304View, RoomState, Seat } from '@icg/shared';
import { LocalGame } from './localGame';
import { socket } from './socket';

export interface Session {
  roomCode: string;
  token: string;
  playerId: string;
}

export interface Toast {
  id: number;
  text: string;
}

export interface AppState {
  connected: boolean;
  /** 'local' = offline vs bots, entirely in the browser (GitHub Pages mode). */
  mode: 'online' | 'local';
  session: Session | null;
  /** True while we try to resume a stored session on page load. */
  resuming: boolean;
  roomState: RoomState | null;
  view: Player304View | null;
  toasts: Toast[];
  error: string | null;
}

type AppAction =
  | { type: 'connected'; connected: boolean }
  | { type: 'session'; session: Session | null }
  | { type: 'resuming'; resuming: boolean }
  | { type: 'roomState'; roomState: RoomState }
  | { type: 'view'; view: Player304View }
  | { type: 'toast'; toast: Toast }
  | { type: 'expireToast'; id: number }
  | { type: 'error'; error: string | null }
  | { type: 'localStarted'; session: Session; roomState: RoomState }
  | { type: 'leftRoom' };

const initial: AppState = {
  connected: false,
  mode: 'online',
  session: null,
  resuming: loadSession() !== null,
  roomState: null,
  view: null,
  toasts: [],
  error: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: action.connected };
    case 'session':
      return { ...state, session: action.session };
    case 'resuming':
      return { ...state, resuming: action.resuming };
    case 'roomState': {
      const next = { ...state, roomState: action.roomState };
      // Dropping back to the lobby invalidates any old game view.
      if (action.roomState.phase === 'lobby') next.view = null;
      return next;
    }
    case 'view':
      return { ...state, view: action.view };
    case 'toast':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };
    case 'expireToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'error':
      return { ...state, error: action.error };
    case 'localStarted':
      return {
        ...state,
        mode: 'local',
        session: action.session,
        roomState: action.roomState,
        view: null,
        error: null,
      };
    case 'leftRoom':
      return { ...state, mode: 'online', session: null, roomState: null, view: null };
  }
}

const SESSION_KEY = 'icg.session';
const NICKNAME_KEY = 'icg.nickname';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Session;
    return typeof parsed.roomCode === 'string' && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  if (session === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

let toastId = 0;

export interface StoreApi {
  state: AppState;
  createRoom: (nickname: string) => void;
  joinRoom: (roomCode: string, nickname: string) => void;
  startLocalGame: (nickname: string) => void;
  leaveRoom: () => void;
  takeSeat: (seat: Seat) => void;
  leaveSeat: () => void;
  addBot: (seat: Seat) => void;
  removeBot: (seat: Seat) => void;
  startGame: () => void;
  sendAction: (action: Action304) => void;
  toLobby: () => void;
  clearError: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const localGame = useRef<LocalGame | null>(null);

  useEffect(() => {
    const onConnect = () => {
      dispatch({ type: 'connected', connected: true });
      // Resume a stored session on every (re)connect, including page load.
      const stored = loadSession();
      if (stored !== null) {
        socket.emit('room:rejoin', { roomCode: stored.roomCode, token: stored.token }, (res) => {
          if (res.ok) {
            dispatch({ type: 'session', session: stored });
          } else {
            saveSession(null);
            dispatch({ type: 'session', session: null });
          }
          dispatch({ type: 'resuming', resuming: false });
        });
      } else {
        dispatch({ type: 'resuming', resuming: false });
      }
    };
    const onDisconnect = () => dispatch({ type: 'connected', connected: false });
    const onRoomState = (roomState: RoomState) => dispatch({ type: 'roomState', roomState });
    const onView = (view: Player304View) => dispatch({ type: 'view', view });
    const onEvent = (event: GameEvent) => {
      const text = describeEvent(event);
      if (text === null) return;
      const toast: Toast = { id: ++toastId, text };
      dispatch({ type: 'toast', toast });
      setTimeout(() => dispatch({ type: 'expireToast', id: toast.id }), 4000);
    };
    const onRoomError = (e: { message: string }) => dispatch({ type: 'error', error: e.message });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('game:view', onView);
    socket.on('game:event', onEvent);
    socket.on('room:error', onRoomError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('game:view', onView);
      socket.off('game:event', onEvent);
      socket.off('room:error', onRoomError);
    };
  }, []);

  const fail = (error: string) => dispatch({ type: 'error', error });

  const api: StoreApi = {
    state,
    createRoom: (nickname) => {
      saveNickname(nickname);
      socket.emit('room:create', { nickname }, (res) => {
        if (!res.ok) return fail(res.error);
        const session = { roomCode: res.roomCode, token: res.token, playerId: res.playerId };
        saveSession(session);
        dispatch({ type: 'session', session });
      });
    },
    joinRoom: (roomCode, nickname) => {
      saveNickname(nickname);
      const code = roomCode.trim().toUpperCase();
      socket.emit('room:join', { roomCode: code, nickname }, (res) => {
        if (!res.ok) return fail(res.error);
        const session = { roomCode: code, token: res.token, playerId: res.playerId };
        saveSession(session);
        dispatch({ type: 'session', session });
      });
    },
    startLocalGame: (nickname) => {
      saveNickname(nickname);
      const game = new LocalGame(nickname.trim() || 'You', (view) =>
        dispatch({ type: 'view', view }),
      );
      localGame.current?.destroy();
      localGame.current = game;
      dispatch({
        type: 'localStarted',
        session: { roomCode: 'SOLO', token: 'local', playerId: 'local-you' },
        roomState: game.roomState(),
      });
      game.start();
    },
    leaveRoom: () => {
      if (localGame.current !== null) {
        localGame.current.destroy();
        localGame.current = null;
        dispatch({ type: 'leftRoom' });
        return;
      }
      saveSession(null);
      dispatch({ type: 'leftRoom' });
      socket.disconnect();
      socket.connect();
    },
    takeSeat: (seat) => socket.emit('lobby:takeSeat', { seat }, ackOrError(fail)),
    leaveSeat: () => socket.emit('lobby:leaveSeat', ackOrError(fail)),
    addBot: (seat) => socket.emit('lobby:addBot', { seat }, ackOrError(fail)),
    removeBot: (seat) => socket.emit('lobby:removeBot', { seat }, ackOrError(fail)),
    startGame: () => socket.emit('lobby:start', ackOrError(fail)),
    sendAction: (action) => {
      if (localGame.current !== null) {
        try {
          localGame.current.dispatch(action);
        } catch (err) {
          fail(err instanceof Error ? err.message : 'illegal move');
        }
        return;
      }
      socket.emit('game:action', { action }, ackOrError(fail));
    },
    toLobby: () => {
      if (localGame.current !== null) {
        // Offline games have no lobby; ending one returns to the home screen.
        api.leaveRoom();
        return;
      }
      socket.emit('room:toLobby', ackOrError(fail));
    },
    clearError: () => dispatch({ type: 'error', error: null }),
  };

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

function ackOrError(fail: (e: string) => void) {
  return (res: { ok: true } | { ok: false; error: string }) => {
    if (!res.ok) fail(res.error);
  };
}

function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'trumpRevealed': {
      const names = { S: 'Spades ♠', H: 'Hearts ♥', D: 'Diamonds ♦', C: 'Clubs ♣' } as const;
      return `Trump revealed: ${names[event.suit]}`;
    }
    case 'dealScored':
      return event.result.madeIt
        ? `Bid of ${event.result.bid} made! (+${event.result.deltas[event.result.bidTeam]})`
        : `Bid of ${event.result.bid} failed (+2 to the defenders)`;
    case 'matchOver':
      return null; // the overlay handles this
    case 'trickWon':
      return null; // shown inline at the table
  }
}

export function useStore(): StoreApi {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useStore outside provider');
  return store;
}
