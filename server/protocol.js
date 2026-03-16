/* =====================================================================
 *  QourAIdor - WebSocket Message Protocol
 *  Shared type definitions for server ↔ client communication
 * ===================================================================== */

const MSG = {
    // Client → Server
    CREATE_ROOM:    'create_room',     // { playerName, isPublic? }
    JOIN_ROOM:      'join_room',       // { roomCode, playerName }
    MAKE_MOVE:      'make_move',       // { move: { type, row, col, orientation? } }
    LEAVE_ROOM:     'leave_room',      // {}
    CHAT:           'chat',            // { text }
    PING:           'ping',            // {}

    // Server → Client
    ROOM_CREATED:   'room_created',    // { roomCode, playerIndex }
    ROOM_JOINED:    'room_joined',     // { roomCode, playerIndex, opponentName }
    OPPONENT_JOINED:'opponent_joined', // { opponentName }
    STATE_SYNC:     'state_sync',      // { state, lastMove }
    MOVE_APPLIED:   'move_applied',    // { move, state }
    GAME_OVER:      'game_over',       // { winner, reason }
    OPPONENT_LEFT:  'opponent_left',   // { reason }
    CHAT_MSG:       'chat_msg',        // { from, text, timestamp }
    ROOM_ERROR:     'room_error',      // { message }
    PONG:           'pong',            // {}

    // Server → Spectators
    SPECTATOR_JOIN: 'spectator_join',  // { roomCode, state, players }
    SPECTATOR_UPDATE:'spectator_update' // { state, lastMove }
};

function makeMsg(type, payload) {
    return JSON.stringify({ type, ...payload });
}

function parseMsg(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MSG, makeMsg, parseMsg };
}
