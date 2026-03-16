/* =====================================================================
 *  QourAIdor - Game Server
 *  Express serves static files + WebSocket for multiplayer
 * ===================================================================== */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { parseMsg, makeMsg, MSG } = require('./protocol.js');
const rooms = require('./rooms.js');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Serve static files from project root (game files)
app.use(express.static(path.join(__dirname, '..')));
app.use(express.json());

// REST: List public rooms
app.get('/api/rooms', (req, res) => {
    res.json(rooms.getPublicRooms());
});

// REST: Room info
app.get('/api/rooms/:code', (req, res) => {
    const info = rooms.getRoomInfo(req.params.code.toUpperCase());
    if (!info) return res.status(404).json({ error: 'Room not found' });
    res.json(info);
});

// REST: Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        rooms: rooms.rooms.size,
        uptime: process.uptime()
    });
});

// =====================================================================
//  WEBSOCKET SERVER
// =====================================================================

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    ws._isAlive = true;
    ws._playerName = 'Guest-' + Math.random().toString(36).slice(2, 6).toUpperCase();

    ws.on('pong', () => { ws._isAlive = true; });

    ws.on('message', (data) => {
        const msg = parseMsg(data);
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case MSG.CREATE_ROOM:
                if (msg.playerName) ws._playerName = String(msg.playerName).slice(0, 20);
                rooms.createRoom(ws, ws._playerName);
                break;

            case MSG.JOIN_ROOM:
                if (msg.playerName) ws._playerName = String(msg.playerName).slice(0, 20);
                rooms.joinRoom(ws, msg.roomCode || '', ws._playerName);
                break;

            case MSG.MAKE_MOVE:
                if (msg.move) rooms.handleMove(ws, msg.move);
                break;

            case MSG.LEAVE_ROOM:
                rooms.handleLeave(ws);
                break;

            case MSG.CHAT:
                if (msg.text) rooms.handleChat(ws, msg.text);
                break;

            case MSG.PING:
                ws.send(makeMsg(MSG.PONG, {}));
                break;

            default:
                ws.send(makeMsg(MSG.ROOM_ERROR, { message: 'Unknown message type: ' + msg.type }));
        }
    });

    ws.on('close', () => {
        rooms.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        rooms.handleDisconnect(ws);
    });
});

// Heartbeat: detect broken connections
const heartbeat = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws._isAlive) {
            rooms.handleDisconnect(ws);
            return ws.terminate();
        }
        ws._isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// =====================================================================
//  START
// =====================================================================

server.listen(PORT, () => {
    console.log(`QourAIdor server running on http://localhost:${PORT}`);
    console.log(`WebSocket available on ws://localhost:${PORT}`);
    console.log(`Game: http://localhost:${PORT}/index.html`);
    console.log(`Training: http://localhost:${PORT}/training.html`);
});
