/* =====================================================================
 *  QourAIdor - Training Arena
 *  Evolutionary self-play system for AI weight optimization
 * ===================================================================== */

(() => {
    /* ==================================================================
     *  CONSTANTS & DOM REFS
     * ================================================================== */

    const { SIZE, CELL, GAP, PAD, BOARD_PX, cellX, cellY, getColors,
            drawWall, drawPawn, drawBoard, drawCoordinates, drawGoalIndicators } = BoardRenderer;

    const $ = id => document.getElementById(id);
    const SPEED_MAP = [500, 150, 30, 5, 0]; // ms per move at each slider notch
    const SPEED_LABELS = ['1x', '3x', '10x', '50x', 'MAX'];

    /* ==================================================================
     *  GENOME HELPERS
     * ================================================================== */

    const WEIGHT_KEYS = Object.keys(QuoridorAI.getDefaultWeights());

    function createRandomGenome() {
        const base = QuoridorAI.getDefaultWeights();
        const genome = {};
        for (const key of WEIGHT_KEYS) {
            // Random perturbation: +-50% of default value
            const v = base[key];
            const range = Math.max(Math.abs(v) * 0.5, 0.3);
            genome[key] = v + (Math.random() * 2 - 1) * range;
        }
        genome._id = genomeId++;
        genome._gen = 0;
        return genome;
    }

    function cloneGenome(g) {
        const c = { ...g };
        c._id = genomeId++;
        return c;
    }

    // Per-weight clamp ranges to prevent degenerate values
    const WEIGHT_CLAMPS = {
        pathDiff:       [0.5, 10],
        wallReserve:    [0.1, 5],
        wallReserveExp: [0.1, 1.5],
        centerControl:  [-0.5, 2],
        progress:       [0, 4],
        turnBonus:      [0, 2],
        wallThreatNear: [0, 6],
        wallThreatFar:  [0, 3],
        mobility:       [-0.5, 1],
        corridorRisk:   [0, 5],
        noWallsRush:    [0, 4],
        wallSynergy:    [0, 3],
        openingPathMul: [0.2, 2],
        openingWallMul: [0.2, 3],
        midgamePathMul: [0.3, 2.5],
        midgameWallMul: [0.2, 3],
        endgamePathMul: [0.5, 3],
        endgameWallMul: [0, 2],
        wallOffensiveW: [0.1, 3],
        wallDefensiveW: [0, 2],
        wallMinNetImpact: [0, 2],
        wallMaxCandidates: [5, 30],
    };

    function clampGenome(genome) {
        for (const key of WEIGHT_KEYS) {
            const bounds = WEIGHT_CLAMPS[key];
            if (bounds) {
                genome[key] = Math.max(bounds[0], Math.min(bounds[1], genome[key]));
            }
        }
        return genome;
    }

    function mutateGenome(genome, rate, strength) {
        const child = { ...genome, _id: genomeId++ };
        for (const key of WEIGHT_KEYS) {
            if (Math.random() < rate) {
                const sigma = Math.max(Math.abs(child[key]) * strength, 0.1);
                child[key] += gaussianRandom() * sigma;
            }
        }
        return clampGenome(child);
    }

    function crossoverGenomes(a, b) {
        const child = { _id: genomeId++ };
        for (const key of WEIGHT_KEYS) {
            // Uniform crossover with 30% chance of blend
            if (Math.random() < 0.3) {
                const alpha = Math.random();
                child[key] = a[key] * alpha + b[key] * (1 - alpha);
            } else {
                child[key] = Math.random() < 0.5 ? a[key] : b[key];
            }
        }
        return clampGenome(child);
    }

    function gaussianRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    let genomeId = 0;

    /* ==================================================================
     *  HEADLESS GAME ENGINE
     * ================================================================== */

    function playGameHeadless(weightsA, weightsB, depth, maxMoves) {
        let state = QuoridorGame.createState();
        const history = [];

        for (let i = 0; i < maxMoves; i++) {
            if (state.gameOver) break;
            const w = state.currentPlayer === 0 ? weightsA : weightsB;
            const move = QuoridorAI.getBestMoveAtDepth(state, depth, w);
            if (!move) break;
            history.push({ move, stateBeforeMove: QuoridorGame.cloneState(state) });
            state = QuoridorGame.applyMove(state, move);
        }

        return {
            finalState: state,
            history,
            winner: state.gameOver ? state.winner : -1,  // -1 = draw/timeout
            moves: history.length
        };
    }

    /* ==================================================================
     *  WEB WORKER POOL for parallel headless games
     * ================================================================== */

    const workerPool = [];
    const WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 8);
    let workersAvailable = false;

    function initWorkers() {
        try {
            for (let i = 0; i < WORKER_COUNT; i++) {
                const w = new Worker('training-worker.js');
                workerPool.push(w);
            }
            workersAvailable = true;
        } catch (e) {
            console.warn('Web Workers not available, falling back to main thread:', e);
            workersAvailable = false;
        }
    }

    function playBatchInWorker(worker, games, depth, maxMoves) {
        return new Promise((resolve) => {
            worker.onmessage = (e) => {
                if (e.data.type === 'batchResult') {
                    resolve(e.data.results);
                }
            };
            worker.postMessage({
                type: 'playBatch',
                data: { games, depth, maxMoves }
            });
        });
    }

    /**
     * Play all non-visualized games for a generation in parallel using workers.
     * Returns array of { gi, oi, asP1, winner, moves }.
     */
    async function playGamesParallel(gameBatch, depth, maxMoves) {
        if (!workersAvailable || workerPool.length === 0) {
            // Fallback: play on main thread
            const results = [];
            for (const game of gameBatch) {
                const result = playGameHeadless(game.weightsA, game.weightsB, depth, maxMoves);
                results.push({
                    gi: game.gi, oi: game.oi, asP1: game.asP1,
                    winner: result.winner, moves: result.moves
                });
                await yieldUI();
            }
            return results;
        }

        // Distribute games across workers
        const chunks = [];
        const chunkSize = Math.ceil(gameBatch.length / workerPool.length);
        for (let i = 0; i < gameBatch.length; i += chunkSize) {
            chunks.push(gameBatch.slice(i, i + chunkSize));
        }

        const promises = chunks.map((chunk, i) => {
            // Strip state objects from weights for transfer (just send weight keys)
            const cleanGames = chunk.map(g => ({
                weightsA: stripMeta(g.weightsA),
                weightsB: stripMeta(g.weightsB),
                gi: g.gi, oi: g.oi, asP1: g.asP1
            }));
            return playBatchInWorker(workerPool[i % workerPool.length], cleanGames, depth, maxMoves);
        });

        const allResults = await Promise.all(promises);
        return allResults.flat();
    }

    function stripMeta(genome) {
        const w = {};
        for (const key of WEIGHT_KEYS) {
            w[key] = genome[key];
        }
        return w;
    }

    // Initialize workers on load
    initWorkers();

    /* ==================================================================
     *  ASYNC GAME ENGINE (with visualization)
     * ================================================================== */

    async function playGameAsync(weightsA, weightsB, depth, maxMoves, callbacks) {
        let state = QuoridorGame.createState();
        const history = [];

        for (let i = 0; i < maxMoves; i++) {
            if (state.gameOver || trainingState.stopRequested) break;

            while (trainingState.paused && !trainingState.stopRequested) {
                if (trainingState.stepRequested) {
                    trainingState.stepRequested = false;
                    break;
                }
                await sleep(50);
            }
            if (trainingState.stopRequested) break;

            const w = state.currentPlayer === 0 ? weightsA : weightsB;
            const move = QuoridorAI.getBestMoveAtDepth(state, depth, w);
            if (!move) break;

            history.push({ move, stateBeforeMove: QuoridorGame.cloneState(state) });
            state = QuoridorGame.applyMove(state, move);

            if (callbacks && callbacks.onMove) {
                callbacks.onMove(state, move, history.length);
            }

            const delay = SPEED_MAP[trainingState.speed];
            if (delay > 0) await sleep(delay);
            else await yieldUI();
        }

        return {
            finalState: state,
            history,
            winner: state.gameOver ? state.winner : -1,
            moves: history.length
        };
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function yieldUI() { return new Promise(r => setTimeout(r, 0)); }

    /* ==================================================================
     *  EVOLUTIONARY ALGORITHM
     * ================================================================== */

    function tournamentSelect(population, fitnesses, k) {
        let bestIdx = -1;
        let bestFit = -Infinity;
        for (let i = 0; i < k; i++) {
            const idx = Math.floor(Math.random() * population.length);
            if (fitnesses[idx] > bestFit) {
                bestFit = fitnesses[idx];
                bestIdx = idx;
            }
        }
        return population[bestIdx];
    }

    /** Measure average pairwise weight distance for diversity tracking */
    function populationDiversity(population) {
        if (population.length < 2) return 0;
        let totalDist = 0;
        let pairs = 0;
        // Sample pairs to avoid O(n^2) for large populations
        const sampleSize = Math.min(population.length, 10);
        for (let i = 0; i < sampleSize; i++) {
            for (let j = i + 1; j < sampleSize; j++) {
                let dist = 0;
                for (const key of WEIGHT_KEYS) {
                    const diff = population[i][key] - population[j][key];
                    dist += diff * diff;
                }
                totalDist += Math.sqrt(dist);
                pairs++;
            }
        }
        return pairs > 0 ? totalDist / pairs : 0;
    }

    function evolvePopulation(population, fitnesses, config) {
        const sorted = population
            .map((g, i) => ({ genome: g, fitness: fitnesses[i] }))
            .sort((a, b) => b.fitness - a.fitness);

        const newPop = [];

        // Elitism: keep top N unchanged
        for (let i = 0; i < config.eliteCount && i < sorted.length; i++) {
            const elite = cloneGenome(sorted[i].genome);
            elite._gen = trainingState.generation + 1;
            newPop.push(elite);
        }

        // Diversity injection: if population diversity is low, inject random genomes
        const diversity = populationDiversity(population);
        const diversityThreshold = 1.0; // if avg distance < this, inject randoms
        const injectCount = (diversity < diversityThreshold) ? Math.max(1, Math.floor(config.populationSize * 0.1)) : 0;

        for (let i = 0; i < injectCount && newPop.length < config.populationSize; i++) {
            const random = createRandomGenome();
            random._gen = trainingState.generation + 1;
            newPop.push(random);
        }

        // Fill the rest with offspring
        while (newPop.length < config.populationSize) {
            const parentA = tournamentSelect(population, fitnesses, config.tournamentSize);
            const parentB = tournamentSelect(population, fitnesses, config.tournamentSize);

            let child;
            if (Math.random() < config.crossoverRate) {
                child = crossoverGenomes(parentA, parentB);
            } else {
                child = cloneGenome(parentA);
            }

            child = mutateGenome(child, config.mutationRate, config.mutationStrength);
            child._gen = trainingState.generation + 1;
            newPop.push(child);
        }

        return newPop;
    }

    /* ==================================================================
     *  TRAINING STATE
     * ================================================================== */

    const trainingState = {
        running: false,
        paused: false,
        stopRequested: false,
        stepRequested: false,
        speed: 2,
        generation: 0,
        totalGamesPlayed: 0,
        population: [],
        fitnesses: [],
        fitnessHistory: [],      // [{gen, best, avg}]
        recordedGames: [],       // [{weightsA, weightsB, history, winner, moves, gen}]
        config: null,
        startTime: 0,
    };

    /* ==================================================================
     *  MAIN TRAINING LOOP
     * ================================================================== */

    async function runTraining(config) {
        trainingState.running = true;
        trainingState.stopRequested = false;
        trainingState.paused = false;
        trainingState.recordedGames = [];
        trainingState.config = config;
        trainingState.startTime = Date.now();

        // Initialize population (or continue from restored state)
        const resuming = trainingState.population.length > 0;
        if (!resuming) {
            trainingState.generation = 0;
            trainingState.totalGamesPlayed = 0;
            trainingState.fitnessHistory = [];
            trainingState.population = [];
            // First genome is the default weights (baseline)
            const defaultGenome = { ...QuoridorAI.getDefaultWeights(), _id: genomeId++, _gen: 0 };
            trainingState.population.push(defaultGenome);
            for (let i = 1; i < config.populationSize; i++) {
                trainingState.population.push(createRandomGenome());
            }
        }

        const startGen = resuming ? trainingState.generation + 1 : 0;

        updateStatus(resuming ? 'Training resumed from generation ' + startGen : 'Training started');

        for (let gen = startGen; gen < startGen + config.maxGenerations; gen++) {
            if (trainingState.stopRequested) break;
            trainingState.generation = gen;
            updateGenerationStats();

            const fitnesses = new Array(trainingState.population.length).fill(0);
            const gamesCount = new Array(trainingState.population.length).fill(0);

            // Build game schedule for this generation
            const allGames = [];
            for (let gi = 0; gi < trainingState.population.length; gi++) {
                const opponents = [];
                while (opponents.length < config.opponentsPerGenome) {
                    const oi = Math.floor(Math.random() * trainingState.population.length);
                    if (oi !== gi && !opponents.includes(oi)) opponents.push(oi);
                    if (opponents.length >= trainingState.population.length - 1) break;
                }
                for (const oi of opponents) {
                    for (let g = 0; g < config.gamesPerMatch; g++) {
                        const asP1 = g % 2 === 0;
                        allGames.push({ gi, oi, asP1 });
                    }
                }
            }

            // Decide execution strategy: parallel workers vs sequential
            const useParallel = workersAvailable && config.visualize === 'none';

            if (useParallel && !trainingState.stopRequested) {
                // --- PARALLEL PATH: run all games in workers ---
                const gameBatch = allGames.map(({ gi, oi, asP1 }) => ({
                    weightsA: asP1 ? trainingState.population[gi] : trainingState.population[oi],
                    weightsB: asP1 ? trainingState.population[oi] : trainingState.population[gi],
                    gi, oi, asP1
                }));

                updateStatus(`Gen ${gen + 1}: playing ${gameBatch.length} games in ${workerPool.length} workers...`);
                const results = await playGamesParallel(gameBatch, config.searchDepth, config.maxMoves);

                for (const r of results) {
                    if (trainingState.stopRequested) break;
                    const moveRatio = 1 - r.moves / config.maxMoves;
                    const myPlayer = r.asP1 ? 0 : 1;
                    const oppPlayer = r.asP1 ? 1 : 0;

                    if (r.winner === myPlayer) {
                        fitnesses[r.gi] += 1.0 + 0.3 * moveRatio;
                    } else if (r.winner === -1) {
                        fitnesses[r.gi] += 0.2;
                    } else {
                        fitnesses[r.gi] += 0.05 * (1 - moveRatio);
                    }
                    gamesCount[r.gi]++;

                    if (r.winner === oppPlayer) {
                        fitnesses[r.oi] += 1.0 + 0.3 * moveRatio;
                    } else if (r.winner === -1) {
                        fitnesses[r.oi] += 0.2;
                    } else {
                        fitnesses[r.oi] += 0.05 * (1 - moveRatio);
                    }
                    gamesCount[r.oi]++;

                    trainingState.totalGamesPlayed++;
                }
                updateGameStats();

            } else {
                // --- SEQUENTIAL PATH: supports visualization ---
                for (const { gi, oi, asP1 } of allGames) {
                    if (trainingState.stopRequested) break;

                    const wA = asP1 ? trainingState.population[gi] : trainingState.population[oi];
                    const wB = asP1 ? trainingState.population[oi] : trainingState.population[gi];

                    const shouldVisualize =
                        config.visualize === 'all' ||
                        (config.visualize === 'best' && gi === 0 && gen > startGen);

                    updateMatchHeader(gi, oi, asP1);

                    let result;
                    if (shouldVisualize) {
                        result = await playGameAsync(wA, wB, config.searchDepth, config.maxMoves, {
                            onMove: (state, move, moveNum) => {
                                drawBoard($('arena-canvas'), state);
                                updateLiveMoveList(state);
                            }
                        });
                    } else {
                        result = playGameHeadless(wA, wB, config.searchDepth, config.maxMoves);
                        await yieldUI();
                    }

                    const moveRatio = 1 - result.moves / config.maxMoves;
                    const myPlayer = asP1 ? 0 : 1;
                    if (result.winner === myPlayer) {
                        fitnesses[gi] += 1.0 + 0.3 * moveRatio;
                    } else if (result.winner === -1) {
                        fitnesses[gi] += 0.2;
                    } else {
                        fitnesses[gi] += 0.05 * (1 - moveRatio);
                    }
                    gamesCount[gi]++;

                    const oppPlayer = asP1 ? 1 : 0;
                    if (result.winner === oppPlayer) {
                        fitnesses[oi] += 1.0 + 0.3 * moveRatio;
                    } else if (result.winner === -1) {
                        fitnesses[oi] += 0.2;
                    } else {
                        fitnesses[oi] += 0.05 * (1 - moveRatio);
                    }
                    gamesCount[oi]++;

                    // Record game (only in sequential mode where we have full history)
                    if (result.history) {
                        trainingState.recordedGames.push({
                            p1Genome: wA._id,
                            p2Genome: wB._id,
                            history: result.history,
                            finalState: result.finalState,
                            winner: result.winner,
                            moves: result.moves,
                            gen
                        });
                        if (trainingState.recordedGames.length > 200) {
                            trainingState.recordedGames.shift();
                        }
                    }

                    trainingState.totalGamesPlayed++;
                    updateGameStats();
                }
            }

            // Normalize fitnesses by games played
            for (let i = 0; i < fitnesses.length; i++) {
                if (gamesCount[i] > 0) fitnesses[i] /= gamesCount[i];
            }

            trainingState.fitnesses = fitnesses;

            // Record fitness history
            const bestFit = Math.max(...fitnesses);
            const avgFit = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
            trainingState.fitnessHistory.push({ gen, best: bestFit, avg: avgFit });

            updateGenerationStats();
            updateLeaderboard();
            drawFitnessChart();
            updateGameBrowser();

            // Evolve
            if (gen < config.maxGenerations - 1 && !trainingState.stopRequested) {
                trainingState.population = evolvePopulation(
                    trainingState.population, fitnesses, config
                );
            }

            updateStatus(`Generation ${gen + 1} complete | Best: ${bestFit.toFixed(3)} | Avg: ${avgFit.toFixed(3)}`);

            // Auto-save best weights and population after each generation
            saveBestWeightsToStorage();
            savePopulationToStorage();
        }

        trainingState.running = false;
        // Final save
        saveBestWeightsToStorage();
        savePopulationToStorage();
        updateStatus('Training complete');
        updateControls();
    }

    /* ==================================================================
     *  UI UPDATE FUNCTIONS
     * ================================================================== */

    function updateStatus(text) {
        $('arena-status').textContent = text;
    }

    function updateMatchHeader(gi, oi, giIsP1) {
        const gLabel = `G${trainingState.population[gi]._id}`;
        const oLabel = `G${trainingState.population[oi]._id}`;
        $('match-p1-label').textContent = giIsP1 ? gLabel : oLabel;
        $('match-p2-label').textContent = giIsP1 ? oLabel : gLabel;
    }

    function updateGenerationStats() {
        $('stat-generation').textContent = trainingState.generation + 1;
        const elapsed = (Date.now() - trainingState.startTime) / 1000;
        if (elapsed > 0 && trainingState.totalGamesPlayed > 0) {
            const gps = (trainingState.totalGamesPlayed / elapsed).toFixed(1);
            $('stat-speed').textContent = gps + ' g/s';
        }
    }

    function updateGameStats() {
        $('stat-games-played').textContent = trainingState.totalGamesPlayed;
        const fit = trainingState.fitnesses;
        if (fit.length > 0) {
            const best = Math.max(...fit);
            const avg = fit.reduce((a, b) => a + b, 0) / fit.length;
            $('stat-best-fitness').textContent = best.toFixed(3);
            $('stat-avg-fitness').textContent = avg.toFixed(3);
        }
    }

    function updateLeaderboard() {
        const lb = $('leaderboard');
        lb.innerHTML = '';
        const indexed = trainingState.population
            .map((g, i) => ({ genome: g, fitness: trainingState.fitnesses[i] || 0 }))
            .sort((a, b) => b.fitness - a.fitness);

        for (let i = 0; i < Math.min(10, indexed.length); i++) {
            const entry = document.createElement('div');
            entry.className = 'lb-entry';
            entry.innerHTML = `
                <span class="lb-rank">#${i + 1}</span>
                <span class="lb-fitness">${indexed[i].fitness.toFixed(3)}</span>
                <span class="lb-wins">G${indexed[i].genome._id} gen${indexed[i].genome._gen}</span>
            `;
            lb.appendChild(entry);
        }
    }

    function updateLiveMoveList(state) {
        const list = $('live-move-list');
        list.innerHTML = '';
        const moves = state.moveHistory;
        for (let i = 0; i < moves.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            let line = `${num}. ${moves[i]}`;
            if (i + 1 < moves.length) line += `  ${moves[i + 1]}`;
            const div = document.createElement('div');
            div.textContent = line;
            list.appendChild(div);
        }
        list.scrollTop = list.scrollHeight;
    }

    function updateGameBrowser() {
        const browser = $('game-browser');
        browser.innerHTML = '';
        const games = trainingState.recordedGames;
        // Show last 50 games in reverse order
        const start = Math.max(0, games.length - 50);
        for (let i = games.length - 1; i >= start; i--) {
            const game = games[i];
            const entry = document.createElement('div');
            entry.className = 'game-entry';
            const resultClass = game.winner === 0 ? 'game-result-win' :
                               game.winner === 1 ? 'game-result-loss' : 'game-result-draw';
            const resultText = game.winner === 0 ? 'P1' :
                              game.winner === 1 ? 'P2' : 'Draw';
            entry.innerHTML = `
                <span>Gen ${game.gen + 1} #${i + 1}</span>
                <span>${game.moves}m</span>
                <span class="${resultClass}">${resultText}</span>
            `;
            entry.addEventListener('click', () => openReplay(i));
            browser.appendChild(entry);
        }
    }

    /* ==================================================================
     *  FITNESS CHART
     * ================================================================== */

    function drawFitnessChart() {
        const canvas = $('fitness-chart');
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const data = trainingState.fitnessHistory;

        ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--board-bg').trim() || '#0d1b36';
        ctx.fillRect(0, 0, W, H);

        if (data.length < 2) {
            ctx.fillStyle = '#444';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for data...', W / 2, H / 2);
            return;
        }

        const pad = { l: 35, r: 10, t: 10, b: 20 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;

        const maxFit = Math.max(...data.map(d => d.best), 1);
        const minFit = Math.min(...data.map(d => d.avg), 0);
        const range = Math.max(maxFit - minFit, 0.1);

        function x(i) { return pad.l + (i / (data.length - 1)) * cw; }
        function y(v) { return pad.t + ch - ((v - minFit) / range) * ch; }

        // Grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const gy = pad.t + (ch / 4) * i;
            ctx.beginPath();
            ctx.moveTo(pad.l, gy);
            ctx.lineTo(W - pad.r, gy);
            ctx.stroke();
            const val = maxFit - (range / 4) * i;
            ctx.fillStyle = '#666';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(2), pad.l - 3, gy + 3);
        }

        // Average line
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const px = x(i), py = y(data[i].avg);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Best line
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const px = x(i), py = y(data[i].best);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Best', pad.l + 4, pad.t + 12);
        ctx.fillStyle = '#666';
        ctx.fillText('Avg', pad.l + 40, pad.t + 12);

        // X-axis label
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.fillText('Generation', W / 2, H - 2);
    }

    /* ==================================================================
     *  REPLAY SYSTEM
     * ================================================================== */

    let replayData = null;
    let replayMoveIdx = 0;
    let replayPlaying = false;
    let replayInterval = null;

    function openReplay(gameIndex) {
        const game = trainingState.recordedGames[gameIndex];
        if (!game) return;

        replayData = game;
        replayMoveIdx = 0;
        replayPlaying = false;
        clearInterval(replayInterval);

        $('replay-info').textContent =
            `Gen ${game.gen + 1} | ${game.moves} moves | ` +
            `Winner: ${game.winner === 0 ? 'P1' : game.winner === 1 ? 'P2' : 'Draw'}`;

        drawReplayState();
        updateReplayMoveList();
        $('replay-modal').classList.remove('hidden');
    }

    function drawReplayState() {
        if (!replayData) return;

        let state;
        if (replayMoveIdx === 0) {
            state = QuoridorGame.createState();
        } else if (replayMoveIdx <= replayData.history.length) {
            // Apply moves up to replayMoveIdx
            state = QuoridorGame.createState();
            for (let i = 0; i < replayMoveIdx; i++) {
                state = QuoridorGame.applyMove(state, replayData.history[i].move);
            }
        } else {
            state = replayData.finalState;
        }

        drawBoard($('replay-canvas'), state);
        $('replay-move-num').textContent = `${replayMoveIdx} / ${replayData.history.length}`;
    }

    function updateReplayMoveList() {
        const list = $('replay-move-list');
        list.innerHTML = '';
        if (!replayData) return;

        for (let i = 0; i < replayData.history.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            // Reconstruct notation from move
            const m1 = replayData.history[i].move;
            let line = `${num}. ${moveToNotation(m1, 0)}`;
            if (i + 1 < replayData.history.length) {
                const m2 = replayData.history[i + 1].move;
                line += `  ${moveToNotation(m2, 1)}`;
            }
            const div = document.createElement('div');
            div.textContent = line;
            div.style.cursor = 'pointer';
            div.style.padding = '1px 4px';
            div.style.borderRadius = '3px';

            const moveIdx = i;
            div.addEventListener('click', () => {
                replayMoveIdx = moveIdx;
                drawReplayState();
            });

            if (i === replayMoveIdx || i + 1 === replayMoveIdx) {
                div.style.background = 'rgba(233,69,96,0.15)';
            }

            list.appendChild(div);
        }
    }

    function moveToNotation(move, playerIdx) {
        const prefix = 'P' + (playerIdx + 1) + ' ';
        const pos = String.fromCharCode(97 + move.col) + (move.row + 1);
        if (move.type === 'move') return prefix + pos;
        return prefix + pos + (move.orientation === 'h' ? 'h' : 'v');
    }

    /* ==================================================================
     *  PERSISTENCE: Auto-save to localStorage
     * ================================================================== */

    const LS_BEST_WEIGHTS = 'qouraid-trained-weights';
    const LS_POPULATION   = 'qouraid-training-population';
    const LS_TRAIN_META   = 'qouraid-training-meta';

    function saveBestWeightsToStorage() {
        const sorted = trainingState.population
            .map((g, i) => ({ genome: g, fitness: trainingState.fitnesses[i] || 0 }))
            .sort((a, b) => b.fitness - a.fitness);

        if (sorted.length === 0) return;

        const best = sorted[0].genome;
        const exportData = {};
        for (const key of WEIGHT_KEYS) {
            exportData[key] = Math.round(best[key] * 1000) / 1000;
        }

        const meta = {
            fitness: sorted[0].fitness,
            generation: trainingState.generation,
            totalGames: trainingState.totalGamesPlayed,
            savedAt: Date.now()
        };

        try {
            localStorage.setItem(LS_BEST_WEIGHTS, JSON.stringify(exportData));
            localStorage.setItem(LS_TRAIN_META, JSON.stringify(meta));
        } catch (e) {
            console.warn('Could not save trained weights to localStorage:', e);
        }
    }

    function savePopulationToStorage() {
        const data = {
            population: trainingState.population,
            fitnesses: trainingState.fitnesses,
            fitnessHistory: trainingState.fitnessHistory,
            generation: trainingState.generation,
            config: trainingState.config,
            totalGamesPlayed: trainingState.totalGamesPlayed
        };
        try {
            localStorage.setItem(LS_POPULATION, JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save population to localStorage:', e);
        }
    }

    function loadPopulationFromStorage() {
        try {
            const raw = localStorage.getItem(LS_POPULATION);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.population && Array.isArray(data.population) && data.population.length > 0) {
                trainingState.population = data.population;
                trainingState.fitnesses = data.fitnesses || [];
                trainingState.fitnessHistory = data.fitnessHistory || [];
                trainingState.generation = data.generation || 0;
                trainingState.totalGamesPlayed = data.totalGamesPlayed || 0;
                genomeId = Math.max(...data.population.map(g => g._id || 0)) + 1;

                if (data.config) {
                    applyConfigToUI(data.config);
                }
                return true;
            }
        } catch (e) {
            console.warn('Could not load population from localStorage:', e);
        }
        return false;
    }

    function getTrainingMeta() {
        try {
            const raw = localStorage.getItem(LS_TRAIN_META);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function clearTrainedWeights() {
        localStorage.removeItem(LS_BEST_WEIGHTS);
        localStorage.removeItem(LS_TRAIN_META);
    }

    function clearSavedPopulation() {
        localStorage.removeItem(LS_POPULATION);
    }

    /* ==================================================================
     *  EXPORT / IMPORT
     * ================================================================== */

    function exportBestWeights() {
        const sorted = trainingState.population
            .map((g, i) => ({ genome: g, fitness: trainingState.fitnesses[i] || 0 }))
            .sort((a, b) => b.fitness - a.fitness);

        if (sorted.length === 0) return;

        const best = sorted[0].genome;
        const exportData = {};
        for (const key of WEIGHT_KEYS) {
            exportData[key] = Math.round(best[key] * 1000) / 1000;
        }

        const json = JSON.stringify(exportData, null, 2);
        downloadJSON(json, 'quoraidor-best-weights.json');
    }

    function exportPopulation() {
        const data = {
            population: trainingState.population,
            fitnesses: trainingState.fitnesses,
            fitnessHistory: trainingState.fitnessHistory,
            generation: trainingState.generation,
            config: trainingState.config,
            totalGamesPlayed: trainingState.totalGamesPlayed
        };
        downloadJSON(JSON.stringify(data, null, 2), 'quoraidor-population.json');
    }

    function importPopulation() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            try {
                const data = JSON.parse(text);
                if (data.population && Array.isArray(data.population)) {
                    // J4: Show preview before importing
                    const preview = 'Import population?\n\n' +
                        'Genomes: ' + data.population.length + '\n' +
                        'Generation: ' + (data.generation || 0) + '\n' +
                        'Total games: ' + (data.totalGamesPlayed || 0) + '\n\n' +
                        'This will replace the current population.';
                    if (!confirm(preview)) return;

                    trainingState.population = data.population;
                    trainingState.fitnesses = data.fitnesses || [];
                    trainingState.fitnessHistory = data.fitnessHistory || [];
                    trainingState.generation = data.generation || 0;
                    trainingState.totalGamesPlayed = data.totalGamesPlayed || 0;
                    genomeId = Math.max(...data.population.map(g => g._id || 0)) + 1;

                    // Apply config if available
                    if (data.config) {
                        applyConfigToUI(data.config);
                    }

                    updateStatus('Population imported: ' + data.population.length + ' genomes');
                    updateLeaderboard();
                    drawFitnessChart();
                } else {
                    alert('Invalid population file');
                }
            } catch (err) {
                alert('Error parsing file: ' + err.message);
            }
        });
        input.click();
    }

    function downloadJSON(json, filename) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function applyConfigToUI(config) {
        if (config.populationSize) $('cfg-pop-size').value = config.populationSize;
        if (config.eliteCount) $('cfg-elite').value = config.eliteCount;
        if (config.tournamentSize) $('cfg-tournament').value = config.tournamentSize;
        if (config.mutationRate) $('cfg-mut-rate').value = config.mutationRate;
        if (config.mutationStrength) $('cfg-mut-strength').value = config.mutationStrength;
        if (config.crossoverRate) $('cfg-crossover').value = config.crossoverRate;
        if (config.gamesPerMatch) $('cfg-games-per-match').value = config.gamesPerMatch;
        if (config.opponentsPerGenome) $('cfg-opponents').value = config.opponentsPerGenome;
        if (config.searchDepth) $('cfg-depth').value = config.searchDepth;
        if (config.maxMoves) $('cfg-max-moves').value = config.maxMoves;
        if (config.maxGenerations) $('cfg-max-gen').value = config.maxGenerations;
    }

    /* ==================================================================
     *  UI CONTROLS & EVENT HANDLERS
     * ================================================================== */

    function readConfig() {
        const config = {
            populationSize: parseInt($('cfg-pop-size').value),
            eliteCount: parseInt($('cfg-elite').value),
            tournamentSize: parseInt($('cfg-tournament').value),
            mutationRate: parseFloat($('cfg-mut-rate').value),
            mutationStrength: parseFloat($('cfg-mut-strength').value),
            crossoverRate: parseFloat($('cfg-crossover').value),
            gamesPerMatch: parseInt($('cfg-games-per-match').value),
            opponentsPerGenome: parseInt($('cfg-opponents').value),
            searchDepth: parseInt($('cfg-depth').value),
            maxMoves: parseInt($('cfg-max-moves').value),
            maxGenerations: parseInt($('cfg-max-gen').value),
            visualize: $('cfg-visualize').value
        };
        return config;
    }

    function validateConfig(config) {
        const errors = [];
        if (config.populationSize < 4) errors.push('Population size must be at least 4');
        if (config.eliteCount >= config.populationSize) errors.push('Elite count must be less than population size');
        if (config.tournamentSize > config.populationSize) errors.push('Tournament size cannot exceed population size');
        if (config.maxGenerations < 1) errors.push('Max generations must be at least 1');
        if (config.gamesPerMatch < 1) errors.push('Games per matchup must be at least 1');
        if (config.opponentsPerGenome < 1) errors.push('Opponents per genome must be at least 1');
        if (config.maxMoves < 10) errors.push('Max moves must be at least 10');
        if (config.mutationRate <= 0 || config.mutationRate > 1) errors.push('Mutation rate must be between 0 and 1');
        if (config.crossoverRate < 0 || config.crossoverRate > 1) errors.push('Crossover rate must be between 0 and 1');
        return errors;
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $(id).classList.add('active');
    }

    function updateControls() {
        $('btn-pause').textContent = trainingState.paused ? '\u25B6' : '\u23F8';
        $('btn-pause').classList.toggle('active', trainingState.paused);
    }

    // Theme toggle (uses shared BoardRenderer)
    function initTheme() {
        const saved = BoardRenderer.initTheme();
        $('theme-icon').textContent = saved === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
    }

    $('theme-toggle').addEventListener('click', () => {
        const isNowLight = BoardRenderer.toggleTheme();
        $('theme-icon').textContent = isNowLight ? '\uD83C\uDF19' : '\u2600\uFE0F';
    });

    // Speed slider
    $('speed-slider').addEventListener('input', (e) => {
        trainingState.speed = parseInt(e.target.value);
        $('speed-label').textContent = SPEED_LABELS[trainingState.speed];
    });
    $('speed-label').textContent = SPEED_LABELS[trainingState.speed];

    // Start training (with validation)
    $('btn-start-training').addEventListener('click', () => {
        const config = readConfig();
        const errors = validateConfig(config);
        if (errors.length > 0) {
            alert('Configuration errors:\n\n' + errors.join('\n'));
            return;
        }
        showScreen('arena-screen');
        drawBoard($('arena-canvas'), QuoridorGame.createState());
        runTraining(config);
    });

    // Pause/resume
    $('btn-pause').addEventListener('click', () => {
        trainingState.paused = !trainingState.paused;
        updateControls();
        updateStatus(trainingState.paused ? 'Paused' : 'Resumed');
    });

    // Step (one move while paused)
    $('btn-step').addEventListener('click', () => {
        if (!trainingState.paused) {
            trainingState.paused = true;
            updateControls();
        }
        trainingState.stepRequested = true;
    });

    // Stop
    $('btn-stop').addEventListener('click', () => {
        trainingState.stopRequested = true;
        updateStatus('Stopping...');
    });

    // Back to config (with confirmation if running)
    $('btn-back-config').addEventListener('click', () => {
        if (trainingState.running) {
            if (confirm('Stop training? Progress is saved automatically.')) {
                trainingState.stopRequested = true;
                showScreen('config-screen');
                updateSavedStatus();
            }
        } else {
            showScreen('config-screen');
            updateSavedStatus();
        }
    });

    // Export/import
    $('btn-export-best').addEventListener('click', exportBestWeights);
    $('btn-export-pop').addEventListener('click', exportPopulation);
    $('btn-import-pop').addEventListener('click', importPopulation);

    // Replay controls
    $('replay-close').addEventListener('click', () => {
        clearInterval(replayInterval);
        replayPlaying = false;
        $('replay-modal').classList.add('hidden');
    });

    $('replay-start').addEventListener('click', () => {
        replayMoveIdx = 0;
        drawReplayState();
        updateReplayMoveList();
    });

    $('replay-end').addEventListener('click', () => {
        if (replayData) {
            replayMoveIdx = replayData.history.length;
            drawReplayState();
            updateReplayMoveList();
        }
    });

    $('replay-prev').addEventListener('click', () => {
        if (replayMoveIdx > 0) {
            replayMoveIdx--;
            drawReplayState();
            updateReplayMoveList();
        }
    });

    $('replay-next').addEventListener('click', () => {
        if (replayData && replayMoveIdx < replayData.history.length) {
            replayMoveIdx++;
            drawReplayState();
            updateReplayMoveList();
        }
    });

    $('replay-play').addEventListener('click', () => {
        if (replayPlaying) {
            clearInterval(replayInterval);
            replayPlaying = false;
            $('replay-play').textContent = '\u25B6';
            return;
        }
        replayPlaying = true;
        $('replay-play').textContent = '\u23F8';
        replayInterval = setInterval(() => {
            if (!replayData || replayMoveIdx >= replayData.history.length) {
                clearInterval(replayInterval);
                replayPlaying = false;
                $('replay-play').textContent = '\u25B6';
                return;
            }
            replayMoveIdx++;
            drawReplayState();
            updateReplayMoveList();
        }, 400);
    });

    // Clear saved population
    $('btn-clear-saved').addEventListener('click', () => {
        clearSavedPopulation();
        trainingState.population = [];
        trainingState.fitnesses = [];
        trainingState.fitnessHistory = [];
        trainingState.generation = 0;
        trainingState.totalGamesPlayed = 0;
        updateSavedStatus();
        updateStatus('Saved population cleared');
    });

    // Clear trained weights (reset AI to defaults)
    $('btn-clear-weights').addEventListener('click', () => {
        clearTrainedWeights();
        updateSavedStatus();
        updateStatus('Trained weights cleared — AI will use default weights');
    });

    function updateSavedStatus() {
        const meta = getTrainingMeta();
        const statusEl = $('saved-status');
        if (!statusEl) return;

        if (meta) {
            const date = new Date(meta.savedAt);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            statusEl.innerHTML =
                '<span class="saved-indicator active"></span>' +
                'Trained weights saved' +
                '<br><small>Gen ' + meta.generation + ' | Fitness ' + meta.fitness.toFixed(3) +
                ' | ' + meta.totalGames + ' games' +
                '<br>' + dateStr + '</small>';
        } else {
            statusEl.innerHTML =
                '<span class="saved-indicator"></span>' +
                'No trained weights — using defaults';
        }

        const popRaw = localStorage.getItem(LS_POPULATION);
        const popStatus = $('pop-saved-status');
        if (popStatus) {
            if (popRaw) {
                try {
                    const pop = JSON.parse(popRaw);
                    popStatus.innerHTML =
                        '<span class="saved-indicator active"></span>' +
                        'Population saved (' + pop.population.length + ' genomes, gen ' + (pop.generation || 0) + ')';
                } catch (e) {
                    popStatus.innerHTML = '<span class="saved-indicator"></span>No saved population';
                }
            } else {
                popStatus.innerHTML = '<span class="saved-indicator"></span>No saved population';
            }
        }
    }

    // Init
    initTheme();
    drawBoard($('arena-canvas'), QuoridorGame.createState());

    // Restore saved population on page load
    if (loadPopulationFromStorage()) {
        updateLeaderboard();
        drawFitnessChart();
    }
    updateSavedStatus();

})();
