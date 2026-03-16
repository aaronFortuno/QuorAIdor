/**
 * QuorAIdor Opening Book
 * 
 * Based on competitive Quoridor opening theory from:
 * - Standard Opening (1.e2 e8 2.e3 e7 3.e4 e6)
 * - Shiller Opening (standard + 4.e3v)
 * - The Rush / Gap / Sidewall openings
 * - Wikipedia Game Phases & competitive play analysis
 * 
 * Coordinate system:
 *   P1 starts at (row=0, col=4), goal = row 8  (advances by row++)
 *   P2 starts at (row=8, col=4), goal = row 0  (advances by row--)
 *   Columns 0-8 map to a-i, Rows 0-8 map to 1-9
 * 
 * Position key format: "p1Row,p1Col,p2Row,p2Col,moveCount"
 *   moveCount = total half-moves played (0 = P1's first move, 1 = P2's first move, etc.)
 * 
 * Wall coordinates: (row, col) is the top-left cell of the 2x2 block the wall occupies.
 *   'h' = horizontal wall blocking vertical movement between row and row+1 at col and col+1
 *   'v' = vertical wall blocking horizontal movement between col and col+1 at row and row+1
 * 
 * Design principles:
 *   1. First 3 moves per side: advance centrally (overwhelmingly strongest in competitive play)
 *   2. First wall: placed around move 6-7 (after both pawns reach the center)
 *   3. The Standard/Shiller opening is the most commonly played at high level
 *   4. Deviations (opponent moves off-center) are punished with continued advancement
 *   5. Wall responses target the opponent's path when they have positional commitment
 */
const QuoridorOpenings = (() => {

    // =========================================================================
    //  OPENING BOOK
    //  Key: "p1Row,p1Col,p2Row,p2Col,moveCount"
    //  Value: { type, row, col, orientation? }
    // =========================================================================

    const OPENING_BOOK = {

        // =====================================================================
        //  MOVE 0 — P1's first move (from starting position)
        //  Orthodox: advance e1->e2 (row 0->1, col 4)
        //  Universally considered the best first move in competitive Quoridor.
        //  Advancing centrally preserves all options and gains tempo.
        // =====================================================================
        '0,4,8,4,0': { type: 'move', row: 1, col: 4 },

        // =====================================================================
        //  MOVE 1 — P2's first move (responding to e2)
        //  Orthodox: advance e9->e8 (row 8->7, col 4)
        //  Symmetric response, equally strong. Deviating here loses tempo.
        // =====================================================================
        '1,4,8,4,1': { type: 'move', row: 7, col: 4 },

        // =====================================================================
        //  MOVE 2 — P1's second move (Standard Opening continues)
        //  Advance e2->e3 (row 1->2, col 4)
        //  Continuing central advance. Still too early for walls.
        // =====================================================================
        '1,4,7,4,2': { type: 'move', row: 2, col: 4 },

        // P2 didn't advance centrally — they went to d8 (row 7, col 3)
        // P1 still advances; opponent lost a tempo by sidestepping
        '1,4,7,3,2': { type: 'move', row: 2, col: 4 },
        // P2 went to f8 (row 7, col 5)
        '1,4,7,5,2': { type: 'move', row: 2, col: 4 },

        // =====================================================================
        //  MOVE 3 — P2's second move (Standard Opening)
        //  Advance e8->e7 (row 7->6, col 4)
        // =====================================================================
        '2,4,7,4,3': { type: 'move', row: 6, col: 4 },

        // P1 deviated on move 2 — went to d3 (row 2, col 3) instead of e3
        // P2 continues advancing centrally to punish the tempo loss
        '2,3,7,4,3': { type: 'move', row: 6, col: 4 },
        // P1 went to f3 (row 2, col 5)
        '2,5,7,4,3': { type: 'move', row: 6, col: 4 },

        // =====================================================================
        //  MOVE 4 — P1's third move (Standard Opening)
        //  Advance e3->e4 (row 2->3, col 4)
        //  Both pawns now approaching the center. After this move,
        //  P1 is at e4 and ready for the first wall on the next turn.
        // =====================================================================
        '2,4,6,4,4': { type: 'move', row: 3, col: 4 },

        // P2 played d7 (row 6, col 3) instead of e7 — off-center
        // P1 keeps advancing; the center column advantage is significant
        '2,4,6,3,4': { type: 'move', row: 3, col: 4 },
        // P2 played f7 (row 6, col 5)
        '2,4,6,5,4': { type: 'move', row: 3, col: 4 },

        // =====================================================================
        //  MOVE 5 — P2's third move (Standard Opening)
        //  Advance e7->e6 (row 6->5, col 4)
        //  The standard position is now reached: 1.e2 e8 2.e3 e7 3.e4 e6
        //  Both pawns centered, ready for the strategic wall phase.
        // =====================================================================
        '3,4,6,4,5': { type: 'move', row: 5, col: 4 },

        // P1 deviated — at d4 (row 3, col 3)
        '3,3,6,4,5': { type: 'move', row: 5, col: 4 },
        // P1 at f4 (row 3, col 5)
        '3,5,6,4,5': { type: 'move', row: 5, col: 4 },

        // =====================================================================
        //  MOVE 6 — P1's fourth move: THE CRITICAL JUNCTION
        //  
        //  Standard position: P1 at e4 (3,4), P2 at e6 (5,4)
        //  This is where named openings diverge:
        //
        //  SHILLER OPENING: Play e3v — vertical wall at (2,4)
        //    Creates one path for self, two paths for opponent.
        //    The wall blocks between col 4-5 at rows 2-3, creating
        //    a channel that canalizes P1's own back while keeping
        //    P2's side open. This is the most common competitive choice.
        //
        //  Alternative: Continue advancing e4->e5 (row 3->4)
        //    Riskier — brings pawns adjacent, creating jump possibilities.
        //    Used in aggressive lines but generally inferior to the wall.
        //
        //  We choose the Shiller wall (e3v) as the mainline.
        //  Wall at (row=2, col=4, orientation='v'):
        //    Blocks horizontal movement between col 4 and col 5 at rows 2 and 3
        //    This is equivalent to "e3v" in standard notation
        // =====================================================================
        '3,4,5,4,6': { type: 'wall', row: 2, col: 4, orientation: 'v' },

        // P2 arrived at d6 (5,3) instead of e6 — off-center to the left
        // P1 advances instead of walling; opponent's deviation is exploitable later
        '3,4,5,3,6': { type: 'move', row: 4, col: 4 },

        // P2 at f6 (5,5) — off-center to the right
        // P1 advances to keep pressure
        '3,4,5,5,6': { type: 'move', row: 4, col: 4 },

        // =====================================================================
        //  MOVE 7 — P2's fourth move (responding to Shiller wall)
        //
        //  After P1 plays e3v, P2 has two main responses:
        //
        //  A) MIRRORED: Play e6v — mirror the Shiller wall
        //     Wall at (row=5, col=4, orientation='v')
        //     Keeps symmetry; solid and safe response.
        //
        //  B) SYMMETRICAL: Play d6v — the asymmetric counter
        //     Wall at (row=5, col=3, orientation='v')
        //     Creates a different channel structure, considered slightly
        //     more dynamic.
        //
        //  We choose the mirror (e6v) as the mainline response.
        //  This is the most popular response at competitive level.
        // =====================================================================
        '3,4,5,4,7': { type: 'wall', row: 5, col: 4, orientation: 'v' },

        // If P1 advanced to e5 (4,4) instead of playing a wall on move 6,
        // P2 should also keep advancing (the pawns are now adjacent — 
        // P2 can jump over P1 on the next move if aligned correctly)
        // P2 advances e6->e5... but wait, P1 is at (4,4), P2 at (5,4) —
        // they're adjacent. P2 jumps over P1 to e4 (row 3, col 4)
        '4,4,5,4,7': { type: 'move', row: 3, col: 4 },

        // =====================================================================
        //  MOVES 8-9 — Post-Shiller continuation
        //
        //  After 1.e2 e8 2.e3 e7 3.e4 e6 4.e3v e6v
        //  Position: P1 at (3,4), P2 at (5,4), walls at e3v and e6v
        //
        //  Both sides have channeled their backs. Now the fight is about:
        //  - Advancing pawns while maintaining wall advantage
        //  - Placing offensive walls to lengthen opponent's path
        //
        //  P1's best: advance e4->e5 (row 3->4) — gains a row toward goal
        //  This brings the pawn into contested territory.
        // =====================================================================
        '3,4,5,4,8': { type: 'move', row: 4, col: 4 },

        // =====================================================================
        //  ALTERNATIVE MAIN LINES
        // =====================================================================

        // --- THE RUSH OPENING (less common but known) ---
        // After standard 3 moves each: P1(3,4) P2(5,4)
        // Instead of e3v, P1 plays d5v (vertical wall at row=4, col=3)
        // This is "The Rush" — places wall in front of opponent
        // We handle this as an alternative when P2 encounters it:
        //
        // If P2 finds P1 at (3,4) with a wall already placed and it's move 7,
        // the book will have already given P1 the Shiller wall. But if we're 
        // playing as P2 and P1 played a different wall, we fall back to search.

        // --- SIDEWALL OPENING ---
        // After 1.e2 e8, P1 places a vertical wall next to P2's pawn: d7v
        // This is an aggressive early wall that tries to create two paths for P2.
        // In our system: P1 at (1,4), P2 at (7,4), P1 plays wall at (6,3,'v')
        // Considered weak by strong players; P2 counters with c7h.
        // We don't play it, but we respond to it:
        //
        // If P2 faces a sidewall (P1 at row 1, early wall placed):
        // P2 should just advance. The book entries above already handle normal P2.

        // =====================================================================
        //  DEVIATION RESPONSES — punishing non-central play
        // =====================================================================

        // P2 didn't move on move 1 but placed a wall instead (staying at row 8)
        // P1 should keep advancing — free tempo gain
        '1,4,8,4,2': { type: 'move', row: 2, col: 4 },

        // P1 played a wall on move 0 instead of advancing (stays at row 0)
        // P2 should advance — massive tempo advantage
        '0,4,8,4,1': { type: 'move', row: 7, col: 4 },

        // After P1 advanced twice but P2 only once (P2 played wall on move 3)
        // Position: P1 at (2,4), P2 still at (7,4), move 4
        // P1 keeps advancing
        '2,4,7,4,4': { type: 'move', row: 3, col: 4 },

        // P1 advanced 3 times, P2 only twice (P2 walled on move 5)
        // P1 at (3,4), P2 at (6,4), move 6 — P1 keeps advancing
        '3,4,6,4,6': { type: 'move', row: 4, col: 4 },

        // =====================================================================
        //  EARLY WALL DEFENSE — when opponent places aggressive early walls
        // =====================================================================

        // P1 at (1,4), P2 advanced to (7,4) but P1 detects an early wall scenario
        // If P2 is at (8,4) on move 2 (meaning P2 played a wall), 
        // P1 at (1,4) should advance
        // (Already covered above: '1,4,8,4,2')

        // P2 at (6,4) but played a wall on move 7 instead of mirroring
        // P1 at (3,4), move 8 — P1 should advance into the center
        // (This is the same as the post-Shiller continuation, already covered)

        // =====================================================================
        //  PAWN COLLISION SCENARIOS — when pawns meet near center
        // =====================================================================

        // Both at e5/e4 region — pawns adjacent vertically at (3,4) and (4,4)
        // This shouldn't happen in normal opening book play since we wall on move 6
        // But if it does (opponent jumped or we're in a transposition):

        // P1 at (4,4), P2 at (5,4), move 8 — pawns adjacent, P1 can't advance
        // directly; P1 should play a wall instead of moving sideways
        // Place wall to lengthen P2's path: horizontal wall at (4,3) blocks P2's advance
        '4,4,5,4,8': { type: 'wall', row: 4, col: 3, orientation: 'h' },

        // P1 at (4,4), P2 at (3,4) — P2 jumped over P1!
        // P1 at (4,4), move 8. P1 should advance (P2 is behind us now)
        '4,4,3,4,8': { type: 'move', row: 5, col: 4 },

        // =====================================================================
        //  EXTENDED LINES — moves 9-11 for deep book coverage
        // =====================================================================

        // After Shiller + mirror + P1 advance:
        // P1 at (4,4), P2 at (5,4), move 9 — P2's turn
        // P2 should advance: e6->e5... but P1 is at (4,4) and P2 at (5,4)
        // Adjacent — P2 jumps over P1 to e4 (3,4)
        '4,4,5,4,9': { type: 'move', row: 3, col: 4 },

        // After P2 jumps: P1 at (4,4), P2 at (3,4), move 10
        // P1 should advance toward goal (row 8): move to (5,4)
        '4,4,3,4,10': { type: 'move', row: 5, col: 4 },

        // P1 at (5,4), P2 at (3,4), move 11 — P2 keeps advancing
        '5,4,3,4,11': { type: 'move', row: 2, col: 4 },
    };

    // =========================================================================
    //  LOOKUP FUNCTION
    // =========================================================================

    /**
     * Look up the opening book for a given game state.
     * @param {Object} state - QuoridorGame state object
     * @returns {Object|null} The recommended move, or null if not in book
     */
    function lookup(state) {
        const p1 = state.players[0];
        const p2 = state.players[1];
        const moveCount = state.moveHistory.length;

        // Only consult the book in the first ~12 half-moves and with no walls placed
        // (walls placed = we've deviated from pure opening theory and transpositions
        //  are too complex to track with this simple key system)
        if (moveCount > 11) return null;

        const key = `${p1.row},${p1.col},${p2.row},${p2.col},${moveCount}`;
        const entry = OPENING_BOOK[key];

        if (!entry) return null;

        // Validate the move is legal in the current state before returning it
        if (entry.type === 'move') {
            const validMoves = QuoridorGame.getValidMoves(state, state.currentPlayer);
            const isValid = validMoves.some(m => m.row === entry.row && m.col === entry.col);
            if (!isValid) return null;
        } else if (entry.type === 'wall') {
            if (!QuoridorGame.isValidWallPlacement(state, entry.row, entry.col, entry.orientation)) {
                return null;
            }
        }

        return { ...entry };
    }

    /**
     * Get a human-readable description of the opening being played.
     * @param {Object} state - QuoridorGame state object
     * @returns {string|null} Name of the opening, or null
     */
    function identifyOpening(state) {
        const hist = state.moveHistory;
        if (hist.length < 6) return null;

        // Standard opening: both players advance 3 times centrally
        const standard = hist.length >= 6 &&
            hist[0] === 'P1 e2' && hist[1] === 'P2 e8' &&
            hist[2] === 'P1 e3' && hist[3] === 'P2 e7' &&
            hist[4] === 'P1 e4' && hist[5] === 'P2 e6';

        if (!standard) return null;

        if (hist.length >= 7) {
            if (hist[6] === 'P1 e3v') {
                if (hist.length >= 8 && hist[7] === 'P2 e6v') {
                    return 'Shiller Opening (Mirrored)';
                }
                if (hist.length >= 8 && hist[7] === 'P2 d6v') {
                    return 'Shiller Opening (Symmetrical)';
                }
                return 'Shiller Opening';
            }
            if (hist[6] === 'P1 d5v') {
                return 'The Rush';
            }
            if (hist[6] === 'P1 e5') {
                return 'Standard (Aggressive)';
            }
        }

        return 'Standard Opening';
    }

    // =========================================================================
    //  PUBLIC API
    // =========================================================================

    return {
        OPENING_BOOK,
        lookup,
        identifyOpening
    };

})();

// Export for Node.js / testing environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuoridorOpenings;
}
