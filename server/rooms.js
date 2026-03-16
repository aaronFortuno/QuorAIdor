/* =====================================================================
 *  QourAIdor - Room Manager
 *  Manages game rooms for multiplayer matches
 * ===================================================================== */

const { v4: uuidv4 } = require('uuid');
const QuoridorGame = require('../game.js');
const { MSG, makeMsg } = require('./protocol.js');

// Room statuses
const STATUS = {
    WAITING:  'waiting',   // 1 player, waiting for opponent
    PLAYING:  'playing',   // 2 players, game in progress
    FINISHED: 'finished'   // Game over
};

// Active rooms: Map<roomCode, Room>
const rooms = new Map();

function generateRoomCode() {
    // 6-char uppercase alphanumeric
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    if (rooms.has(code)) return generateRoomCode();
    return code;
}

function createRoom(ws, playerName) {
    const code = generateRoomCode();
    const room = {
        code,
        id: uuidv4(),
        players: [
            { ws, name: playerName || 'Guest', index: 0, connected: true }
        ],
        spectators: [],
        state: QuoridorGame.createState(),
        status: STATUS.WAITING,
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
    rooms.set(code, room);

    // Tag the ws with room info
    ws._roomCode = code;
    ws._playerIndex = 0;

    ws.send(makeMsg(MSG.ROOM_CREATED, {
        roomCode: code,
        playerIndex: 0
    }));

    return room;
}

function joinRoom(ws, roomCode, playerName) {
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Room not found' }));
        return null;
    }

    if (room.status !== STATUS.WAITING) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Room is full or game already finished' }));
        return null;
    }

    if (room.players.length >= 2) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Room is full' }));
        return null;
    }

    const player = { ws, name: playerName || 'Guest', index: 1, connected: true };
    room.players.push(player);
    room.status = STATUS.PLAYING;
    room.lastActivity = Date.now();

    ws._roomCode = code;
    ws._playerIndex = 1;

    // Notify joiner
    ws.send(makeMsg(MSG.ROOM_JOINED, {
        roomCode: code,
        playerIndex: 1,
        opponentName: room.players[0].name
    }));

    // Notify creator that opponent joined
    if (room.players[0].ws.readyState === 1) {
        room.players[0].ws.send(makeMsg(MSG.OPPONENT_JOINED, {
            opponentName: player.name
        }));
    }

    // Send initial state to both
    broadcastState(room);

    return room;
}

function handleMove(ws, move) {
    const code = ws._roomCode;
    const playerIndex = ws._playerIndex;
    if (code == null || playerIndex == null) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Not in a room' }));
        return;
    }

    const room = rooms.get(code);
    if (!room || room.status !== STATUS.PLAYING) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Game not in progress' }));
        return;
    }

    // Validate it's this player's turn
    if (room.state.currentPlayer !== playerIndex) {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Not your turn' }));
        return;
    }

    // Validate move with game engine (server is authoritative)
    if (move.type === 'move') {
        const validMoves = QuoridorGame.getValidMoves(room.state, playerIndex);
        const isValid = validMoves.some(m => m.row === move.row && m.col === move.col);
        if (!isValid) {
            ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Invalid move' }));
            return;
        }
    } else if (move.type === 'wall') {
        if (!QuoridorGame.isValidWallPlacement(room.state, move.row, move.col, move.orientation)) {
            ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Invalid wall placement' }));
            return;
        }
    } else {
        ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Unknown move type' }));
        return;
    }

    // Apply move
    room.state = QuoridorGame.applyMove(room.state, move);
    room.lastActivity = Date.now();

    // Broadcast new state to all
    broadcastState(room, move);

    // Check game over
    if (room.state.gameOver) {
        room.status = STATUS.FINISHED;
        const winner = room.state.winner;
        for (const p of room.players) {
            if (p.ws.readyState === 1) {
                p.ws.send(makeMsg(MSG.GAME_OVER, {
                    winner,
                    winnerName: room.players[winner] ? room.players[winner].name : 'Unknown',
                    reason: 'goal_reached'
                }));
            }
        }
        for (const s of room.spectators) {
            if (s.readyState === 1) {
                s.send(makeMsg(MSG.GAME_OVER, { winner, reason: 'goal_reached' }));
            }
        }
    }
}

function handleDisconnect(ws) {
    const code = ws._roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    const playerIdx = ws._playerIndex;

    // Mark player as disconnected
    const player = room.players.find(p => p.index === playerIdx);
    if (player) player.connected = false;

    // Notify opponent
    const opponent = room.players.find(p => p.index !== playerIdx);
    if (opponent && opponent.ws.readyState === 1) {
        opponent.ws.send(makeMsg(MSG.OPPONENT_LEFT, {
            reason: 'disconnected'
        }));
    }

    // If game was in progress, mark as finished (opponent wins)
    if (room.status === STATUS.PLAYING) {
        room.status = STATUS.FINISHED;
        room.state.gameOver = true;
        room.state.winner = opponent ? opponent.index : -1;
    }

    // Clean up room after delay if both disconnected
    setTimeout(() => {
        const r = rooms.get(code);
        if (r && r.players.every(p => !p.connected)) {
            rooms.delete(code);
        }
    }, 60000); // 1 minute cleanup
}

function handleLeave(ws) {
    const code = ws._roomCode;
    if (!code) return;

    handleDisconnect(ws);
    ws._roomCode = null;
    ws._playerIndex = null;
}

function handleChat(ws, text) {
    const code = ws._roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.index === ws._playerIndex);
    const from = player ? player.name : 'Unknown';
    const msg = makeMsg(MSG.CHAT_MSG, {
        from,
        text: String(text).slice(0, 200), // Limit message length
        timestamp: Date.now()
    });

    for (const p of room.players) {
        if (p.ws.readyState === 1) p.ws.send(msg);
    }
    for (const s of room.spectators) {
        if (s.readyState === 1) s.send(msg);
    }
}

function broadcastState(room, lastMove) {
    // Serialize state (strip non-serializable fields)
    const stateForClient = serializeState(room.state);
    const msg = makeMsg(MSG.STATE_SYNC, {
        state: stateForClient,
        lastMove: lastMove || null,
        players: room.players.map(p => ({ name: p.name, index: p.index }))
    });

    for (const p of room.players) {
        if (p.ws.readyState === 1) p.ws.send(msg);
    }
    for (const s of room.spectators) {
        if (s.readyState === 1) s.send(msg);
    }
}

function serializeState(state) {
    return {
        players: state.players.map(p => ({ row: p.row, col: p.col, walls: p.walls, goalRow: p.goalRow })),
        currentPlayer: state.currentPlayer,
        walls: state.walls.map(w => ({ row: w.row, col: w.col, orientation: w.orientation })),
        moveHistory: state.moveHistory,
        gameOver: state.gameOver,
        winner: state.winner
    };
}

function getRoomInfo(code) {
    const room = rooms.get(code);
    if (!room) return null;
    return {
        code: room.code,
        status: room.status,
        players: room.players.map(p => ({ name: p.name, index: p.index, connected: p.connected })),
        moveCount: room.state.moveHistory.length
    };
}

function getPublicRooms() {
    const result = [];
    for (const [code, room] of rooms) {
        if (room.status === STATUS.WAITING) {
            result.push({
                code,
                host: room.players[0] ? room.players[0].name : 'Unknown',
                createdAt: room.createdAt
            });
        }
    }
    return result;
}

// Periodic cleanup of stale rooms (>30 min inactive)
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.lastActivity > 30 * 60 * 1000) {
            rooms.delete(code);
        }
    }
}, 5 * 60 * 1000);

module.exports = {
    createRoom,
    joinRoom,
    handleMove,
    handleDisconnect,
    handleLeave,
    handleChat,
    getRoomInfo,
    getPublicRooms,
    rooms
};
