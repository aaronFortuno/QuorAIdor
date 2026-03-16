/* =====================================================================
 *  QourAIdor - Training Web Worker
 *  Runs headless games in a separate thread for parallel training
 * ===================================================================== */

// Import game engine and AI into worker scope
importScripts('game.js', 'ai.js');

function playGameHeadless(weightsA, weightsB, depth, maxMoves) {
    let state = QuoridorGame.createState();
    const history = [];

    for (let i = 0; i < maxMoves; i++) {
        if (state.gameOver) break;
        const w = state.currentPlayer === 0 ? weightsA : weightsB;
        const move = QuoridorAI.getBestMoveAtDepth(state, depth, w);
        if (!move) break;
        history.push({ move });
        state = QuoridorGame.applyMove(state, move);
    }

    return {
        winner: state.gameOver ? state.winner : -1,
        moves: history.length
    };
}

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'playBatch') {
        // Play a batch of games and return results
        const { games, depth, maxMoves } = data;
        const results = [];

        for (const game of games) {
            const result = playGameHeadless(game.weightsA, game.weightsB, depth, maxMoves);
            results.push({
                gi: game.gi,
                oi: game.oi,
                asP1: game.asP1,
                winner: result.winner,
                moves: result.moves
            });
        }

        self.postMessage({ type: 'batchResult', results });
    }
};
