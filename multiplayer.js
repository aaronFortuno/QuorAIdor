/* =====================================================================
 *  QourAIdor - Multiplayer Client
 *  WebSocket client for online play. Communicates with server/server.js
 * ===================================================================== */

const Multiplayer = (() => {
    let ws = null;
    let connected = false;
    let roomCode = null;
    let playerIndex = -1;
    let playerName = localStorage.getItem('qouraid-player-name') || '';
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;

    // Event callbacks — set by ui.js
    const handlers = {
        onConnect: null,
        onDisconnect: null,
        onRoomCreated: null,
        onRoomJoined: null,
        onOpponentJoined: null,
        onStateSync: null,
        onGameOver: null,
        onOpponentLeft: null,
        onChat: null,
        onError: null
    };

    // Message types (mirror server/protocol.js)
    const MSG = {
        CREATE_ROOM:    'create_room',
        JOIN_ROOM:      'join_room',
        MAKE_MOVE:      'make_move',
        LEAVE_ROOM:     'leave_room',
        CHAT:           'chat',
        PING:           'ping',
        ROOM_CREATED:   'room_created',
        ROOM_JOINED:    'room_joined',
        OPPONENT_JOINED:'opponent_joined',
        STATE_SYNC:     'state_sync',
        GAME_OVER:      'game_over',
        OPPONENT_LEFT:  'opponent_left',
        CHAT_MSG:       'chat_msg',
        ROOM_ERROR:     'room_error',
        PONG:           'pong'
    };

    function getWsUrl() {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        return proto + '//' + loc.host;
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

        try {
            ws = new WebSocket(getWsUrl());
        } catch (e) {
            if (handlers.onError) handlers.onError('Cannot connect to server');
            return;
        }

        ws.onopen = () => {
            connected = true;
            reconnectAttempts = 0;
            if (handlers.onConnect) handlers.onConnect();
        };

        ws.onclose = () => {
            connected = false;
            if (handlers.onDisconnect) handlers.onDisconnect();
            // Auto-reconnect if was in a room
            if (roomCode && reconnectAttempts < MAX_RECONNECT) {
                reconnectAttempts++;
                setTimeout(connect, 1000 * reconnectAttempts);
            }
        };

        ws.onerror = () => {
            // onclose will fire after this
        };

        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            handleMessage(msg);
        };
    }

    function disconnect() {
        roomCode = null;
        playerIndex = -1;
        reconnectAttempts = MAX_RECONNECT; // prevent auto-reconnect
        if (ws) ws.close();
    }

    function send(obj) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    function handleMessage(msg) {
        switch (msg.type) {
            case MSG.ROOM_CREATED:
                roomCode = msg.roomCode;
                playerIndex = msg.playerIndex;
                if (handlers.onRoomCreated) handlers.onRoomCreated(msg.roomCode, msg.playerIndex);
                break;

            case MSG.ROOM_JOINED:
                roomCode = msg.roomCode;
                playerIndex = msg.playerIndex;
                if (handlers.onRoomJoined) handlers.onRoomJoined(msg.roomCode, msg.playerIndex, msg.opponentName);
                break;

            case MSG.OPPONENT_JOINED:
                if (handlers.onOpponentJoined) handlers.onOpponentJoined(msg.opponentName);
                break;

            case MSG.STATE_SYNC:
                if (handlers.onStateSync) handlers.onStateSync(msg.state, msg.lastMove, msg.players);
                break;

            case MSG.GAME_OVER:
                if (handlers.onGameOver) handlers.onGameOver(msg.winner, msg.winnerName, msg.reason);
                break;

            case MSG.OPPONENT_LEFT:
                if (handlers.onOpponentLeft) handlers.onOpponentLeft(msg.reason);
                break;

            case MSG.CHAT_MSG:
                if (handlers.onChat) handlers.onChat(msg.from, msg.text, msg.timestamp);
                break;

            case MSG.ROOM_ERROR:
                if (handlers.onError) handlers.onError(msg.message);
                break;

            case MSG.PONG:
                break; // keepalive response
        }
    }

    // =====================================================================
    //  Public actions
    // =====================================================================

    function createRoom(name) {
        playerName = name || playerName || 'Guest';
        localStorage.setItem('qouraid-player-name', playerName);
        send({ type: MSG.CREATE_ROOM, playerName });
    }

    function joinRoom(code, name) {
        playerName = name || playerName || 'Guest';
        localStorage.setItem('qouraid-player-name', playerName);
        send({ type: MSG.JOIN_ROOM, roomCode: code, playerName });
    }

    function sendMove(move) {
        send({ type: MSG.MAKE_MOVE, move });
    }

    function leaveRoom() {
        send({ type: MSG.LEAVE_ROOM });
        roomCode = null;
        playerIndex = -1;
    }

    function sendChat(text) {
        send({ type: MSG.CHAT, text });
    }

    function setName(name) {
        playerName = name;
        localStorage.setItem('qouraid-player-name', name);
    }

    function on(event, callback) {
        if (handlers.hasOwnProperty('on' + event.charAt(0).toUpperCase() + event.slice(1))) {
            handlers['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
        }
    }

    // Ping keepalive
    setInterval(() => {
        if (connected) send({ type: MSG.PING });
    }, 25000);

    return {
        connect, disconnect,
        createRoom, joinRoom, sendMove, leaveRoom, sendChat,
        setName, on,
        get connected() { return connected; },
        get roomCode() { return roomCode; },
        get playerIndex() { return playerIndex; },
        get playerName() { return playerName; }
    };
})();
