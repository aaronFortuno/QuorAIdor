(() => {
    const { SIZE, CELL, GAP, PAD, BOARD_PX, cellX, cellY, getColors,
            drawWall: _drawWall, drawPawn: _drawPawn,
            drawCoordinates, drawGoalIndicators } = BoardRenderer;

    const canvas = document.getElementById('board-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = BOARD_PX;
    canvas.height = BOARD_PX;

    let state = null;
    let humanPlayer = 0;
    let aiPlayer = 1;
    let actionMode = 'move';
    let hoverCell = null;
    let hoverWall = null;
    let validMoves = [];
    let stateHistory = [];
    let aiThinking = false;
    let showPaths = false;
    const MAX_GAME_MOVES = 200;
    const positionCounts = new Map();

    const $ = id => document.getElementById(id);

    function positionKey(st) {
        // Compact position identifier for repetition detection
        return st.players[0].row + ',' + st.players[0].col + ',' +
               st.players[1].row + ',' + st.players[1].col + ',' +
               st.currentPlayer + ',' +
               st.walls.map(w => w.row + '' + w.col + w.orientation).sort().join(';');
    }

    function checkDrawConditions() {
        if (!state || state.gameOver) return false;

        // Max moves reached
        if (state.moveHistory.length >= MAX_GAME_MOVES) {
            state.gameOver = true;
            state.winner = -1;
            return true;
        }

        // Threefold repetition
        const key = positionKey(state);
        const count = (positionCounts.get(key) || 0) + 1;
        positionCounts.set(key, count);
        if (count >= 3) {
            state.gameOver = true;
            state.winner = -1;
            return true;
        }

        return false;
    }

    function initTheme() {
        const saved = BoardRenderer.initTheme();
        $('theme-icon').textContent = saved === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
    }

    function initLang() {
        const lang = I18n.getLang();
        document.querySelectorAll('.lang-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === lang);
        });
        I18n.applyTranslations();
    }

    $('theme-toggle').addEventListener('click', () => {
        const isNowLight = BoardRenderer.toggleTheme();
        $('theme-icon').textContent = isNowLight ? '\uD83C\uDF19' : '\u2600\uFE0F';
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
    $('back-menu-btn').addEventListener('click', () => {
        aiVsAiRunning = false;
        aiVsAiMode = false;
        showScreen('menu-screen');
    });
    $('rematch-btn').addEventListener('click', startNewGame);
    $('modal-menu-btn').addEventListener('click', () => {
        $('game-over-modal').classList.add('hidden');
        showScreen('menu-screen');
    });

    $('undo-btn').addEventListener('click', () => {
        if (stateHistory.length >= 2 && !aiThinking && !aiVsAiMode) {
            stateHistory.pop();
            stateHistory.pop();
            state = QuoridorGame.cloneState(stateHistory[stateHistory.length - 1]);
            state.moveHistory = state.moveHistory || [];
            updateValidMoves();
            updateUI();
            draw();
        }
    });

    // Toggle shortest path display
    $('paths-btn').addEventListener('click', () => {
        showPaths = !showPaths;
        $('paths-btn').classList.toggle('selected', showPaths);
        draw();
    });

    // AI vs AI mode
    let aiVsAiMode = false;
    let aiVsAiRunning = false;

    $('watch-ai-btn').addEventListener('click', startAIvsAI);

    function startAIvsAI() {
        $('game-over-modal').classList.add('hidden');

        const depthBtn = document.querySelector('[data-depth].selected');
        const depth = parseInt(depthBtn.dataset.depth);
        QuoridorAI.setDepth(depth);

        if (depth >= 3 && QuoridorAI.hasTrainedWeights()) {
            QuoridorAI.loadTrainedWeights();
        } else {
            QuoridorAI.resetWeights();
        }

        aiVsAiMode = true;
        humanPlayer = -1; // no human player
        aiPlayer = -1;

        state = QuoridorGame.createState();
        stateHistory = [QuoridorGame.cloneState(state)];
        positionCounts.clear();
        actionMode = 'move';

        const aiLabel = I18n.t('ai');
        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + aiLabel + ')';
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + aiLabel + ')';

        showScreen('game-screen');
        updateValidMoves();
        updateUI();
        draw();

        runAIvsAILoop();
    }

    async function runAIvsAILoop() {
        aiVsAiRunning = true;
        while (!state.gameOver && aiVsAiRunning) {
            $('turn-indicator').textContent = I18n.t('aiThinking');
            draw();

            // Yield to UI before computing
            await new Promise(r => setTimeout(r, 50));

            const move = QuoridorAI.getBestMove(state);
            if (!move) break;

            state = QuoridorGame.applyMove(state, move);
            stateHistory.push(QuoridorGame.cloneState(state));
            updateUI();
            draw();

            if (state.gameOver || checkDrawConditions()) {
                showGameOver();
                break;
            }

            // Small delay between moves so user can follow
            await new Promise(r => setTimeout(r, 200));
        }
        aiVsAiRunning = false;
        aiVsAiMode = false;
    }

    let usingTrainedWeights = false;

    function startNewGame() {
        // Stop any running AI vs AI game
        aiVsAiRunning = false;
        aiVsAiMode = false;

        $('game-over-modal').classList.add('hidden');
        const colorBtn = document.querySelector('[data-color].selected');
        humanPlayer = parseInt(colorBtn.dataset.color) - 1;
        aiPlayer = 1 - humanPlayer;

        const depthBtn = document.querySelector('[data-depth].selected');
        const depth = parseInt(depthBtn.dataset.depth);
        QuoridorAI.setDepth(depth);

        // For Hard (3) and Expert (4): use trained weights if available
        usingTrainedWeights = false;
        if (depth >= 3 && QuoridorAI.hasTrainedWeights()) {
            usingTrainedWeights = QuoridorAI.loadTrainedWeights();
        } else {
            QuoridorAI.resetWeights();
        }

        state = QuoridorGame.createState();
        stateHistory = [QuoridorGame.cloneState(state)];
        positionCounts.clear();
        actionMode = 'move';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.mode-btn[data-mode="move"]').classList.add('selected');

        const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
        const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';

        // Show trained badge if using trained weights
        updateTrainedBadge();

        showScreen('game-screen');
        updateValidMoves();
        updateUI();
        draw();

        if (state.currentPlayer === aiPlayer) {
            doAIMove();
        }
    }

    function updateTrainedBadge() {
        let badge = $('trained-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'trained-badge';
            badge.className = 'trained-badge';
            const turnIndicator = $('turn-indicator');
            turnIndicator.parentNode.insertBefore(badge, turnIndicator);
        }
        if (usingTrainedWeights) {
            badge.textContent = I18n.t('trainedAI');
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
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

    function handleBoardInput(clientX, clientY) {
        if (aiThinking || !state || state.gameOver) return;
        if (state.currentPlayer !== humanPlayer) return;

        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);

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
    }

    canvas.addEventListener('click', (e) => {
        handleBoardInput(e.clientX, e.clientY);
    });

    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        // Update hover for visual feedback
        const rect = canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        const hit = cellFromPixel(x, y);
        hoverCell = null;
        hoverWall = null;
        if (hit) {
            if (hit.type === 'cell' && actionMode === 'move') {
                hoverCell = hit;
            } else if (hit.type === 'wall-slot' || hit.type === 'cell') {
                if (actionMode.startsWith('wall')) {
                    const wRow = Math.min(hit.row, SIZE - 2);
                    const wCol = Math.min(hit.col, SIZE - 2);
                    hoverWall = { row: wRow, col: wCol, orientation: actionMode === 'wall-h' ? 'h' : 'v' };
                }
            }
        }
        draw();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            handleBoardInput(touch.clientX, touch.clientY);
        }
        hoverCell = null;
        hoverWall = null;
        draw();
    }, { passive: false });

    function applyHumanMove(move) {
        state = QuoridorGame.applyMove(state, move);
        stateHistory.push(QuoridorGame.cloneState(state));
        updateValidMoves();
        updateUI();
        draw();

        if (state.gameOver || checkDrawConditions()) {
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

            if (state.gameOver || checkDrawConditions()) {
                showGameOver();
            }
        }, 100);
    }

    function showGameOver() {
        const winner = state.winner;
        const isDraw = winner === -1;
        const isHumanWin = !aiVsAiMode && winner === humanPlayer;

        if (isDraw) {
            $('game-over-title').textContent = I18n.t('draw');
            $('game-over-msg').textContent = I18n.t('drawReason');
        } else if (aiVsAiMode) {
            $('game-over-title').textContent = I18n.t('gameOver');
            $('game-over-msg').textContent = (winner === 0 ? I18n.t('player1') : I18n.t('player2')) + ' wins!';
        } else {
            $('game-over-title').textContent = isHumanWin ? I18n.t('youWin') : I18n.t('aiWins');
            $('game-over-msg').textContent = isHumanWin
                ? I18n.t('congratulations')
                : I18n.t('aiReachedGoal');
        }

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

    function draw() {
        const COLORS = getColors();

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
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
                ctx.fillRect(cellX(c), cellY(r), CELL, CELL);
            }
        }

        drawCoordinates(ctx, COLORS);

        if (state) {
            for (const w of state.walls) {
                _drawWall(ctx, w.row, w.col, w.orientation, COLORS.wallPlaced, 4);
            }
        }

        if (hoverWall && state && !state.gameOver && state.currentPlayer === humanPlayer) {
            const valid = QuoridorGame.isValidWallPlacement(
                state, hoverWall.row, hoverWall.col, hoverWall.orientation);
            const color = valid ? COLORS.wallPreview : COLORS.wallInvalid;
            _drawWall(ctx, hoverWall.row, hoverWall.col, hoverWall.orientation, color, 6);
        }

        if (state) {
            // Shortest path visualization
            if (showPaths) {
                BoardRenderer.drawPath(ctx, state, 0, COLORS.pathP1);
                BoardRenderer.drawPath(ctx, state, 1, COLORS.pathP2);
            }

            _drawPawn(ctx, state.players[0].row, state.players[0].col, COLORS.p1, 'P1');
            _drawPawn(ctx, state.players[1].row, state.players[1].col, COLORS.p2, 'P2');

            drawGoalIndicators(ctx, COLORS);
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

    initTheme();
    initLang();
    draw();
})();
