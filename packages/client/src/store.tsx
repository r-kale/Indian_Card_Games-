import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { GameAction, GameEvent, GameId, GameView, RoomState } from '@icg/shared';
import { LocalGame } from './localGame';
import { P2PGuest } from './p2p/guest';
import { P2PHost } from './p2p/host';
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
  /**
   * 'local' = offline vs bots. 'p2pHost'/'p2pGuest' = serverless online play
   * over WebRTC — the host's browser runs the room. 'online' = Socket.IO server.
   */
  mode: 'online' | 'local' | 'p2pHost' | 'p2pGuest';
  session: Session | null;
  /** True while we try to resume a stored session on page load. */
  resuming: boolean;
  roomState: RoomState | null;
  view: GameView | null;
  toasts: Toast[];
  error: string | null;
}

type AppAction =
  | { type: 'connected'; connected: boolean }
  | { type: 'session'; session: Session | null }
  | { type: 'resuming'; resuming: boolean }
  | { type: 'roomState'; roomState: RoomState }
  | { type: 'view'; view: GameView }
  | { type: 'toast'; toast: Toast }
  | { type: 'expireToast'; id: number }
  | { type: 'error'; error: string | null }
  | { type: 'localStarted'; session: Session; roomState: RoomState }
  | { type: 'p2pStarted'; mode: 'p2pHost' | 'p2pGuest'; session: Session }
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
    case 'p2pStarted':
      return { ...state, mode: action.mode, session: action.session, error: null };
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
  hostP2PRoom: (nickname: string) => void;
  startLocalGame: (nickname: string, gameId: GameId, players?: number) => void;
  setGame: (gameId: GameId) => void;
  leaveRoom: () => void;
  takeSeat: (seat: number) => void;
  leaveSeat: () => void;
  addBot: (seat: number, name?: string) => void;
  removeBot: (seat: number) => void;
  startGame: () => void;
  sendAction: (action: GameAction) => void;
  toLobby: () => void;
  clearError: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const localGame = useRef<LocalGame | null>(null);
  const p2pHost = useRef<P2PHost | null>(null);
  const p2pGuest = useRef<P2PGuest | null>(null);
  /** Latest room snapshot, for naming seats in toasts. */
  const roomRef = useRef<RoomState | null>(null);

  const setRoomState = (roomState: RoomState) => {
    roomRef.current = roomState;
    dispatch({ type: 'roomState', roomState });
  };

  const notifyEvent = (event: GameEvent) => {
    const nameOf = (seat: number) =>
      roomRef.current?.seats[seat]?.nickname ?? `Seat ${seat}`;
    const text = describeEvent(event, nameOf);
    if (text === null) return;
    const toast: Toast = { id: ++toastId, text };
    dispatch({ type: 'toast', toast });
    setTimeout(() => dispatch({ type: 'expireToast', id: toast.id }), 5000);
  };

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
    const onRoomState = (roomState: RoomState) => setRoomState(roomState);
    const onView = (view: GameView) => dispatch({ type: 'view', view });
    const onEvent = (event: GameEvent) => notifyEvent(event);
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

  const destroyP2P = () => {
    p2pHost.current?.destroy();
    p2pHost.current = null;
    p2pGuest.current?.destroy();
    p2pGuest.current = null;
  };

  const joinP2P = (code: string, nickname: string) => {
    const guest = new P2PGuest({
      onRoom: setRoomState,
      onView: (view) => dispatch({ type: 'view', view }),
      onEvent: notifyEvent,
      onError: fail,
      onClosed: (reason) => {
        fail(reason);
        p2pGuest.current?.destroy();
        p2pGuest.current = null;
        dispatch({ type: 'leftRoom' });
      },
    });
    p2pGuest.current?.destroy();
    p2pGuest.current = guest;
    guest
      .connect(code, nickname)
      .then(({ playerId, token }) => {
        dispatch({
          type: 'p2pStarted',
          mode: 'p2pGuest',
          session: { roomCode: code, token, playerId },
        });
      })
      .catch((err: Error) => {
        guest.destroy();
        if (p2pGuest.current === guest) p2pGuest.current = null;
        fail(err.message);
      });
  };

  /** Run a host-room call, surfacing rule violations as banner errors. */
  const hostOp = (fn: (host: P2PHost) => void) => {
    try {
      fn(p2pHost.current!);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'something went wrong');
    }
  };

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
      // Try the game server first when it's reachable; otherwise (or if it
      // doesn't know the code) the code may belong to a P2P host browser.
      if (socket.connected) {
        socket.emit('room:join', { roomCode: code, nickname }, (res) => {
          if (!res.ok) {
            joinP2P(code, nickname);
            return;
          }
          const session = { roomCode: code, token: res.token, playerId: res.playerId };
          saveSession(session);
          dispatch({ type: 'session', session });
        });
      } else {
        joinP2P(code, nickname);
      }
    },
    hostP2PRoom: (nickname) => {
      saveNickname(nickname);
      destroyP2P();
      const host = new P2PHost(nickname, {
        onReady: (code) => {
          dispatch({
            type: 'p2pStarted',
            mode: 'p2pHost',
            session: { roomCode: code, token: host.hostToken, playerId: 'p2p-host' },
          });
        },
        onFatal: (message) => {
          if (p2pHost.current === host) p2pHost.current = null;
          fail(message);
        },
        onRoom: setRoomState,
        onView: (view) => dispatch({ type: 'view', view }),
        onEvent: notifyEvent,
      });
      p2pHost.current = host;
    },
    startLocalGame: (nickname, gameId, players) => {
      saveNickname(nickname);
      const game = new LocalGame(
        nickname.trim() || 'You',
        gameId,
        (view) => dispatch({ type: 'view', view }),
        players,
      );
      localGame.current?.destroy();
      localGame.current = game;
      roomRef.current = game.roomState();
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
      if (p2pHost.current !== null || p2pGuest.current !== null) {
        destroyP2P();
        dispatch({ type: 'leftRoom' });
        return;
      }
      saveSession(null);
      dispatch({ type: 'leftRoom' });
      socket.disconnect();
      socket.connect();
    },
    takeSeat: (seat) => {
      if (p2pHost.current !== null) return hostOp((h) => h.takeSeat(h.hostToken, seat));
      if (p2pGuest.current !== null) return p2pGuest.current.takeSeat(seat);
      socket.emit('lobby:takeSeat', { seat }, ackOrError(fail));
    },
    leaveSeat: () => {
      if (p2pHost.current !== null) return hostOp((h) => h.leaveSeat(h.hostToken));
      if (p2pGuest.current !== null) return p2pGuest.current.leaveSeat();
      socket.emit('lobby:leaveSeat', ackOrError(fail));
    },
    addBot: (seat, name) => {
      if (p2pHost.current !== null) return hostOp((h) => h.addBot(seat, name));
      socket.emit('lobby:addBot', { seat, name }, ackOrError(fail));
    },
    removeBot: (seat) => {
      if (p2pHost.current !== null) return hostOp((h) => h.removeBot(seat));
      socket.emit('lobby:removeBot', { seat }, ackOrError(fail));
    },
    setGame: (gameId) => {
      if (p2pHost.current !== null) return hostOp((h) => h.setGame(gameId));
      socket.emit('lobby:setGame', { gameId }, ackOrError(fail));
    },
    startGame: () => {
      if (p2pHost.current !== null) return hostOp((h) => h.start());
      socket.emit('lobby:start', ackOrError(fail));
    },
    sendAction: (action) => {
      if (localGame.current !== null) {
        try {
          localGame.current.dispatch(action);
        } catch (err) {
          fail(err instanceof Error ? err.message : 'illegal move');
        }
        return;
      }
      if (p2pHost.current !== null) {
        return hostOp((h) => h.handleAction(h.hostToken, action));
      }
      if (p2pGuest.current !== null) return p2pGuest.current.action(action);
      socket.emit('game:action', { action }, ackOrError(fail));
    },
    toLobby: () => {
      if (localGame.current !== null) {
        // Offline games have no lobby; ending one returns to the home screen.
        api.leaveRoom();
        return;
      }
      if (p2pHost.current !== null) return hostOp((h) => h.toLobby());
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

const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

function describeEvent(event: GameEvent, nameOf: (seat: number) => string): string | null {
  switch (event.type) {
    case 'partnerRevealed':
      return event.alliance === 'allied'
        ? `🎭 ${nameOf(event.seat)} is the partner! (${event.card.rank}${SUIT_GLYPHS[event.card.suit]})`
        : `💥 Partner trick lost — the bidder now plays alone vs 3!`;
    case 'dealScored': {
      const r = event.result;
      return r.madeIt
        ? `Bid of ${r.bid} made — ${nameOf(r.bidder)} & ${nameOf(r.partnerSeat)} score +1`
        : `Bid of ${r.bid} failed — the defenders score +1`;
    }
    case 'vakhaaiCalled':
      return `\u{1F0CF} Vakhaai! ${nameOf(event.seat)} bets ${event.bet} kalyas on 4 hands alone`;
    case 'sixCalled':
      return `\u26A1 ${nameOf(event.seat)}'s team commits to 6 hands!`;
    case 'hukumRevealed': {
      const names = { S: 'Spades \u2660', H: 'Hearts \u2665', D: 'Diamonds \u2666', C: 'Clubs \u2663' } as const;
      return `${nameOf(event.caller)} called it \u2014 hukum is ${names[event.suit]}!`;
    }
    case 'roundScored': {
      const r = event.result;
      const dir = r.delta < 0 ? `recover ${-r.delta}` : `pay ${r.delta}`;
      return r.made
        ? `Round made \u2014 the shuffling side ${dir} kalyas`
        : `Round failed \u2014 the shuffling side ${dir} kalyas`;
    }
    case 'marriageShown': {
      const names = { S: 'Spades ♠', H: 'Hearts ♥', D: 'Diamonds ♦', C: 'Clubs ♣' } as const;
      return `💍 ${nameOf(event.seat)} shows a marriage — K+Q of ${names[event.suit]}${event.hukum ? ' (hukum! ±40)' : ' (±20)'}`;
    }
    case 'badamPassed':
      return `${nameOf(event.seat)} passes`;
    case 'badamRoundScored': {
      const r = event.result;
      return `🎉 ${nameOf(r.winner)} is out of cards and wins the round!`;
    }
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
