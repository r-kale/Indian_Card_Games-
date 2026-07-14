import { engines, MAX_PLAYERS_PER_ROOM } from '@icg/shared';
import type { GameId } from '@icg/shared';
import { RoomError } from './room';
import type { IoServer, IoSocket } from './room';
import type { RoomManager } from './roomManager';

interface SocketSession {
  token: string;
  roomCode: string;
}

const sessionOf = new WeakMap<IoSocket, SocketSession>();

export function wireSockets(io: IoServer, rooms: RoomManager): void {
  io.on('connection', (socket) => {
    socket.on('room:create', (p, ack) =>
      safely(ack, () => {
        const nickname = requireNickname(p?.nickname);
        const room = rooms.createRoom();
        const player = room.addPlayer(nickname);
        room.hostToken = player.token;
        rooms.registerSession(player.token, room.code);
        bind(socket, room.code, player.token);
        room.connect(player.token, socket.id);
        room.broadcast();
        return { roomCode: room.code, token: player.token, playerId: player.id };
      }),
    );

    socket.on('room:join', (p, ack) =>
      safely(ack, () => {
        const nickname = requireNickname(p?.nickname);
        const room = rooms.getRoom(String(p?.roomCode ?? ''));
        const player = room.addPlayer(nickname);
        rooms.registerSession(player.token, room.code);
        bind(socket, room.code, player.token);
        room.connect(player.token, socket.id);
        room.broadcast();
        room.sendGameTo(player);
        return { token: player.token, playerId: player.id };
      }),
    );

    socket.on('room:rejoin', (p, ack) =>
      safely(ack, () => {
        const room = rooms.getRoom(String(p?.roomCode ?? ''));
        const token = String(p?.token ?? '');
        const player = room.connect(token, socket.id);
        bind(socket, room.code, token);
        room.broadcast();
        room.sendGameTo(player);
        return { playerId: player.id, nickname: player.nickname };
      }),
    );

    socket.on('lobby:takeSeat', (p, ack) =>
      inRoom(socket, rooms, ack, (room, token) => room.takeSeat(token, requireSeat(p?.seat))),
    );
    socket.on('lobby:leaveSeat', (ack) =>
      inRoom(socket, rooms, ack, (room, token) => room.leaveSeat(token)),
    );
    socket.on('lobby:addBot', (p, ack) =>
      inRoom(socket, rooms, ack, (room, token) =>
        room.addBot(token, requireSeat(p?.seat), typeof p?.name === 'string' ? p.name : undefined),
      ),
    );
    socket.on('lobby:removeBot', (p, ack) =>
      inRoom(socket, rooms, ack, (room, token) => room.removeBot(token, requireSeat(p?.seat))),
    );
    socket.on('lobby:setGame', (p, ack) =>
      inRoom(socket, rooms, ack, (room, token) => {
        if (typeof p?.gameId !== 'string' || !(p.gameId in engines)) {
          throw new RoomError('unknown game');
        }
        room.setGame(token, p.gameId as GameId);
      }),
    );
    socket.on('lobby:start', (ack) => inRoom(socket, rooms, ack, (room, token) => room.start(token)));
    socket.on('room:toLobby', (ack) => inRoom(socket, rooms, ack, (room, token) => room.toLobby(token)));

    socket.on('game:action', (p, ack) =>
      inRoom(socket, rooms, ack, (room, token) => {
        if (p?.action == null || typeof p.action !== 'object') throw new RoomError('malformed action');
        room.handleAction(token, p.action);
      }),
    );

    socket.on('disconnect', () => {
      const session = sessionOf.get(socket);
      if (session === undefined) return;
      const room = rooms.roomForToken(session.token);
      room?.disconnect(session.token);
    });
  });
}

function bind(socket: IoSocket, roomCode: string, token: string): void {
  sessionOf.set(socket, { token, roomCode });
  void socket.join(roomCode);
}

function safely<T extends object>(ack: (r: ({ ok: true } & T) | { ok: false; error: string }) => void, fn: () => T): void {
  try {
    ack({ ok: true, ...fn() });
  } catch (err) {
    ack({ ok: false, error: err instanceof RoomError ? err.message : 'internal error' });
    if (!(err instanceof RoomError)) console.error(err);
  }
}

function inRoom(
  socket: IoSocket,
  rooms: RoomManager,
  ack: (r: { ok: true } | { ok: false; error: string }) => void,
  fn: (room: import('./room').Room, token: string) => void,
): void {
  safely(ack, () => {
    const session = sessionOf.get(socket);
    if (session === undefined) throw new RoomError('join a room first');
    const room = rooms.roomForToken(session.token);
    if (room === null) throw new RoomError('room no longer exists');
    fn(room, session.token);
    return {};
  });
}

function requireNickname(value: unknown): string {
  const nickname = String(value ?? '').trim();
  if (nickname.length === 0) throw new RoomError('nickname is required');
  return nickname;
}

function requireSeat(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= MAX_PLAYERS_PER_ROOM
  ) {
    throw new RoomError('bad seat');
  }
  return value;
}
