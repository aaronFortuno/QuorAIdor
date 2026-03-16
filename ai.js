const QuoridorAI = (() => {
    let searchDepth = 2;
    let lastEvaluation = null;
    let nodesSearched = 0;

    /* ===================================================================
     *  GENOME: Parameterized weights for evolutionary training
     * =================================================================== */

    const DEFAULT_WEIGHTS = {
        // -- Core path evaluation --
        pathDiff:       4.0,    // dist(opp) - dist(self): primary signal

        // -- Wall economy --
        wallReserve:    1.8,    // sqrt-scaled value of each wall remaining
        wallReserveExp: 0.5,    // exponent for wallReserve (0.5 = sqrt)

        // -- Positional --
        centerControl:  0.25,   // center column proximity
        progress:       1.2,    // row advancement toward goal

        // -- Tactical --
        turnBonus:      0.55,   // tempo advantage
        wallThreatNear: 2.5,    // opponent near goal + we have walls = threat
        wallThreatFar:  0.6,    // opponent mid-range + we have walls

        // -- Mobility & defense --
        mobility:       0.15,   // valid-move-count difference

        // -- Corridor vulnerability (NEW) --
        corridorRisk:   1.5,    // penalty when shortest path is a narrow corridor
        noWallsRush:    1.0,    // bonus for rushing when opponent has no walls

        // -- Wall synergy (NEW) --
        wallSynergy:    0.8,    // bonus for walls that create follow-up threats

        // -- Game phase multipliers --
        openingPathMul: 0.7,    // path weights in opening
        openingWallMul: 1.6,    // wall weights in opening (conserve!)
        midgamePathMul: 1.0,    // path weights in midgame
        midgameWallMul: 1.3,    // wall weights in midgame (still conserve)
        endgamePathMul: 1.6,    // path weights in endgame (rush!)
        endgameWallMul: 0.3,    // wall weights in endgame (spend freely)

        // -- Wall placement strategy --
        wallOffensiveW:    1.0, // weight of opponent-path-increase in wall scoring
        wallDefensiveW:    0.6, // weight of self-path-shortening in wall scoring
        wallMinNetImpact:  0.3, // minimum net score for a wall to be considered
        wallMaxCandidates: 15,  // top-N walls kept after scoring
    };

    let activeWeights = { ...DEFAULT_WEIGHTS };

    function setWeights(w) { activeWeights = { ...DEFAULT_WEIGHTS, ...w }; }
    function getWeights() { return { ...activeWeights }; }
    function getDefaultWeights() { return { ...DEFAULT_WEIGHTS }; }
    function resetWeights() { activeWeights = { ...DEFAULT_WEIGHTS }; }
    function setDepth(d) { searchDepth = d; }

    /**
     * Load trained weights from localStorage if available.
     * Returns true if trained weights were loaded, false otherwise.
     */
    function loadTrainedWeights() {
        try {
            const raw = localStorage.getItem('qouraid-trained-weights');
            if (!raw) return false;
            const w = JSON.parse(raw);
            if (w && typeof w.pathDiff === 'number') {
                activeWeights = { ...DEFAULT_WEIGHTS, ...w };
                return true;
            }
        } catch (e) {
            console.warn('Could not load trained weights:', e);
        }
        return false;
    }

    function hasTrainedWeights() {
        return localStorage.getItem('qouraid-trained-weights') !== null;
    }

    /* ===================================================================
     *  GAME PHASE DETECTION
     *  0 = opening, 1 = midgame, 2 = endgame
     * =================================================================== */

    function getGamePhase(state, dist0, dist1) {
        const wallsUsed = (10 - state.players[0].walls) + (10 - state.players[1].walls);
        // Use pre-computed distances if available, else compute
        const d0 = dist0 !== undefined ? dist0 : QuoridorGame.bfsShortestPath(state, 0);
        const d1 = dist1 !== undefined ? dist1 : QuoridorGame.bfsShortestPath(state, 1);
        const minDist = Math.min(d0, d1);

        if (minDist <= 3 || wallsUsed >= 14) return 2;  // endgame
        if (wallsUsed >= 3) return 1;                    // midgame
        return 0;                                         // opening
    }

    /* ===================================================================
     *  EVALUATION FUNCTION
     *  Positive = P1 (maximizer) advantage
     *  Accepts optional weights for training
     * =================================================================== */

    /**
     * Count how many distinct "first steps" lead to shortest paths.
     * Low count = narrow corridor = vulnerable to a single wall.
     */
    function countShortestPathDiversity(state, playerIdx) {
        const p = state.players[playerIdx];
        const goalRow = p.goalRow;
        const edges = state.edges;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        // BFS to find shortest distance
        const dist = Array.from({ length: 9 }, () => Array(9).fill(-1));
        const queue = [{ row: p.row, col: p.col }];
        let head = 0;
        dist[p.row][p.col] = 0;
        let goalDist = -1;

        while (head < queue.length) {
            const { row, col } = queue[head++];
            const d = dist[row][col];
            if (row === goalRow && goalDist === -1) goalDist = d;
            if (goalDist !== -1 && d > goalDist) break;

            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
                if (dist[nr][nc] !== -1) continue;
                if (QuoridorGame.edgeBlocked(edges, row, col, nr, nc)) continue;
                dist[nr][nc] = d + 1;
                queue.push({ row: nr, col: nc });
            }
        }

        if (goalDist <= 0) return 4; // at goal or no path

        // Count distinct first-step neighbors that lie on a shortest path
        let diversity = 0;
        for (const [dr, dc] of dirs) {
            const nr = p.row + dr;
            const nc = p.col + dc;
            if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
            if (QuoridorGame.edgeBlocked(edges, p.row, p.col, nr, nc)) continue;
            if (dist[nr][nc] === 1) {
                // Check if this neighbor can reach goal in goalDist-1
                // (it's on a shortest path if its own shortest dist to goal = goalDist - 1)
                // Since dist[nr][nc] = 1, we need to check if from (nr,nc) there's a path of goalDist-1
                // We already have BFS distances from start, so we use a simpler heuristic:
                // This neighbor is on a shortest path if it's one step closer from BFS perspective
                diversity++;
            }
        }
        return diversity;
    }

    function evaluate(state, w) {
        w = w || activeWeights;

        const dist0 = QuoridorGame.bfsWithJumps(state, 0);
        const dist1 = QuoridorGame.bfsWithJumps(state, 1);

        if (dist0 === 0) return 1000;
        if (dist1 === 0) return -1000;

        // Phase multipliers — pass pre-computed distances to avoid redundant BFS
        const phase = getGamePhase(state, dist0, dist1);
        let pMul, wMul;
        if (phase === 0)      { pMul = w.openingPathMul; wMul = w.openingWallMul; }
        else if (phase === 1) { pMul = w.midgamePathMul; wMul = w.midgameWallMul; }
        else                  { pMul = w.endgamePathMul; wMul = w.endgameWallMul; }

        // Core path (single term, no collinearity)
        const pathDiff = (dist1 - dist0) * w.pathDiff * pMul;

        // Wall economy (sqrt-scaled: losing last walls very expensive)
        const walls0 = state.players[0].walls;
        const walls1 = state.players[1].walls;
        const reserve0 = Math.pow(walls0, w.wallReserveExp) * w.wallReserve * wMul;
        const reserve1 = Math.pow(walls1, w.wallReserveExp) * w.wallReserve * wMul;
        const wallReserveScore = reserve0 - reserve1;

        // Positional
        const center0 = 4 - Math.abs(state.players[0].col - 4);
        const center1 = 4 - Math.abs(state.players[1].col - 4);
        const centerScore = (center0 - center1) * w.centerControl;

        const prog0 = state.players[0].row / 8;
        const prog1 = (8 - state.players[1].row) / 8;
        const progressScore = (prog0 - prog1) * w.progress * pMul;

        // Tempo
        const turnScore = (state.currentPlayer === 0 ? 1 : -1) * w.turnBonus;

        // Wall threats (graduated by distance)
        let threat0 = 0, threat1 = 0;
        if (walls1 > 0) {
            const ratio1 = walls1 / 10;
            if (dist0 <= 2)      threat0 = w.wallThreatNear * ratio1;
            else if (dist0 <= 5) threat0 = w.wallThreatFar * ratio1;
        }
        if (walls0 > 0) {
            const ratio0 = walls0 / 10;
            if (dist1 <= 2)      threat1 = w.wallThreatNear * ratio0;
            else if (dist1 <= 5) threat1 = w.wallThreatFar * ratio0;
        }
        const threatScore = threat1 - threat0;

        // Mobility
        const mob0 = QuoridorGame.getValidMoves(state, 0).length;
        const mob1 = QuoridorGame.getValidMoves(state, 1).length;
        const mobilityScore = (mob0 - mob1) * w.mobility;

        // Corridor vulnerability: penalize when path diversity is low and opponent has walls
        let corridorScore = 0;
        if (w.corridorRisk && (walls0 > 0 || walls1 > 0)) {
            const div0 = countShortestPathDiversity(state, 0);
            const div1 = countShortestPathDiversity(state, 1);
            // Low diversity = vulnerable. Scale by opponent's wall count.
            const vuln0 = (walls1 > 0 && div0 <= 1) ? -w.corridorRisk * (walls1 / 10) : 0;
            const vuln1 = (walls0 > 0 && div1 <= 1) ?  w.corridorRisk * (walls0 / 10) : 0;
            corridorScore = vuln0 + vuln1;
        }

        // No-walls rush: bonus for advancing when opponent has no walls
        let rushScore = 0;
        if (w.noWallsRush) {
            if (walls1 === 0 && dist0 <= 5) rushScore += w.noWallsRush * (6 - dist0) / 6;
            if (walls0 === 0 && dist1 <= 5) rushScore -= w.noWallsRush * (6 - dist1) / 6;
        }

        return pathDiff + wallReserveScore +
               centerScore + progressScore + turnScore + threatScore +
               mobilityScore + corridorScore + rushScore;
    }

    /* ===================================================================
     *  ANALYSIS (for UI display)
     * =================================================================== */

    function getAnalysis(state) {
        const dist0 = QuoridorGame.bfsWithJumps(state, 0);
        const dist1 = QuoridorGame.bfsWithJumps(state, 1);
        const eval_ = evaluate(state);
        const winProbP1 = 1 / (1 + Math.pow(10, -eval_ / 5));

        return {
            evaluation: eval_,
            winProbP1,
            winProbP2: 1 - winProbP1,
            distP1: dist0,
            distP2: dist1,
            wallsP1: state.players[0].walls,
            wallsP2: state.players[1].walls,
            phase: getGamePhase(state, dist0, dist1),
            nodesSearched,
            advantage: eval_ > 1.5 ? 'P1' : eval_ < -1.5 ? 'P2' : 'Even'
        };
    }

    /* ===================================================================
     *  MOVE PRIORITIZATION
     *  Considers offensive AND defensive walls, with net-impact scoring
     * =================================================================== */

    function getPrioritizedActions(state, w) {
        w = w || activeWeights;
        const cp = state.currentPlayer;
        const oppIdx = 1 - cp;

        // -- Pawn moves: sorted by proximity to goal --
        const moves = QuoridorGame.getValidMoves(state, cp);
        const moveActions = moves.map(m => ({ type: 'move', row: m.row, col: m.col }));
        moveActions.sort((a, b) => {
            const dA = Math.abs(a.row - state.players[cp].goalRow);
            const dB = Math.abs(b.row - state.players[cp].goalRow);
            return dA - dB;
        });

        if (state.players[cp].walls <= 0) return moveActions;

        // -- Wall placement: offensive + defensive + synergy scoring --
        const oppDist = QuoridorGame.bfsWithJumps(state, oppIdx);
        const ownDist = QuoridorGame.bfsWithJumps(state, cp);
        const oppDivBefore = (w.wallSynergy) ? countShortestPathDiversity(state, oppIdx) : 0;
        const wallActions = [];

        // P4: Use incremental edge mutation instead of full applyMove for wall scoring
        const edges = state.edges;
        for (const ori of ['h', 'v']) {
            const placements = QuoridorGame.getValidWallPlacements(state, ori);
            for (const place of placements) {
                // Temporarily add wall edges (no state clone needed)
                QuoridorGame.addWallEdges(edges, place.row, place.col, ori);

                const newOppDist = QuoridorGame.bfsWithJumps(state, oppIdx);
                const newOwnDist = QuoridorGame.bfsWithJumps(state, cp);

                const offensiveGain = newOppDist - oppDist;
                const defensiveCost = newOwnDist - ownDist;

                let netImpact = offensiveGain * w.wallOffensiveW
                              - defensiveCost * w.wallDefensiveW;

                // Wall synergy
                if (w.wallSynergy && offensiveGain >= 0) {
                    const oppDivAfter = countShortestPathDiversity(state, oppIdx);
                    const diversityDrop = oppDivBefore - oppDivAfter;
                    if (diversityDrop > 0) {
                        netImpact += diversityDrop * w.wallSynergy;
                    }
                }

                // Remove temporary edges
                QuoridorGame.removeWallEdges(edges, place.row, place.col, ori);

                if (netImpact >= w.wallMinNetImpact) {
                    wallActions.push({
                        type: 'wall',
                        row: place.row,
                        col: place.col,
                        orientation: ori,
                        impact: netImpact
                    });
                }
            }
        }

        wallActions.sort((a, b) => b.impact - a.impact);
        const topWalls = wallActions.slice(0, w.wallMaxCandidates);

        return [...moveActions, ...topWalls];
    }

    /* ===================================================================
     *  MINIMAX WITH ALPHA-BETA PRUNING
     * =================================================================== */

    function minimax(state, depth, alpha, beta, maximizing, w) {
        nodesSearched++;

        if (depth === 0 || state.gameOver) {
            return { score: evaluate(state, w), action: null };
        }

        const actions = getPrioritizedActions(state, w);
        if (actions.length === 0) return { score: evaluate(state, w), action: null };

        let bestAction = actions[0];

        if (maximizing) {
            let maxScore = -Infinity;
            for (const action of actions) {
                const newState = QuoridorGame.applyMove(state, action);
                const result = minimax(newState, depth - 1, alpha, beta, false, w);
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
                const result = minimax(newState, depth - 1, alpha, beta, true, w);
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

    /* ===================================================================
     *  PUBLIC: GET BEST MOVE
     *  Accepts optional weights for training system
     * =================================================================== */

    function getBestMove(state, customWeights) {
        // Consult opening book first (not used in training with custom weights)
        if (!customWeights && typeof QuoridorOpenings !== 'undefined') {
            const bookMove = QuoridorOpenings.lookup(state);
            if (bookMove) {
                lastEvaluation = getAnalysis(state);
                lastEvaluation.nodesSearched = 0;
                lastEvaluation.fromBook = true;
                return bookMove;
            }
        }

        nodesSearched = 0;
        const w = customWeights || activeWeights;
        const maximizing = state.currentPlayer === 0;
        const result = minimax(state, searchDepth, -Infinity, Infinity, maximizing, w);
        lastEvaluation = getAnalysis(state);
        lastEvaluation.nodesSearched = nodesSearched;
        lastEvaluation.fromBook = false;
        return result.action;
    }

    function getBestMoveAtDepth(state, depth, customWeights) {
        nodesSearched = 0;
        const w = customWeights || activeWeights;
        const maximizing = state.currentPlayer === 0;
        const result = minimax(state, depth, -Infinity, Infinity, maximizing, w);
        return result.action;
    }

    /* ===================================================================
     *  HINTS & ANALYSIS FOR UI
     * =================================================================== */

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

    function getBestMoveHint(state) {
        nodesSearched = 0;
        const maximizing = state.currentPlayer === 0;
        const result = minimax(state, Math.max(1, searchDepth - 1), -Infinity, Infinity, maximizing);
        if (!result.action) return null;

        const a = result.action;
        const pos = String.fromCharCode(97 + a.col) + (a.row + 1);
        if (a.type === 'move') {
            return I18n.t('bestMove', { pos });
        } else {
            return I18n.t('bestWall', { pos: pos + (a.orientation === 'h' ? 'h' : 'v') });
        }
    }

    function getPositionSummary(state, humanPlayerIdx) {
        const analysis = getAnalysis(state);
        const lines = [];
        const phaseNames = ['Opening', 'Midgame', 'Endgame'];

        // Contextual labels: use You/AI when humanPlayer is set
        function label(pidx) {
            if (humanPlayerIdx === undefined || humanPlayerIdx < 0) return 'P' + (pidx + 1);
            return pidx === humanPlayerIdx ? I18n.t('you') : I18n.t('ai');
        }

        if (analysis.advantage === 'Even') {
            lines.push(I18n.t('positionBalanced'));
        } else {
            const advPlayer = analysis.advantage === 'P1' ? label(0) : label(1);
            lines.push(I18n.t('positionAdvantage', { player: advPlayer }));
        }

        lines.push(I18n.t('p1Path', { steps: analysis.distP1 }) + ' | ' +
                   I18n.t('p2Path', { steps: analysis.distP2 }));

        lines.push(I18n.t('gamePhase', { phase: phaseNames[analysis.phase] }));

        const tempo = analysis.distP2 - analysis.distP1;
        if (Math.abs(tempo) >= 2) {
            lines.push(I18n.t('strongTempo', { player: tempo > 0 ? label(0) : label(1) }));
        }

        if (analysis.wallsP1 === 0 && analysis.wallsP2 > 0) {
            lines.push(I18n.t('noWallsVulnerable', { player: label(0) }));
        } else if (analysis.wallsP2 === 0 && analysis.wallsP1 > 0) {
            lines.push(I18n.t('noWallsVulnerable', { player: label(1) }));
        }

        return lines.join('\n');
    }

    /* ===================================================================
     *  PUBLIC API
     * =================================================================== */

    return {
        setDepth, setWeights, getWeights, getDefaultWeights, resetWeights,
        loadTrainedWeights, hasTrainedWeights,
        evaluate, getAnalysis, getGamePhase,
        getBestMove, getBestMoveAtDepth, getBestMoveHint,
        getPositionSummary, getScoredMoves,
        getPrioritizedActions
    };
})();
