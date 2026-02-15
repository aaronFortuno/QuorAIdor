const QuoridorGame = (() => {
    const SIZE = 9;
    const TOTAL_WALLS = 10;

    function createState() {
        return {
            players: [
                { row: 0, col: 4, walls: TOTAL_WALLS, goalRow: 8 },
                { row: 8, col: 4, walls: TOTAL_WALLS, goalRow: 0 }
            ],
            currentPlayer: 0,
            walls: [],
            moveHistory: [],
            gameOver: false,
            winner: -1
        };
    }

    function cloneState(state) {
        return {
            players: state.players.map(p => ({ ...p })),
            currentPlayer: state.currentPlayer,
            walls: state.walls.map(w => ({ ...w })),
            moveHistory: state.moveHistory.slice(),
            gameOver: state.gameOver,
            winner: state.winner
        };
    }

    function isWallAt(walls, row, col, orientation) {
        return walls.some(w => w.row === row && w.col === col && w.orientation === orientation);
    }

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

    function getValidMoves(state, playerIdx) {
        const p = state.players[playerIdx];
        const opp = state.players[1 - playerIdx];
        const moves = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dr, dc] of dirs) {
            const nr = p.row + dr;
            const nc = p.col + dc;

            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            if (wallBlocksEdge(state.walls, p.row, p.col, nr, nc)) continue;

            if (nr === opp.row && nc === opp.col) {
                const jr = nr + dr;
                const jc = nc + dc;
                if (jr >= 0 && jr < SIZE && jc >= 0 && jc < SIZE &&
                    !wallBlocksEdge(state.walls, nr, nc, jr, jc)) {
                    moves.push({ row: jr, col: jc });
                } else {
                    const sideDirs = (dr === 0) ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                    for (const [sdr, sdc] of sideDirs) {
                        const sr = nr + sdr;
                        const sc = nc + sdc;
                        if (sr >= 0 && sr < SIZE && sc >= 0 && sc < SIZE &&
                            !wallBlocksEdge(state.walls, nr, nc, sr, sc)) {
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

    function bfsShortestPath(state, playerIdx) {
        const p = state.players[playerIdx];
        const goalRow = p.goalRow;
        const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const queue = [{ row: p.row, col: p.col, dist: 0 }];
        visited[p.row][p.col] = true;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        while (queue.length > 0) {
            const { row, col, dist } = queue.shift();
            if (row === goalRow) return dist;

            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (visited[nr][nc]) continue;
                if (wallBlocksEdge(state.walls, row, col, nr, nc)) continue;
                visited[nr][nc] = true;
                queue.push({ row: nr, col: nc, dist: dist + 1 });
            }
        }
        return Infinity;
    }

    function hasPath(state, playerIdx) {
        return bfsShortestPath(state, playerIdx) < Infinity;
    }

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
        if (wallsOverlap(state.walls, row, col, orientation)) return false;

        const testState = cloneState(state);
        testState.walls.push({ row, col, orientation });

        return hasPath(testState, 0) && hasPath(testState, 1);
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

    return {
        SIZE, TOTAL_WALLS,
        createState, cloneState,
        getValidMoves, getValidWallPlacements, isValidWallPlacement,
        bfsShortestPath, hasPath, wallBlocksEdge,
        applyMove, getAllLegalActions
    };
})();
