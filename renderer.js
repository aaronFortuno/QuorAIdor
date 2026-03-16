/* =====================================================================
 *  QourAIdor - Shared Board Renderer
 *  Common drawing functions used by both game UI and training arena
 * ===================================================================== */

const BoardRenderer = (() => {
    const SIZE = QuoridorGame.SIZE;
    const CELL = 50;
    const GAP  = 8;
    const PAD  = 20;
    const BOARD_PX = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2;

    function cellX(col) { return PAD + col * (CELL + GAP); }
    function cellY(row) { return PAD + row * (CELL + GAP); }

    let _cachedColors = null;
    let _colorsDirty = true;

    function invalidateColors() { _colorsDirty = true; _cachedColors = null; }

    function getColors() {
        if (_cachedColors && !_colorsDirty) return _cachedColors;
        const style = getComputedStyle(document.documentElement);
        _cachedColors = {
            bg:          style.getPropertyValue('--board-bg').trim()  || '#0d1b36',
            cell:        style.getPropertyValue('--cell-bg').trim()   || '#16213e',
            cellHover:   style.getPropertyValue('--btn-selected-bg').trim() || '#1e2a4a',
            cellValid:   'rgba(79, 195, 247, 0.2)',
            gridLine:    style.getPropertyValue('--border').trim()    || '#0f3460',
            p1:          style.getPropertyValue('--color-p1').trim() || '#4fc3f7',
            p2:          style.getPropertyValue('--color-p2').trim() || '#e94560',
            wallPlaced:  style.getPropertyValue('--text').trim()      || '#e0e0e0',
            wallPreview: 'rgba(233, 69, 96, 0.5)',
            wallInvalid: 'rgba(255, 0, 0, 0.3)',
            pathP1:      'rgba(79, 195, 247, 0.15)',
            pathP2:      'rgba(233, 69, 96, 0.15)',
            coord:       style.getPropertyValue('--coord-color').trim() || '#444'
        };
        _colorsDirty = false;
        return _cachedColors;
    }

    function drawWall(ctx, row, col, orientation, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (orientation === 'h') {
            const x1 = cellX(col);
            const x2 = cellX(col + 1) + CELL;
            const y  = cellY(row + 1) - GAP / 2;
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
        } else {
            const y1 = cellY(row);
            const y2 = cellY(row + 1) + CELL;
            const x  = cellX(col + 1) - GAP / 2;
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
        }
        ctx.stroke();
    }

    function drawPawn(ctx, row, col, color, label) {
        // Support fractional row/col for animation interpolation
        const x = PAD + col * (CELL + GAP) + CELL / 2;
        const y = PAD + row * (CELL + GAP) + CELL / 2;

        // Shadow for depth
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    function drawCoordinates(ctx, colors) {
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = colors.coord;
        ctx.textAlign = 'center';
        for (let c = 0; c < SIZE; c++) {
            ctx.fillText(String.fromCharCode(97 + c), cellX(c) + CELL / 2, PAD - 6);
        }
        ctx.textAlign = 'right';
        for (let r = 0; r < SIZE; r++) {
            ctx.fillText((r + 1).toString(), PAD - 6, cellY(r) + CELL / 2 + 4);
        }
    }

    function drawGoalIndicators(ctx, colors) {
        ctx.globalAlpha = 0.15;
        for (let c = 0; c < SIZE; c++) {
            ctx.fillStyle = colors.p1;
            ctx.fillRect(cellX(c), cellY(8), CELL, 3);
            ctx.fillStyle = colors.p2;
            ctx.fillRect(cellX(c), cellY(0) + CELL - 3, CELL, 3);
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Draw a basic board (used by training arena and replay).
     * For the interactive game board, ui.js adds its own overlays on top.
     */
    function drawBoard(canvas, state) {
        if (!canvas || !state) return;
        const ctx = canvas.getContext('2d');
        canvas.width = BOARD_PX;
        canvas.height = BOARD_PX;
        const C = getColors();

        // Background
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

        // Cells
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                ctx.fillStyle = C.cell;
                ctx.fillRect(cellX(c), cellY(r), CELL, CELL);
            }
        }

        drawCoordinates(ctx, C);

        // Walls
        for (const w of state.walls) {
            drawWall(ctx, w.row, w.col, w.orientation, C.wallPlaced, 4);
        }

        // Pawns
        drawPawn(ctx, state.players[0].row, state.players[0].col, C.p1, 'P1');
        drawPawn(ctx, state.players[1].row, state.players[1].col, C.p2, 'P2');

        // Goal indicators
        drawGoalIndicators(ctx, C);

        // Info overlay
        ctx.fillStyle = C.coord;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
            `P1: ${state.players[0].walls}w  P2: ${state.players[1].walls}w  Move: ${state.moveHistory.length}`,
            PAD, BOARD_PX - 5
        );
    }

    /**
     * Draw shortest path overlay for a player.
     */
    function drawPath(ctx, state, playerIdx, color) {
        const p = state.players[playerIdx];
        const opp = state.players[1 - playerIdx];
        const goalRow = p.goalRow;
        const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const parent  = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
        const queue = [{ row: p.row, col: p.col }];
        let head = 0;
        visited[p.row][p.col] = true;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        let found = null;

        while (head < queue.length) {
            const { row, col } = queue[head++];
            if (row === goalRow) { found = { row, col }; break; }

            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (visited[nr][nc]) continue;
                if (QuoridorGame.edgeBlocked(state.edges, row, col, nr, nc)) continue;
                // Skip opponent cell in path display (simplified — no jump)
                if (nr === opp.row && nc === opp.col) continue;
                visited[nr][nc] = true;
                parent[nr][nc] = { row, col };
                queue.push({ row: nr, col: nc });
            }
        }

        if (!found) return;

        // Trace back and highlight cells
        ctx.globalAlpha = 0.5;
        let cur = found;
        while (cur && !(cur.row === p.row && cur.col === p.col)) {
            ctx.fillStyle = color;
            ctx.fillRect(cellX(cur.col) + 2, cellY(cur.row) + 2, CELL - 4, CELL - 4);
            cur = parent[cur.row][cur.col];
        }
        ctx.globalAlpha = 1;
    }

    /* Theme toggle helper (shared between pages) */
    function initTheme() {
        const saved = localStorage.getItem('qouraid-theme') || 'dark';
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        return saved;
    }

    function toggleTheme() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('qouraid-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('qouraid-theme', 'light');
        }
        invalidateColors();
        return !isLight; // returns true if now light
    }

    return {
        SIZE, CELL, GAP, PAD, BOARD_PX,
        cellX, cellY,
        getColors, invalidateColors,
        drawWall, drawPawn, drawCoordinates, drawGoalIndicators,
        drawBoard, drawPath,
        initTheme, toggleTheme
    };
})();
