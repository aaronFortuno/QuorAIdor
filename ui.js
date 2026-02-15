(() => {
    const SIZE = QuoridorGame.SIZE;
    const CELL = 50;
    const GAP = 8;
    const PAD = 20;
    const BOARD_PX = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2;

    const canvas = document.getElementById('board-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = BOARD_PX;
    canvas.height = BOARD_PX;

    function getColors() {
        const style = getComputedStyle(document.documentElement);
        return {
            bg: style.getPropertyValue('--board-bg').trim() || '#0d1b36',
            cell: style.getPropertyValue('--cell-bg').trim() || '#16213e',
            cellHover: style.getPropertyValue('--btn-selected-bg').trim() || '#1e2a4a',
            cellValid: 'rgba(79, 195, 247, 0.2)',
            gridLine: style.getPropertyValue('--border').trim() || '#0f3460',
            p1: '#4fc3f7',
            p2: '#e94560',
            wallPlaced: style.getPropertyValue('--text').trim() || '#e0e0e0',
            wallPreview: 'rgba(233, 69, 96, 0.5)',
            wallInvalid: 'rgba(255, 0, 0, 0.3)',
            pathP1: 'rgba(79, 195, 247, 0.08)',
            pathP2: 'rgba(233, 69, 96, 0.08)',
            coord: style.getPropertyValue('--coord-color').trim() || '#444'
        };
    }

    let state = null;
    let humanPlayer = 0;
    let aiPlayer = 1;
    let actionMode = 'move';
    let hoverCell = null;
    let hoverWall = null;
    let validMoves = [];
    let stateHistory = [];
    let aiThinking = false;

    const $ = id => document.getElementById(id);

    function initTheme() {
        const saved = localStorage.getItem('qouraid-theme') || 'dark';
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            $('theme-icon').textContent = '\uD83C\uDF19';
        } else {
            document.documentElement.removeAttribute('data-theme');
            $('theme-icon').textContent = '\u2600\uFE0F';
        }
    }

    function initLang() {
        const lang = I18n.getLang();
        document.querySelectorAll('.lang-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === lang);
        });
        I18n.applyTranslations();
    }

    $('theme-toggle').addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('qouraid-theme', 'dark');
            $('theme-icon').textContent = '\u2600\uFE0F';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('qouraid-theme', 'light');
            $('theme-icon').textContent = '\uD83C\uDF19';
        }
        draw();
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            I18n.setLang(btn.dataset.lang);
            if (state) updateUI();
        });
    });

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $(id).classList.add('active');
    }

    document.querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    document.querySelectorAll('[data-depth]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-depth]').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            actionMode = btn.dataset.mode;
            updateValidMoves();
            draw();
        });
    });

    $('start-btn').addEventListener('click', startNewGame);
    $('new-game-btn').addEventListener('click', startNewGame);
    $('back-menu-btn').addEventListener('click', () => showScreen('menu-screen'));
    $('rematch-btn').addEventListener('click', startNewGame);
    $('modal-menu-btn').addEventListener('click', () => {
        $('game-over-modal').classList.add('hidden');
        showScreen('menu-screen');
    });

    $('undo-btn').addEventListener('click', () => {
        if (stateHistory.length >= 2 && !aiThinking) {
            stateHistory.pop();
            stateHistory.pop();
            state = QuoridorGame.cloneState(stateHistory[stateHistory.length - 1]);
            state.moveHistory = state.moveHistory || [];
            updateValidMoves();
            updateUI();
            draw();
        }
    });

    function startNewGame() {
        $('game-over-modal').classList.add('hidden');
        const colorBtn = document.querySelector('[data-color].selected');
        humanPlayer = parseInt(colorBtn.dataset.color) - 1;
        aiPlayer = 1 - humanPlayer;

        const depthBtn = document.querySelector('[data-depth].selected');
        QuoridorAI.setDepth(parseInt(depthBtn.dataset.depth));

        state = QuoridorGame.createState();
        stateHistory = [QuoridorGame.cloneState(state)];
        actionMode = 'move';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.mode-btn[data-mode="move"]').classList.add('selected');

        const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
        const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';

        showScreen('game-screen');
        updateValidMoves();
        updateUI();
        draw();

        if (state.currentPlayer === aiPlayer) {
            doAIMove();
        }
    }

    function updateValidMoves() {
        if (!state || state.gameOver) { validMoves = []; return; }
        if (state.currentPlayer !== humanPlayer) { validMoves = []; return; }

        if (actionMode === 'move') {
            validMoves = QuoridorGame.getValidMoves(state, humanPlayer);
        } else {
            validMoves = [];
        }
    }

    function cellFromPixel(x, y) {
        const bx = x - PAD;
        const by = y - PAD;
        const col = Math.floor(bx / (CELL + GAP));
        const row = Math.floor(by / (CELL + GAP));
        const cx = bx - col * (CELL + GAP);
        const cy = by - row * (CELL + GAP);

        if (col >= 0 && col < SIZE && row >= 0 && row < SIZE && cx < CELL && cy < CELL) {
            return { type: 'cell', row, col };
        }

        if (actionMode === 'wall-h' || actionMode === 'wall-v') {
            const wCol = Math.floor(bx / (CELL + GAP));
            const wRow = Math.floor(by / (CELL + GAP));
            if (wCol >= 0 && wCol < SIZE - 1 && wRow >= 0 && wRow < SIZE - 1) {
                return { type: 'wall-slot', row: wRow, col: wCol };
            }
        }

        return null;
    }

    canvas.addEventListener('mousemove', (e) => {
        if (aiThinking || !state || state.gameOver) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const hit = cellFromPixel(x, y);
        hoverCell = null;
        hoverWall = null;

        if (hit) {
            if (hit.type === 'cell' && actionMode === 'move') {
                hoverCell = hit;
            } else if (hit.type === 'wall-slot' || hit.type === 'cell') {
                const r = hit.row;
                const c = hit.col;
                const wRow = Math.min(r, SIZE - 2);
                const wCol = Math.min(c, SIZE - 2);
                const ori = actionMode === 'wall-h' ? 'h' : 'v';
                if (actionMode.startsWith('wall')) {
                    hoverWall = { row: wRow, col: wCol, orientation: ori };
                }
            }
        }
        draw();
    });

    canvas.addEventListener('mouseleave', () => {
        hoverCell = null;
        hoverWall = null;
        draw();
    });

    canvas.addEventListener('click', (e) => {
        if (aiThinking || !state || state.gameOver) return;
        if (state.currentPlayer !== humanPlayer) return;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const hit = cellFromPixel(x, y);
        if (!hit) return;

        if (actionMode === 'move' && hit.type === 'cell') {
            const isValid = validMoves.some(m => m.row === hit.row && m.col === hit.col);
            if (isValid) {
                applyHumanMove({ type: 'move', row: hit.row, col: hit.col });
            }
        } else if (actionMode.startsWith('wall')) {
            const r = hit.row;
            const c = hit.col;
            const wRow = Math.min(r, SIZE - 2);
            const wCol = Math.min(c, SIZE - 2);
            const ori = actionMode === 'wall-h' ? 'h' : 'v';
            if (QuoridorGame.isValidWallPlacement(state, wRow, wCol, ori)) {
                applyHumanMove({ type: 'wall', row: wRow, col: wCol, orientation: ori });
            }
        }
    });

    function applyHumanMove(move) {
        state = QuoridorGame.applyMove(state, move);
        stateHistory.push(QuoridorGame.cloneState(state));
        updateValidMoves();
        updateUI();
        draw();

        if (state.gameOver) {
            showGameOver();
            return;
        }

        if (state.currentPlayer === aiPlayer) {
            doAIMove();
        }
    }

    function doAIMove() {
        aiThinking = true;
        $('turn-indicator').textContent = I18n.t('aiThinking');
        draw();

        setTimeout(() => {
            const move = QuoridorAI.getBestMove(state);
            if (move) {
                state = QuoridorGame.applyMove(state, move);
                stateHistory.push(QuoridorGame.cloneState(state));
            }
            aiThinking = false;
            updateValidMoves();
            updateUI();
            draw();

            if (state.gameOver) {
                showGameOver();
            }
        }, 100);
    }

    function showGameOver() {
        const winner = state.winner;
        const isHumanWin = winner === humanPlayer;
        $('game-over-title').textContent = isHumanWin ? I18n.t('youWin') : I18n.t('aiWins');
        $('game-over-msg').textContent = isHumanWin
            ? I18n.t('congratulations')
            : I18n.t('aiReachedGoal');
        $('game-over-stats').innerHTML =
            I18n.t('movesPlayed') + ': ' + state.moveHistory.length + '<br>' +
            I18n.t('wallsUsed') + ' - P1: ' + (QuoridorGame.TOTAL_WALLS - state.players[0].walls) +
            ' | P2: ' + (QuoridorGame.TOTAL_WALLS - state.players[1].walls);
        $('game-over-modal').classList.remove('hidden');
    }

    function updateUI() {
        if (!state) return;

        $('p1-walls').textContent = state.players[0].walls + ' ' + I18n.t('walls');
        $('p2-walls').textContent = state.players[1].walls + ' ' + I18n.t('walls');

        $('p1-info').classList.toggle('active-player', state.currentPlayer === 0);
        $('p2-info').classList.toggle('active-player', state.currentPlayer === 1);

        if (!aiThinking) {
            if (state.gameOver) {
                $('turn-indicator').textContent = I18n.t('gameOver');
            } else if (state.currentPlayer === humanPlayer) {
                $('turn-indicator').textContent = I18n.t('yourTurn');
            } else {
                $('turn-indicator').textContent = I18n.t('aiTurn');
            }
        }

        const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
        const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';

        updateEvalBar();
        updateMoveHistory();
        updateAnalysis();
    }

    function updateEvalBar() {
        const analysis = QuoridorAI.getAnalysis(state);
        const p2Pct = Math.max(2, Math.min(98, analysis.winProbP2 * 100));
        $('eval-fill-p2').style.height = p2Pct + '%';

        const evalScore = analysis.evaluation.toFixed(1);
        const sign = analysis.evaluation > 0 ? '+' : '';
        $('eval-score').textContent = sign + evalScore;

        $('eval-detail').textContent =
            I18n.t('p1Win') + ': ' + (analysis.winProbP1 * 100).toFixed(0) + '% | ' +
            I18n.t('p2Win') + ': ' + (analysis.winProbP2 * 100).toFixed(0) + '%';
    }

    function updateMoveHistory() {
        const list = $('move-list');
        list.innerHTML = '';
        const moves = state.moveHistory;
        for (let i = 0; i < moves.length; i += 2) {
            const entry = document.createElement('div');
            entry.className = 'move-entry';
            const num = Math.floor(i / 2) + 1;
            let html = '<span class="move-number">' + num + '.</span>';
            html += '<span class="move-p1">' + moves[i] + '</span>';
            if (i + 1 < moves.length) {
                html += '<span class="move-p2">' + moves[i + 1] + '</span>';
            }
            entry.innerHTML = html;
            list.appendChild(entry);
        }
        list.scrollTop = list.scrollHeight;
    }

    function updateAnalysis() {
        if (state.gameOver) {
            $('best-move-hint').textContent = '';
            $('position-summary').textContent = I18n.t('gameFinished');
            return;
        }

        if (state.currentPlayer === humanPlayer) {
            const hint = QuoridorAI.getBestMoveHint(state);
            $('best-move-hint').textContent = hint || '';
        } else {
            $('best-move-hint').textContent = '';
        }
        $('position-summary').textContent = QuoridorAI.getPositionSummary(state);
    }

    function cellX(col) { return PAD + col * (CELL + GAP); }
    function cellY(row) { return PAD + row * (CELL + GAP); }

    function draw() {
        const COLORS = getColors();

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const x = cellX(c);
                const y = cellY(r);
                let color = COLORS.cell;

                if (actionMode === 'move' && state && !state.gameOver &&
                    state.currentPlayer === humanPlayer) {
                    if (validMoves.some(m => m.row === r && m.col === c)) {
                        color = COLORS.cellValid;
                    }
                }

                if (hoverCell && hoverCell.row === r && hoverCell.col === c) {
                    const isValid = validMoves.some(m => m.row === r && m.col === c);
                    color = isValid ? COLORS.cellHover : COLORS.cell;
                }

                ctx.fillStyle = color;
                ctx.fillRect(x, y, CELL, CELL);
            }
        }

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = COLORS.coord;
        ctx.textAlign = 'center';
        for (let c = 0; c < SIZE; c++) {
            ctx.fillText(String.fromCharCode(97 + c), cellX(c) + CELL / 2, PAD - 6);
        }
        ctx.textAlign = 'right';
        for (let r = 0; r < SIZE; r++) {
            ctx.fillText((r + 1).toString(), PAD - 6, cellY(r) + CELL / 2 + 4);
        }

        if (state) {
            for (const w of state.walls) {
                drawWall(w.row, w.col, w.orientation, COLORS.wallPlaced, 4);
            }
        }

        if (hoverWall && state && !state.gameOver && state.currentPlayer === humanPlayer) {
            const valid = QuoridorGame.isValidWallPlacement(
                state, hoverWall.row, hoverWall.col, hoverWall.orientation);
            const color = valid ? COLORS.wallPreview : COLORS.wallInvalid;
            drawWall(hoverWall.row, hoverWall.col, hoverWall.orientation, color, 6);
        }

        if (state) {
            drawPawn(state.players[0].row, state.players[0].col, COLORS.p1, 'P1');
            drawPawn(state.players[1].row, state.players[1].col, COLORS.p2, 'P2');

            ctx.globalAlpha = 0.15;
            for (let c = 0; c < SIZE; c++) {
                ctx.fillStyle = COLORS.p1;
                ctx.fillRect(cellX(c), cellY(8), CELL, 3);
                ctx.fillStyle = COLORS.p2;
                ctx.fillRect(cellX(c), cellY(0) + CELL - 3, CELL, 3);
            }
            ctx.globalAlpha = 1;
        }

        if (aiThinking) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
            ctx.fillStyle = '#e94560';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(I18n.t('aiThinking'), BOARD_PX / 2, BOARD_PX / 2);
        }
    }

    function drawWall(row, col, orientation, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();

        if (orientation === 'h') {
            const x1 = cellX(col);
            const x2 = cellX(col + 1) + CELL;
            const y = cellY(row + 1) - GAP / 2;
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
        } else {
            const y1 = cellY(row);
            const y2 = cellY(row + 1) + CELL;
            const x = cellX(col + 1) - GAP / 2;
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
        }
        ctx.stroke();
    }

    function drawPawn(row, col, color, label) {
        const x = cellX(col) + CELL / 2;
        const y = cellY(row) + CELL / 2;

        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    initTheme();
    initLang();
    draw();
})();
