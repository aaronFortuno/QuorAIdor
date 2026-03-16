const QuoridorGame = (() => {
    const SIZE = 9;
    const TOTAL_WALLS = 10;

    /* ==================================================================
     *  BLOCKED-EDGES BITMAP
     *  O(1) wall-blocks-edge lookup instead of scanning walls array.
     *  A horizontal wall at (r,c) blocks TWO horizontal edges:
     *    edge between (r,c)-(r+1,c) and edge between (r,c+1)-(r+1,c+1)
     *  A vertical wall at (r,c) blocks TWO vertical edges:
     *    edge between (r,c)-(r,c+1) and edge between (r+1,c)-(r+1,c+1)
     *
     *  hEdges[r][c] = true means horizontal movement blocked between
     *                 row r and row r+1 at column c
     *  vEdges[r][c] = true means vertical movement blocked between
     *                 col c and col c+1 at row r
     * ================================================================== */

    function createEdges() {
        return {
            h: Array.from({ length: SIZE }, () => Array(SIZE).fill(false)),
            v: Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
        };
    }

    function cloneEdges(edges) {
        return {
            h: edges.h.map(row => row.slice()),
            v: edges.v.map(row => row.slice())
        };
    }

    function addWallEdges(edges, row, col, orientation) {
        if (orientation === 'h') {
            // Horizontal wall at (row, col) blocks crossing between row and row+1
            // at columns col and col+1
            edges.h[row][col] = true;
            edges.h[row][col + 1] = true;
        } else {
            // Vertical wall at (row, col) blocks crossing between col and col+1
            // at rows row and row+1
            edges.v[row][col] = true;
            edges.v[row + 1][col] = true;
        }
    }

    function removeWallEdges(edges, row, col, orientation) {
        if (orientation === 'h') {
            edges.h[row][col] = false;
            edges.h[row][col + 1] = false;
        } else {
            edges.v[row][col] = false;
            edges.v[row + 1][col] = false;
        }
    }

    function buildEdgesFromWalls(walls) {
        const edges = createEdges();
        for (const w of walls) {
            addWallEdges(edges, w.row, w.col, w.orientation);
        }
        return edges;
    }

    /* O(1) edge-blocked check */
    function edgeBlocked(edges, r1, c1, r2, c2) {
        const dr = r2 - r1;
        const dc = c2 - c1;
        if (dr === -1) return edges.h[r2][c1];       // moving UP: check hEdge at (r2, c1)
        if (dr === 1)  return edges.h[r1][c1];        // moving DOWN: check hEdge at (r1, c1)
        if (dc === -1) return edges.v[r1][c2];        // moving LEFT: check vEdge at (r1, c2)
        if (dc === 1)  return edges.v[r1][c1];        // moving RIGHT: check vEdge at (r1, c1)
        return false;
    }

    /* Legacy compatibility: array-based check (used where edges bitmap not available) */
    function wallBlocksEdge(walls, r1, c1, r2, c2) {
        const dr = r2 - r1;
        const dc = c2 - c1;

        if (dr === -1 && dc === 0) {
            return walls.some(w =>
                w.orientation === 'h' && w.row === r2 && (w.col === c1 || w.col === c1 - 1)
            );
        }
        if (dr === 1 && dc === 0) {
            return walls.some(w =>
                w.orientation === 'h' && w.row === r1 && (w.col === c1 || w.col === c1 - 1)
            );
        }
        if (dc === -1 && dr === 0) {
            return walls.some(w =>
                w.orientation === 'v' && w.col === c2 && (w.row === r1 || w.row === r1 - 1)
            );
        }
        if (dc === 1 && dr === 0) {
            return walls.some(w =>
                w.orientation === 'v' && w.col === c1 && (w.row === r1 || w.row === r1 - 1)
            );
        }
        return false;
    }

    /* ==================================================================
     *  WALL OVERLAP CHECK  (O(1) with Set)
     * ================================================================== */

    function createWallSet(walls) {
        const set = new Set();
        for (const w of walls) {
            set.add(wallKey(w.row, w.col, w.orientation));
            // Also mark adjacent positions that would conflict
        }
        return set;
    }

    function wallKey(r, c, o) { return (r << 8) | (c << 4) | (o === 'h' ? 0 : 1); }

    function wallsOverlapFast(walls, wallSet, row, col, orientation) {
        // Same-position cross overlap
        if (wallSet.has(wallKey(row, col, 'h')) || wallSet.has(wallKey(row, col, 'v'))) return true;
        // Same-orientation adjacency overlap
        if (orientation === 'h') {
            if (wallSet.has(wallKey(row, col - 1, 'h'))) return true;
            if (wallSet.has(wallKey(row, col + 1, 'h'))) return true;
        } else {
            if (wallSet.has(wallKey(row - 1, col, 'v'))) return true;
            if (wallSet.has(wallKey(row + 1, col, 'v'))) return true;
        }
        return false;
    }

    /* ==================================================================
     *  STATE MANAGEMENT
     * ================================================================== */

    function createState() {
        const state = {
            players: [
                { row: 0, col: 4, walls: TOTAL_WALLS, goalRow: 8 },
                { row: 8, col: 4, walls: TOTAL_WALLS, goalRow: 0 }
            ],
            currentPlayer: 0,
            walls: [],
            edges: createEdges(),
            wallSet: new Set(),
            moveHistory: [],
            gameOver: false,
            winner: -1
        };
        return state;
    }

    function cloneState(state) {
        return {
            players: state.players.map(p => ({ ...p })),
            currentPlayer: state.currentPlayer,
            walls: state.walls.map(w => ({ ...w })),
            edges: cloneEdges(state.edges),
            wallSet: new Set(state.wallSet),
            moveHistory: state.moveHistory.slice(),
            gameOver: state.gameOver,
            winner: state.winner
        };
    }

    /* ==================================================================
     *  MOVE VALIDATION
     * ================================================================== */

    function getValidMoves(state, playerIdx) {
        const p = state.players[playerIdx];
        const opp = state.players[1 - playerIdx];
        const moves = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const edges = state.edges;

        for (const [dr, dc] of dirs) {
            const nr = p.row + dr;
            const nc = p.col + dc;

            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            if (edgeBlocked(edges, p.row, p.col, nr, nc)) continue;

            if (nr === opp.row && nc === opp.col) {
                const jr = nr + dr;
                const jc = nc + dc;
                if (jr >= 0 && jr < SIZE && jc >= 0 && jc < SIZE &&
                    !edgeBlocked(edges, nr, nc, jr, jc)) {
                    moves.push({ row: jr, col: jc });
                } else {
                    const sideDirs = (dr === 0) ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                    for (const [sdr, sdc] of sideDirs) {
                        const sr = nr + sdr;
                        const sc = nc + sdc;
                        if (sr >= 0 && sr < SIZE && sc >= 0 && sc < SIZE &&
                            !edgeBlocked(edges, nr, nc, sr, sc)) {
                            moves.push({ row: sr, col: sc });
                        }
                    }
                }
            } else {
                moves.push({ row: nr, col: nc });
            }
        }
        return moves;
    }

    /* ==================================================================
     *  BFS PATHFINDING  (O(1) dequeue via index pointer)
     * ================================================================== */

    function bfsShortestPath(state, playerIdx) {
        const p = state.players[playerIdx];
        const goalRow = p.goalRow;
        const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const queue = [{ row: p.row, col: p.col, dist: 0 }];
        let head = 0;
        visited[p.row][p.col] = true;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const edges = state.edges;

        while (head < queue.length) {
            const { row, col, dist } = queue[head++];
            if (row === goalRow) return dist;

            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (visited[nr][nc]) continue;
                if (edgeBlocked(edges, row, col, nr, nc)) continue;
                visited[nr][nc] = true;
                queue.push({ row: nr, col: nc, dist: dist + 1 });
            }
        }
        return Infinity;
    }

    function bfsWithJumps(state, playerIdx) {
        const p = state.players[playerIdx];
        const opp = state.players[1 - playerIdx];
        const goalRow = p.goalRow;
        const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const queue = [{ row: p.row, col: p.col, dist: 0 }];
        let head = 0;
        visited[p.row][p.col] = true;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const edges = state.edges;

        while (head < queue.length) {
            const { row, col, dist } = queue[head++];
            if (row === goalRow) return dist;

            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (edgeBlocked(edges, row, col, nr, nc)) continue;

                if (nr === opp.row && nc === opp.col) {
                    const jr = nr + dr;
                    const jc = nc + dc;
                    if (jr >= 0 && jr < SIZE && jc >= 0 && jc < SIZE &&
                        !edgeBlocked(edges, nr, nc, jr, jc)) {
                        if (!visited[jr][jc]) {
                            visited[jr][jc] = true;
                            queue.push({ row: jr, col: jc, dist: dist + 1 });
                        }
                    } else {
                        const sideDirs = (dr === 0) ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                        for (const [sdr, sdc] of sideDirs) {
                            const sr = nr + sdr;
                            const sc = nc + sdc;
                            if (sr >= 0 && sr < SIZE && sc >= 0 && sc < SIZE &&
                                !edgeBlocked(edges, nr, nc, sr, sc)) {
                                if (!visited[sr][sc]) {
                                    visited[sr][sc] = true;
                                    queue.push({ row: sr, col: sc, dist: dist + 1 });
                                }
                            }
                        }
                    }
                    continue;
                }

                if (visited[nr][nc]) continue;
                visited[nr][nc] = true;
                queue.push({ row: nr, col: nc, dist: dist + 1 });
            }
        }
        return Infinity;
    }

    function hasPath(state, playerIdx) {
        return bfsShortestPath(state, playerIdx) < Infinity;
    }

    /* ==================================================================
     *  WALL VALIDATION  (optimized: no cloneState, incremental edges)
     * ================================================================== */

    function wallsOverlap(walls, row, col, orientation) {
        return walls.some(w => {
            if (w.row === row && w.col === col) return true;
            if (orientation === 'h' && w.orientation === 'h') {
                return w.row === row && Math.abs(w.col - col) === 1;
            }
            if (orientation === 'v' && w.orientation === 'v') {
                return w.col === col && Math.abs(w.row - row) === 1;
            }
            return false;
        });
    }

    function isValidWallPlacement(state, row, col, orientation) {
        if (row < 0 || row >= SIZE - 1 || col < 0 || col >= SIZE - 1) return false;
        if (state.players[state.currentPlayer].walls <= 0) return false;

        // Fast overlap check using wallSet if available, fallback to linear scan
        if (state.wallSet) {
            if (wallsOverlapFast(state.walls, state.wallSet, row, col, orientation)) return false;
        } else {
            if (wallsOverlap(state.walls, row, col, orientation)) return false;
        }

        // Incremental path check: temporarily add edges, check paths, then remove
        const edges = state.edges;
        addWallEdges(edges, row, col, orientation);

        const p0HasPath = bfsShortestPath(state, 0) < Infinity;
        const p1HasPath = p0HasPath && bfsShortestPath(state, 1) < Infinity;

        removeWallEdges(edges, row, col, orientation);

        return p0HasPath && p1HasPath;
    }

    function getValidWallPlacements(state, orientation) {
        const placements = [];
        for (let r = 0; r < SIZE - 1; r++) {
            for (let c = 0; c < SIZE - 1; c++) {
                if (isValidWallPlacement(state, r, c, orientation)) {
                    placements.push({ row: r, col: c, orientation });
                }
            }
        }
        return placements;
    }

    /* ==================================================================
     *  APPLY MOVE
     * ================================================================== */

    function applyMove(state, move) {
        const newState = cloneState(state);
        const p = newState.players[newState.currentPlayer];

        if (move.type === 'move') {
            const notation = 'P' + (newState.currentPlayer + 1) + ' ' +
                String.fromCharCode(97 + move.col) + (move.row + 1);
            p.row = move.row;
            p.col = move.col;
            newState.moveHistory.push(notation);

            if (p.row === p.goalRow) {
                newState.gameOver = true;
                newState.winner = newState.currentPlayer;
            }
        } else if (move.type === 'wall') {
            const notation = 'P' + (newState.currentPlayer + 1) + ' ' +
                String.fromCharCode(97 + move.col) + (move.row + 1) +
                (move.orientation === 'h' ? 'h' : 'v');
            newState.walls.push({ row: move.row, col: move.col, orientation: move.orientation });
            addWallEdges(newState.edges, move.row, move.col, move.orientation);
            newState.wallSet.add(wallKey(move.row, move.col, move.orientation));
            p.walls--;
            newState.moveHistory.push(notation);
        }

        newState.currentPlayer = 1 - newState.currentPlayer;
        return newState;
    }

    function getAllLegalActions(state) {
        const actions = [];
        const moves = getValidMoves(state, state.currentPlayer);
        for (const m of moves) {
            actions.push({ type: 'move', row: m.row, col: m.col });
        }
        if (state.players[state.currentPlayer].walls > 0) {
            for (const ori of ['h', 'v']) {
                const wallPlacements = getValidWallPlacements(state, ori);
                for (const w of wallPlacements) {
                    actions.push({ type: 'wall', row: w.row, col: w.col, orientation: ori });
                }
            }
        }
        return actions;
    }

    /* ==================================================================
     *  LEGACY COMPATIBILITY: isWallAt (unused internally, may be called externally)
     * ================================================================== */

    function isWallAt(walls, row, col, orientation) {
        return walls.some(w => w.row === row && w.col === col && w.orientation === orientation);
    }

    return {
        SIZE, TOTAL_WALLS,
        createState, cloneState,
        getValidMoves, getValidWallPlacements, isValidWallPlacement,
        bfsShortestPath, bfsWithJumps, hasPath, wallBlocksEdge,
        applyMove, getAllLegalActions,
        // New: expose edge utilities for external use
        buildEdgesFromWalls, edgeBlocked, addWallEdges, removeWallEdges
    };
})();
