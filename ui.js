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
    let gameMode = 'vsAI'; // 'vsAI', 'hvh', 'aiVsAi'
    let hvhMode = false;
    let actionMode = 'move';
    let hoverCell = null;
    let hoverWall = null;
    let validMoves = [];
    let stateHistory = [];
    let aiThinking = false;
    let showPaths = false;
    const MAX_GAME_MOVES = 200;
    const positionCounts = new Map();

    // B1: Last move tracking
    let lastMove = null; // { from, to, type, player, wallGlowTurns }
    // B2: Invalid move flash
    let invalidFlash = null; // { row, col, startTime }
    // B3: AI thinking spinner angle
    let aiSpinnerAngle = 0;
    let aiSpinnerRAF = null;
    // D2: Pawn movement animation
    let pawnAnim = null; // { player, fromRow, fromCol, toRow, toCol, startTime, duration }
    // D3: Wall fade-in
    let wallFade = null; // { row, col, orientation, startTime, duration }
    // G2: Move history navigation
    let browsingHistory = false;
    let browseIndex = -1; // -1 means showing live state

    // H: Save/load game state
    const LS_GAME_STATE = 'qouraid-game-state';

    function checkContinueButton() {
        if (hasSavedGame()) {
            $('continue-btn').classList.remove('hidden');
        } else {
            $('continue-btn').classList.add('hidden');
        }
    }

    function autoSaveGame() {
        if (!state || state.gameOver || aiVsAiMode) return;
        try {
            const saveData = {
                stateHistory: stateHistory,
                humanPlayer: humanPlayer,
                aiPlayer: aiPlayer,
                hvhMode: hvhMode,
                gameMode: gameMode,
                usingTrainedWeights: usingTrainedWeights,
                positionCounts: Array.from(positionCounts.entries())
            };
            localStorage.setItem(LS_GAME_STATE, JSON.stringify(saveData));
        } catch (e) {
            console.warn('Could not auto-save game:', e);
        }
    }

    function clearSavedGame() {
        localStorage.removeItem(LS_GAME_STATE);
        $('continue-btn').classList.add('hidden');
    }

    function hasSavedGame() {
        return localStorage.getItem(LS_GAME_STATE) !== null;
    }

    function loadSavedGame() {
        try {
            const raw = localStorage.getItem(LS_GAME_STATE);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data.stateHistory || data.stateHistory.length === 0) return false;

            stateHistory = data.stateHistory.map(s => {
                // Rebuild edges and wallSet from walls
                const st = QuoridorGame.cloneState(s);
                return st;
            });
            state = QuoridorGame.cloneState(stateHistory[stateHistory.length - 1]);
            humanPlayer = data.humanPlayer;
            aiPlayer = data.aiPlayer;
            hvhMode = data.hvhMode || false;
            gameMode = data.gameMode || 'vsAI';
            usingTrainedWeights = data.usingTrainedWeights || false;
            positionCounts.clear();
            if (data.positionCounts) {
                for (const [k, v] of data.positionCounts) {
                    positionCounts.set(k, v);
                }
            }

            if (usingTrainedWeights) {
                QuoridorAI.loadTrainedWeights();
            }

            // Set labels
            if (hvhMode) {
                $('p1-info').querySelector('.player-label').textContent = I18n.t('player1');
                $('p2-info').querySelector('.player-label').textContent = I18n.t('player2');
                $('analysis-info').style.display = 'none';
                $('eval-bar-vertical').style.display = 'none';
                $('eval-detail').style.display = 'none';
            } else {
                const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
                const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
                $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
                $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';
                $('analysis-info').style.display = '';
                $('eval-bar-vertical').style.display = '';
                $('eval-detail').style.display = '';
            }

            lastMove = null;
            actionMode = 'move';
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
            document.querySelector('.mode-btn[data-mode="move"]').classList.add('selected');

            updateTrainedBadge();
            showScreen('game-screen');
            updateValidMoves();
            updateUI();
            draw();
            return true;
        } catch (e) {
            console.warn('Could not load saved game:', e);
            clearSavedGame();
            return false;
        }
    }

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
        const target = $(id);
        // Force display to enable transition
        target.style.display = 'block';
        // Trigger reflow to ensure transition plays
        void target.offsetWidth;
        target.classList.add('active');
    }

    // Mode selector logic
    function updateMenuForMode(mode) {
        gameMode = mode;
        const colorOpt = $('color-option');
        const diffOpt = $('difficulty-option');
        if (mode === 'hvh') {
            colorOpt.style.display = 'none';
            diffOpt.style.display = 'none';
        } else if (mode === 'aiVsAi') {
            colorOpt.style.display = 'none';
            diffOpt.style.display = '';
        } else {
            colorOpt.style.display = '';
            diffOpt.style.display = '';
        }
    }

    document.querySelectorAll('[data-mode-select]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-mode-select]').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateMenuForMode(btn.dataset.modeSelect);
        });
    });

    function updateDirectionHint() {
        const hint = $('direction-hint');
        if (!hint) return;
        const colorBtn = document.querySelector('[data-color].selected');
        if (!colorBtn) return;
        const color = parseInt(colorBtn.dataset.color);
        hint.textContent = color === 1 ? I18n.t('youMoveDown') : I18n.t('youMoveUp');
    }

    document.querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateDirectionHint();
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

    $('continue-btn').addEventListener('click', () => {
        loadSavedGame();
    });

    $('start-btn').addEventListener('click', () => {
        if (gameMode === 'aiVsAi') {
            startAIvsAI();
        } else if (gameMode === 'hvh') {
            startHvHGame();
        } else {
            startNewGame();
        }
    });
    $('new-game-btn').addEventListener('click', () => {
        if (hvhMode) startHvHGame();
        else if (aiVsAiMode) startAIvsAI();
        else startNewGame();
    });
    $('back-menu-btn').addEventListener('click', () => {
        if (state && !state.gameOver && !aiVsAiMode) {
            // Show confirmation modal
            $('confirm-exit-modal').classList.remove('hidden');
        } else {
            aiVsAiRunning = false;
            aiVsAiMode = false;
            hvhMode = false;
            showScreen('menu-screen');
            checkContinueButton();
        }
    });

    $('save-exit-btn').addEventListener('click', () => {
        autoSaveGame();
        $('confirm-exit-modal').classList.add('hidden');
        aiVsAiRunning = false;
        aiVsAiMode = false;
        hvhMode = false;
        showScreen('menu-screen');
        checkContinueButton();
    });

    $('discard-exit-btn').addEventListener('click', () => {
        clearSavedGame();
        $('confirm-exit-modal').classList.add('hidden');
        aiVsAiRunning = false;
        aiVsAiMode = false;
        hvhMode = false;
        showScreen('menu-screen');
        checkContinueButton();
    });

    $('cancel-exit-btn').addEventListener('click', () => {
        $('confirm-exit-modal').classList.add('hidden');
    });
    $('rematch-btn').addEventListener('click', () => {
        if (hvhMode) startHvHGame();
        else if (aiVsAiMode) startAIvsAI();
        else startNewGame();
    });
    $('modal-menu-btn').addEventListener('click', () => {
        $('game-over-modal').classList.add('hidden');
        showScreen('menu-screen');
    });

    $('undo-btn').addEventListener('click', () => {
        if (aiThinking || aiVsAiMode) return;
        const undoCount = hvhMode ? 1 : 2;
        if (stateHistory.length > undoCount) {
            for (let i = 0; i < undoCount; i++) stateHistory.pop();
            state = QuoridorGame.cloneState(stateHistory[stateHistory.length - 1]);
            state.moveHistory = state.moveHistory || [];
            updateValidMoves();
            updateUI();
            draw();
        }
    });

    $('resign-btn').addEventListener('click', () => {
        if (!state || state.gameOver || aiThinking || aiVsAiMode) return;
        state.gameOver = true;
        state.winner = hvhMode ? (1 - state.currentPlayer) : aiPlayer;
        showGameOver(true);
    });

    // Toggle shortest path display
    $('paths-btn').addEventListener('click', () => {
        showPaths = !showPaths;
        $('paths-btn').classList.toggle('selected', showPaths);
        localStorage.setItem('qouraid-paths', showPaths);
        draw();
    });

    // AI vs AI mode
    let aiVsAiMode = false;
    let aiVsAiRunning = false;

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
        lastMove = null;
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

            const prevState = state;
            const playerIdx = state.currentPlayer;
            const move = QuoridorAI.getBestMove(state);
            if (!move) break;

            state = QuoridorGame.applyMove(state, move);
            recordLastMove(move, playerIdx, prevState);
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

    function restoreSettings() {
        const savedColor = localStorage.getItem('qouraid-color');
        if (savedColor) {
            document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('selected'));
            const btn = document.querySelector('[data-color="' + savedColor + '"]');
            if (btn) btn.classList.add('selected');
        }
        const savedDepth = localStorage.getItem('qouraid-depth');
        if (savedDepth) {
            document.querySelectorAll('[data-depth]').forEach(b => b.classList.remove('selected'));
            const btn = document.querySelector('[data-depth="' + savedDepth + '"]');
            if (btn) btn.classList.add('selected');
        }
        const savedPaths = localStorage.getItem('qouraid-paths');
        if (savedPaths === 'true') {
            showPaths = true;
            $('paths-btn').classList.add('selected');
        }
    }

    function startNewGame() {
        // Stop any running AI vs AI game
        aiVsAiRunning = false;
        aiVsAiMode = false;
        hvhMode = false;

        $('game-over-modal').classList.add('hidden');
        const colorBtn = document.querySelector('[data-color].selected');
        humanPlayer = parseInt(colorBtn.dataset.color) - 1;
        aiPlayer = 1 - humanPlayer;

        const depthBtn = document.querySelector('[data-depth].selected');
        const depth = parseInt(depthBtn.dataset.depth);
        QuoridorAI.setDepth(depth);

        // Persist settings
        localStorage.setItem('qouraid-color', colorBtn.dataset.color);
        localStorage.setItem('qouraid-depth', depthBtn.dataset.depth);

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
        lastMove = null;
        actionMode = 'move';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.mode-btn[data-mode="move"]').classList.add('selected');

        const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
        const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';

        // Show analysis/eval panels (hidden in HvH mode)
        $('analysis-info').style.display = '';
        $('eval-bar-vertical').style.display = '';
        $('eval-detail').style.display = '';

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

    function startHvHGame() {
        aiVsAiRunning = false;
        aiVsAiMode = false;
        hvhMode = true;

        $('game-over-modal').classList.add('hidden');
        humanPlayer = 'both';
        aiPlayer = -1;

        state = QuoridorGame.createState();
        stateHistory = [QuoridorGame.cloneState(state)];
        positionCounts.clear();
        lastMove = null;
        actionMode = 'move';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.mode-btn[data-mode="move"]').classList.add('selected');

        $('p1-info').querySelector('.player-label').textContent = I18n.t('player1');
        $('p2-info').querySelector('.player-label').textContent = I18n.t('player2');

        // Hide analysis panel in HvH mode
        $('analysis-info').style.display = 'none';
        $('eval-bar-vertical').style.display = 'none';
        $('eval-detail').style.display = 'none';

        usingTrainedWeights = false;
        updateTrainedBadge();

        showScreen('game-screen');
        updateValidMoves();
        updateUI();
        draw();
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
        const isHumanTurn = hvhMode || (humanPlayer === state.currentPlayer);
        if (!isHumanTurn) { validMoves = []; return; }

        if (actionMode === 'move') {
            validMoves = QuoridorGame.getValidMoves(state, state.currentPlayer);
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

    function triggerInvalidFlash(row, col) {
        invalidFlash = { row, col, startTime: performance.now() };
        if (navigator.vibrate) navigator.vibrate(50);
        // Animate the flash for 300ms
        function animFlash() {
            const elapsed = performance.now() - invalidFlash.startTime;
            if (elapsed < 300) {
                draw();
                requestAnimationFrame(animFlash);
            } else {
                invalidFlash = null;
                draw();
            }
        }
        requestAnimationFrame(animFlash);
    }

    function handleBoardInput(clientX, clientY) {
        if (aiThinking || !state || state.gameOver) return;
        if (!hvhMode && state.currentPlayer !== humanPlayer) return;

        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);

        const hit = cellFromPixel(x, y);
        if (!hit) return;

        if (actionMode === 'move' && hit.type === 'cell') {
            const isValid = validMoves.some(m => m.row === hit.row && m.col === hit.col);
            if (isValid) {
                applyHumanMove({ type: 'move', row: hit.row, col: hit.col });
            } else {
                triggerInvalidFlash(hit.row, hit.col);
            }
        } else if (actionMode.startsWith('wall')) {
            const r = hit.row;
            const c = hit.col;
            const wRow = Math.min(r, SIZE - 2);
            const wCol = Math.min(c, SIZE - 2);
            const ori = actionMode === 'wall-h' ? 'h' : 'v';
            if (QuoridorGame.isValidWallPlacement(state, wRow, wCol, ori)) {
                applyHumanMove({ type: 'wall', row: wRow, col: wCol, orientation: ori });
            } else {
                triggerInvalidFlash(wRow, wCol);
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

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function startPawnAnim(player, fromRow, fromCol, toRow, toCol) {
        pawnAnim = { player, fromRow, fromCol, toRow, toCol, startTime: performance.now(), duration: 200 };
        function animLoop() {
            const elapsed = performance.now() - pawnAnim.startTime;
            if (elapsed < pawnAnim.duration) {
                draw();
                requestAnimationFrame(animLoop);
            } else {
                pawnAnim = null;
                draw();
            }
        }
        requestAnimationFrame(animLoop);
    }

    function startWallFade(row, col, orientation) {
        wallFade = { row, col, orientation, startTime: performance.now(), duration: 150 };
        function animLoop() {
            const elapsed = performance.now() - wallFade.startTime;
            if (elapsed < wallFade.duration) {
                draw();
                requestAnimationFrame(animLoop);
            } else {
                wallFade = null;
                draw();
            }
        }
        requestAnimationFrame(animLoop);
    }

    function recordLastMove(move, playerIdx, prevState) {
        // Decrement glow turns on previous wall move
        if (lastMove && lastMove.type === 'wall' && lastMove.wallGlowTurns > 0) {
            lastMove.wallGlowTurns--;
        }
        if (move.type === 'move') {
            const fromRow = prevState.players[playerIdx].row;
            const fromCol = prevState.players[playerIdx].col;
            lastMove = {
                type: 'move',
                from: { row: fromRow, col: fromCol },
                to: { row: move.row, col: move.col },
                player: playerIdx
            };
            startPawnAnim(playerIdx, fromRow, fromCol, move.row, move.col);
        } else {
            lastMove = {
                type: 'wall',
                row: move.row,
                col: move.col,
                orientation: move.orientation,
                player: playerIdx,
                wallGlowTurns: 3
            };
            startWallFade(move.row, move.col, move.orientation);
        }
    }

    function applyHumanMove(move) {
        const prevState = state;
        const playerIdx = state.currentPlayer;
        state = QuoridorGame.applyMove(state, move);
        recordLastMove(move, playerIdx, prevState);
        stateHistory.push(QuoridorGame.cloneState(state));
        updateValidMoves();
        updateUI();
        draw();
        autoSaveGame();

        if (state.gameOver || checkDrawConditions()) {
            showGameOver();
            return;
        }

        if (!hvhMode && state.currentPlayer === aiPlayer) {
            doAIMove();
        }
    }

    function startAISpinner() {
        if (aiSpinnerRAF) return;
        function spin() {
            aiSpinnerAngle = (aiSpinnerAngle + 4) % 360;
            draw();
            if (aiThinking) aiSpinnerRAF = requestAnimationFrame(spin);
        }
        aiSpinnerRAF = requestAnimationFrame(spin);
    }

    function stopAISpinner() {
        if (aiSpinnerRAF) {
            cancelAnimationFrame(aiSpinnerRAF);
            aiSpinnerRAF = null;
        }
    }

    function doAIMove() {
        aiThinking = true;
        $('turn-indicator').textContent = I18n.t('aiThinking');
        startAISpinner();

        setTimeout(() => {
            const prevState = state;
            const playerIdx = state.currentPlayer;
            const move = QuoridorAI.getBestMove(state);
            if (move) {
                state = QuoridorGame.applyMove(state, move);
                recordLastMove(move, playerIdx, prevState);
                stateHistory.push(QuoridorGame.cloneState(state));
            }
            aiThinking = false;
            stopAISpinner();
            updateValidMoves();
            updateUI();
            draw();
            autoSaveGame();

            if (state.gameOver || checkDrawConditions()) {
                showGameOver();
            }
        }, 100);
    }

    function showGameOver(resigned) {
        const winner = state.winner;
        const isDraw = winner === -1;
        const isHumanWin = !aiVsAiMode && !hvhMode && winner === humanPlayer;

        if (isDraw) {
            $('game-over-title').textContent = I18n.t('draw');
            $('game-over-msg').textContent = I18n.t('drawReason');
        } else if (hvhMode) {
            $('game-over-title').textContent = winner === 0 ? I18n.t('p1Wins') : I18n.t('p2Wins');
            $('game-over-msg').textContent = resigned
                ? I18n.t('youResigned')
                : (winner === 0 ? I18n.t('p1ReachedGoal') : I18n.t('p2ReachedGoal'));
        } else if (aiVsAiMode) {
            $('game-over-title').textContent = I18n.t('gameOver');
            $('game-over-msg').textContent = (winner === 0 ? I18n.t('player1') : I18n.t('player2')) + ' wins!';
        } else {
            $('game-over-title').textContent = isHumanWin ? I18n.t('youWin') : I18n.t('aiWins');
            $('game-over-msg').textContent = resigned
                ? I18n.t('youResigned')
                : (isHumanWin ? I18n.t('congratulations') : I18n.t('aiReachedGoal'));
        }

        $('game-over-stats').innerHTML =
            I18n.t('movesPlayed') + ': ' + state.moveHistory.length + '<br>' +
            I18n.t('wallsUsed') + ' - P1: ' + (QuoridorGame.TOTAL_WALLS - state.players[0].walls) +
            ' | P2: ' + (QuoridorGame.TOTAL_WALLS - state.players[1].walls);
        $('game-over-modal').classList.remove('hidden');
        clearSavedGame();
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
            } else if (hvhMode) {
                $('turn-indicator').textContent = state.currentPlayer === 0 ? I18n.t('turnP1') : I18n.t('turnP2');
            } else if (state.currentPlayer === humanPlayer) {
                $('turn-indicator').textContent = I18n.t('yourTurn');
            } else {
                $('turn-indicator').textContent = I18n.t('aiTurn');
            }
        }

        if (!hvhMode && !aiVsAiMode) {
            const p1Label = humanPlayer === 0 ? I18n.t('you') : I18n.t('ai');
            const p2Label = humanPlayer === 1 ? I18n.t('you') : I18n.t('ai');
            $('p1-info').querySelector('.player-label').textContent = I18n.t('player1') + ' (' + p1Label + ')';
            $('p2-info').querySelector('.player-label').textContent = I18n.t('player2') + ' (' + p2Label + ')';
        }

        updateEvalBar();
        updateMoveHistory();
        updateAnalysis();
    }

    function updateEvalBar() {
        if (hvhMode) return; // No eval bar in HvH mode
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
        const currentIdx = browsingHistory ? browseIndex : moves.length;
        for (let i = 0; i < moves.length; i += 2) {
            const entry = document.createElement('div');
            entry.className = 'move-entry';
            const num = Math.floor(i / 2) + 1;
            let html = '<span class="move-number">' + num + '.</span>';
            const p1Active = (i + 1) === currentIdx || (i === currentIdx - 1 && currentIdx % 2 === 1);
            const p2Active = (i + 2) === currentIdx || (i + 1 === currentIdx - 1);
            html += '<span class="move-p1' + (i < currentIdx ? '' : ' move-future') + '">' + moves[i] + '</span>';
            if (i + 1 < moves.length) {
                html += '<span class="move-p2' + (i + 1 < currentIdx ? '' : ' move-future') + '">' + moves[i + 1] + '</span>';
            }
            entry.innerHTML = html;
            entry.style.cursor = 'pointer';
            const moveIdx = i;
            entry.addEventListener('click', () => navigateToMove(moveIdx + 1));
            list.appendChild(entry);
        }
        list.scrollTop = list.scrollHeight;
    }

    function navigateToMove(moveIndex) {
        if (!stateHistory || stateHistory.length <= 1) return;
        const targetIdx = Math.max(0, Math.min(moveIndex, stateHistory.length - 1));
        browsingHistory = targetIdx < stateHistory.length - 1;
        browseIndex = targetIdx;
        const browseState = QuoridorGame.cloneState(stateHistory[targetIdx]);
        // Temporarily show the browse state
        const realState = state;
        state = browseState;
        updateMoveHistory();
        draw();
        state = realState;
        if (!browsingHistory) {
            browseIndex = -1;
            updateValidMoves();
            updateUI();
            draw();
        }
    }

    function updateAnalysis() {
        if (hvhMode) return; // No AI analysis in HvH mode

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
        $('position-summary').textContent = QuoridorAI.getPositionSummary(state, humanPlayer);
    }

    function draw() {
        const COLORS = getColors();

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                let color = COLORS.cell;

                // B1: Highlight last move origin (semi-transparent)
                if (lastMove && lastMove.type === 'move' &&
                    lastMove.from.row === r && lastMove.from.col === c) {
                    color = lastMove.player === 0 ? 'rgba(79, 195, 247, 0.15)' : 'rgba(233, 69, 96, 0.15)';
                }
                // B1: Highlight last move destination
                if (lastMove && lastMove.type === 'move' &&
                    lastMove.to.row === r && lastMove.to.col === c) {
                    color = lastMove.player === 0 ? 'rgba(79, 195, 247, 0.3)' : 'rgba(233, 69, 96, 0.3)';
                }

                const isHumanTurnDraw = state && !state.gameOver && (hvhMode || state.currentPlayer === humanPlayer);
                if (actionMode === 'move' && isHumanTurnDraw) {
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

                // B1: Draw border on last move destination cell
                if (lastMove && lastMove.type === 'move' &&
                    lastMove.to.row === r && lastMove.to.col === c) {
                    ctx.strokeStyle = lastMove.player === 0 ? COLORS.p1 : COLORS.p2;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cellX(c) + 1, cellY(r) + 1, CELL - 2, CELL - 2);
                }
            }
        }

        // B2: Invalid move flash overlay
        if (invalidFlash) {
            const elapsed = performance.now() - invalidFlash.startTime;
            const alpha = Math.max(0, 0.4 * (1 - elapsed / 300));
            ctx.fillStyle = 'rgba(255, 0, 0, ' + alpha + ')';
            ctx.fillRect(cellX(invalidFlash.col), cellY(invalidFlash.row), CELL, CELL);
        }

        drawCoordinates(ctx, COLORS);

        if (state) {
            for (const w of state.walls) {
                // B1: Glow on last placed wall
                let wallColor = COLORS.wallPlaced;
                let wallWidth = 4;
                if (lastMove && lastMove.type === 'wall' && lastMove.wallGlowTurns > 0 &&
                    lastMove.row === w.row && lastMove.col === w.col &&
                    lastMove.orientation === w.orientation) {
                    wallColor = lastMove.player === 0 ? COLORS.p1 : COLORS.p2;
                    wallWidth = 6;
                    ctx.shadowColor = wallColor;
                    ctx.shadowBlur = 8;
                }
                // D3: Wall fade-in
                if (wallFade && wallFade.row === w.row && wallFade.col === w.col &&
                    wallFade.orientation === w.orientation) {
                    const elapsed = performance.now() - wallFade.startTime;
                    ctx.globalAlpha = Math.min(1, elapsed / wallFade.duration);
                }
                _drawWall(ctx, w.row, w.col, w.orientation, wallColor, wallWidth);
                ctx.globalAlpha = 1;
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
        }

        if (hoverWall && state && !state.gameOver && (hvhMode || state.currentPlayer === humanPlayer)) {
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

            // D2: Draw pawns with animation interpolation
            for (let pi = 0; pi < 2; pi++) {
                const p = state.players[pi];
                const color = pi === 0 ? COLORS.p1 : COLORS.p2;
                const label = 'P' + (pi + 1);
                if (pawnAnim && pawnAnim.player === pi) {
                    const elapsed = performance.now() - pawnAnim.startTime;
                    const t = Math.min(1, elapsed / pawnAnim.duration);
                    const e = easeOut(t);
                    const animRow = pawnAnim.fromRow + (pawnAnim.toRow - pawnAnim.fromRow) * e;
                    const animCol = pawnAnim.fromCol + (pawnAnim.toCol - pawnAnim.fromCol) * e;
                    _drawPawn(ctx, animRow, animCol, color, label);
                } else {
                    _drawPawn(ctx, p.row, p.col, color, label);
                }
            }

            drawGoalIndicators(ctx, COLORS);
        }

        // B3: Improved AI thinking indicator with spinner
        if (aiThinking) {
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

            const cx = BOARD_PX / 2;
            const cy = BOARD_PX / 2 - 10;
            const radius = 18;

            // Spinner arc
            ctx.save();
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const startAngle = (aiSpinnerAngle * Math.PI / 180);
            ctx.arc(cx, cy, radius, startAngle, startAngle + Math.PI * 1.4);
            ctx.stroke();
            ctx.restore();

            // Text below spinner
            ctx.fillStyle = '#eee';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(I18n.t('aiThinking'), cx, cy + radius + 10);
            ctx.textBaseline = 'alphabetic';
        }
    }

    // F: How to Play modal
    $('how-to-play-btn').addEventListener('click', showRules);
    $('rules-close-btn').addEventListener('click', () => {
        $('rules-modal').classList.add('hidden');
    });

    function showRules() {
        const body = $('rules-body');
        const sections = [
            { title: 'rulesGoalTitle', text: 'rulesGoalText' },
            { title: 'rulesMovementTitle', text: 'rulesMovementText' },
            { title: 'rulesWallsTitle', text: 'rulesWallsText' },
            { title: 'rulesJumpsTitle', text: 'rulesJumpsText' },
        ];

        let html = '';
        for (const s of sections) {
            html += '<div class="rules-section"><h3>' + I18n.t(s.title) + '</h3>';
            html += '<p>' + I18n.t(s.text) + '</p></div>';
        }

        html += '<div class="rules-section"><h3>' + I18n.t('rulesTipsTitle') + '</h3>';
        html += '<div class="rules-tip">' + I18n.t('rulesTip1') + '</div>';
        html += '<div class="rules-tip">' + I18n.t('rulesTip2') + '</div>';
        html += '<div class="rules-tip">' + I18n.t('rulesTip3') + '</div>';
        html += '</div>';

        body.innerHTML = html;
        $('rules-modal').classList.remove('hidden');
    }

    // E2: Mobile tabs for right panel
    function initMobileTabs() {
        if (window.innerWidth > 600) return;
        const rightPanel = $('right-panel');
        if (rightPanel.querySelector('.mobile-tabs')) return;

        const tabBar = document.createElement('div');
        tabBar.className = 'mobile-tabs';
        const tabs = [
            { id: 'tab-info', label: 'Info', target: 'info-section' },
            { id: 'tab-moves', label: 'Moves', target: 'move-list' },
            { id: 'tab-analysis', label: 'Analysis', target: 'analysis-info' }
        ];

        // Move info section to right panel for mobile
        const infoSection = $('info-section');
        const infoClone = infoSection;

        tabs.forEach((t, i) => {
            const btn = document.createElement('button');
            btn.className = 'mobile-tab' + (i === 0 ? ' active' : '');
            btn.textContent = t.label;
            btn.dataset.target = t.target;
            btn.addEventListener('click', () => {
                tabBar.querySelectorAll('.mobile-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Show/hide sections
                tabs.forEach(tab => {
                    const el = $(tab.target);
                    if (el) el.style.display = tab.target === t.target ? '' : 'none';
                });
            });
            tabBar.appendChild(btn);
        });

        rightPanel.insertBefore(tabBar, rightPanel.firstChild);
    }

    window.addEventListener('resize', () => {
        initMobileTabs();
    });

    initTheme();
    initLang();
    restoreSettings();
    updateDirectionHint();
    checkContinueButton();
    initMobileTabs();
    draw();
})();
