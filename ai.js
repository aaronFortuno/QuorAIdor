const QuoridorAI = (() => {
    let searchDepth = 2;
    let lastEvaluation = null;
    let nodesSearched = 0;

    function setDepth(d) { searchDepth = d; }

    function evaluate(state) {
        const dist0 = QuoridorGame.bfsShortestPath(state, 0);
        const dist1 = QuoridorGame.bfsShortestPath(state, 1);

        if (dist0 === 0) return 1000;
        if (dist1 === 0) return -1000;

        const pathDiff = dist1 - dist0;
        const wallDiff = state.players[0].walls - state.players[1].walls;
        const centerBonus0 = 4 - Math.abs(state.players[0].col - 4);
        const centerBonus1 = 4 - Math.abs(state.players[1].col - 4);
        const progressP0 = state.players[0].row / 8;
        const progressP1 = (8 - state.players[1].row) / 8;

        const turnBonus = state.currentPlayer === 0 ? 0.5 : -0.5;

        let wallThreat0 = 0;
        let wallThreat1 = 0;
        if (state.players[1].walls > 0 && dist0 <= 3) wallThreat0 = 1;
        if (state.players[0].walls > 0 && dist1 <= 3) wallThreat1 = 1;

        const score =
            pathDiff * 3.0 +
            wallDiff * 0.8 +
            (centerBonus0 - centerBonus1) * 0.3 +
            (progressP0 - progressP1) * 1.5 +
            (wallThreat1 - wallThreat0) * 0.5 +
            turnBonus;

        return score;
    }

    function getAnalysis(state) {
        const dist0 = QuoridorGame.bfsShortestPath(state, 0);
        const dist1 = QuoridorGame.bfsShortestPath(state, 1);
        const eval_ = evaluate(state);

        const winProbP1 = 1 / (1 + Math.pow(10, -eval_ / 4));

        return {
            evaluation: eval_,
            winProbP1: winProbP1,
            winProbP2: 1 - winProbP1,
            distP1: dist0,
            distP2: dist1,
            wallsP1: state.players[0].walls,
            wallsP2: state.players[1].walls,
            nodesSearched: nodesSearched,
            advantage: eval_ > 1 ? 'P1' : eval_ < -1 ? 'P2' : 'Even'
        };
    }

    function getScoredMoves(state) {
        const actions = getPrioritizedActions(state);
        const scored = [];
        for (const action of actions) {
            const newState = QuoridorGame.applyMove(state, action);
            const score = evaluate(newState);
            scored.push({ action, score });
        }
        scored.sort((a, b) => {
            if (state.currentPlayer === 0) return b.score - a.score;
            return a.score - b.score;
        });
        return scored;
    }

    function getPrioritizedActions(state) {
        const cp = state.currentPlayer;
        const moves = QuoridorGame.getValidMoves(state, cp);
        const moveActions = moves.map(m => ({ type: 'move', row: m.row, col: m.col }));

        moveActions.sort((a, b) => {
            const dA = Math.abs(a.row - state.players[cp].goalRow);
            const dB = Math.abs(b.row - state.players[cp].goalRow);
            return dA - dB;
        });

        if (state.players[cp].walls <= 0) return moveActions;

        const oppIdx = 1 - cp;
        const oppDist = QuoridorGame.bfsShortestPath(state, oppIdx);
        const wallActions = [];

        for (const ori of ['h', 'v']) {
            const placements = QuoridorGame.getValidWallPlacements(state, ori);
            for (const w of placements) {
                const testState = QuoridorGame.applyMove(state,
                    { type: 'wall', row: w.row, col: w.col, orientation: ori });
                const newOppDist = QuoridorGame.bfsShortestPath(testState, oppIdx);
                if (newOppDist > oppDist) {
                    wallActions.push({
                        type: 'wall', row: w.row, col: w.col, orientation: ori,
                        impact: newOppDist - oppDist
                    });
                }
            }
        }

        wallActions.sort((a, b) => b.impact - a.impact);
        const topWalls = wallActions.slice(0, 12);

        return [...moveActions, ...topWalls];
    }

    function minimax(state, depth, alpha, beta, maximizing) {
        nodesSearched++;

        if (depth === 0 || state.gameOver) {
            return { score: evaluate(state), action: null };
        }

        const actions = getPrioritizedActions(state);
        if (actions.length === 0) return { score: evaluate(state), action: null };

        let bestAction = actions[0];

        if (maximizing) {
            let maxScore = -Infinity;
            for (const action of actions) {
                const newState = QuoridorGame.applyMove(state, action);
                const result = minimax(newState, depth - 1, alpha, beta, false);
                if (result.score > maxScore) {
                    maxScore = result.score;
                    bestAction = action;
                }
                alpha = Math.max(alpha, maxScore);
                if (beta <= alpha) break;
            }
            return { score: maxScore, action: bestAction };
        } else {
            let minScore = Infinity;
            for (const action of actions) {
                const newState = QuoridorGame.applyMove(state, action);
                const result = minimax(newState, depth - 1, alpha, beta, true);
                if (result.score < minScore) {
                    minScore = result.score;
                    bestAction = action;
                }
                beta = Math.min(beta, minScore);
                if (beta <= alpha) break;
            }
            return { score: minScore, action: bestAction };
        }
    }

    function getBestMove(state) {
        nodesSearched = 0;
        const maximizing = state.currentPlayer === 0;
        const result = minimax(state, searchDepth, -Infinity, Infinity, maximizing);
        lastEvaluation = getAnalysis(state);
        lastEvaluation.nodesSearched = nodesSearched;
        return result.action;
    }

    function getBestMoveHint(state) {
        nodesSearched = 0;
        const maximizing = state.currentPlayer === 0;
        const result = minimax(state, Math.max(1, searchDepth - 1), -Infinity, Infinity, maximizing);
        if (!result.action) return null;

        const a = result.action;
        const pos = String.fromCharCode(97 + a.col) + (a.row + 1);
        if (a.type === 'move') {
            return I18n.t('bestMove', { pos: pos });
        } else {
            return I18n.t('bestWall', { pos: pos + (a.orientation === 'h' ? 'h' : 'v') });
        }
    }

    function getPositionSummary(state) {
        const analysis = getAnalysis(state);
        const lines = [];

        if (analysis.advantage === 'Even') {
            lines.push(I18n.t('positionBalanced'));
        } else {
            lines.push(I18n.t('positionAdvantage', { player: analysis.advantage }));
        }

        lines.push(I18n.t('p1Path', { steps: analysis.distP1 }) + ' | ' + I18n.t('p2Path', { steps: analysis.distP2 }));

        const tempo = analysis.distP2 - analysis.distP1;
        if (Math.abs(tempo) >= 2) {
            lines.push(I18n.t('strongTempo', { player: tempo > 0 ? 'P1' : 'P2' }));
        }

        if (analysis.wallsP1 === 0 && analysis.wallsP2 > 0) {
            lines.push(I18n.t('noWallsVulnerable', { player: 'P1' }));
        } else if (analysis.wallsP2 === 0 && analysis.wallsP1 > 0) {
            lines.push(I18n.t('noWallsVulnerable', { player: 'P2' }));
        }

        return lines.join('\n');
    }

    return {
        setDepth, evaluate, getAnalysis,
        getBestMove, getBestMoveHint, getPositionSummary,
        getScoredMoves
    };
})();
