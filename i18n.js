const I18n = (() => {
    const translations = {
        ca: {
            subtitle: 'Quoridor contra IA',
            newGame: 'Nova Partida',
            playAs: 'Juga com a:',
            player1Top: 'Jugador 1 (Dalt)',
            player2Bottom: 'Jugador 2 (Baix)',
            aiDifficulty: 'Dificultat IA:',
            easy: 'Fàcil',
            medium: 'Mitjà',
            hard: 'Difícil',
            expert: 'Expert',
            gamePhase: 'Fase: {phase}',
            startGame: 'Començar Partida',
            player1: 'Jugador 1',
            player2: 'Jugador 2',
            walls: 'murs',
            yourTurn: 'El teu torn',
            aiTurn: 'Torn de la IA',
            aiThinking: 'La IA està pensant...',
            gameOver: 'Fi de la Partida',
            move: 'Moure',
            wallH: 'Mur ─',
            wallV: 'Mur │',
            moveHistory: 'Historial de Moviments',
            analysis: 'Anàlisi',
            undo: 'Desfer',
            menu: 'Menú',
            rematch: 'Revenja',
            you: 'Tu',
            ai: 'IA',
            youWin: 'Has Guanyat!',
            aiWins: 'La IA Guanya!',
            congratulations: 'Felicitats! Has arribat a la meta!',
            aiReachedGoal: 'La IA ha arribat a la meta. Més sort la propera vegada!',
            movesPlayed: 'Moviments jugats',
            wallsUsed: 'Murs usats',
            positionBalanced: 'Posició: Equilibrada',
            positionAdvantage: 'Posició: Avantatge de {player}',
            p1Path: 'Camí J1: {steps} passos',
            p2Path: 'Camí J2: {steps} passos',
            strongTempo: '{player} té un fort avantatge de tempo',
            noWallsVulnerable: '{player} no té murs - vulnerable!',
            bestMove: 'Millor: moure a {pos}',
            bestWall: 'Millor: mur a {pos}',
            gameFinished: 'Partida acabada.',
            p1Win: 'Victòria J1',
            p2Win: 'Victòria J2',
            light: 'Clar',
            dark: 'Fosc',
            trainingArena: 'Arena d\'Entrenament',
            trainedAI: 'IA Entrenada',
            draw: 'Taules!',
            drawReason: 'La partida ha acabat en taules per repetició o límit de moviments.',
            showPaths: 'Camins',
            watchAI: 'Veure IA vs IA'
        },
        es: {
            subtitle: 'Quoridor contra IA',
            newGame: 'Nueva Partida',
            playAs: 'Jugar como:',
            player1Top: 'Jugador 1 (Arriba)',
            player2Bottom: 'Jugador 2 (Abajo)',
            aiDifficulty: 'Dificultad IA:',
            easy: 'Fácil',
            medium: 'Medio',
            hard: 'Difícil',
            expert: 'Experto',
            gamePhase: 'Fase: {phase}',
            startGame: 'Empezar Partida',
            player1: 'Jugador 1',
            player2: 'Jugador 2',
            walls: 'muros',
            yourTurn: 'Tu turno',
            aiTurn: 'Turno de la IA',
            aiThinking: 'La IA está pensando...',
            gameOver: 'Fin de la Partida',
            move: 'Mover',
            wallH: 'Muro ─',
            wallV: 'Muro │',
            moveHistory: 'Historial de Movimientos',
            analysis: 'Análisis',
            undo: 'Deshacer',
            menu: 'Menú',
            rematch: 'Revancha',
            you: 'Tú',
            ai: 'IA',
            youWin: '¡Has Ganado!',
            aiWins: '¡La IA Gana!',
            congratulations: '¡Felicidades! ¡Has llegado a la meta!',
            aiReachedGoal: 'La IA ha llegado a la meta. ¡Más suerte la próxima vez!',
            movesPlayed: 'Movimientos jugados',
            wallsUsed: 'Muros usados',
            positionBalanced: 'Posición: Equilibrada',
            positionAdvantage: 'Posición: Ventaja de {player}',
            p1Path: 'Camino J1: {steps} pasos',
            p2Path: 'Camino J2: {steps} pasos',
            strongTempo: '{player} tiene una fuerte ventaja de tempo',
            noWallsVulnerable: '¡{player} no tiene muros - vulnerable!',
            bestMove: 'Mejor: mover a {pos}',
            bestWall: 'Mejor: muro en {pos}',
            gameFinished: 'Partida terminada.',
            p1Win: 'Victoria J1',
            p2Win: 'Victoria J2',
            light: 'Claro',
            dark: 'Oscuro',
            trainingArena: 'Arena de Entrenamiento',
            trainedAI: 'IA Entrenada',
            draw: '¡Tablas!',
            drawReason: 'La partida ha terminado en tablas por repetición o límite de movimientos.',
            showPaths: 'Caminos',
            watchAI: 'Ver IA vs IA'
        },
        en: {
            subtitle: 'Quoridor vs AI',
            newGame: 'New Game',
            playAs: 'Play as:',
            player1Top: 'Player 1 (Top)',
            player2Bottom: 'Player 2 (Bottom)',
            aiDifficulty: 'AI Difficulty:',
            easy: 'Easy',
            medium: 'Medium',
            hard: 'Hard',
            expert: 'Expert',
            gamePhase: 'Phase: {phase}',
            startGame: 'Start Game',
            player1: 'Player 1',
            player2: 'Player 2',
            walls: 'walls',
            yourTurn: 'Your turn',
            aiTurn: 'AI turn',
            aiThinking: 'AI Thinking...',
            gameOver: 'Game Over',
            move: 'Move',
            wallH: 'Wall ─',
            wallV: 'Wall │',
            moveHistory: 'Move History',
            analysis: 'Analysis',
            undo: 'Undo',
            menu: 'Menu',
            rematch: 'Rematch',
            you: 'You',
            ai: 'AI',
            youWin: 'You Win!',
            aiWins: 'AI Wins!',
            congratulations: 'Congratulations! You reached the goal!',
            aiReachedGoal: 'The AI reached the goal. Better luck next time!',
            movesPlayed: 'Moves played',
            wallsUsed: 'Walls used',
            positionBalanced: 'Position: Balanced',
            positionAdvantage: 'Position: {player} advantage',
            p1Path: 'P1 path: {steps} steps',
            p2Path: 'P2 path: {steps} steps',
            strongTempo: '{player} has strong tempo advantage',
            noWallsVulnerable: '{player} has no walls - vulnerable!',
            bestMove: 'Best: move to {pos}',
            bestWall: 'Best: wall at {pos}',
            gameFinished: 'Game finished.',
            p1Win: 'P1 win',
            p2Win: 'P2 win',
            light: 'Light',
            dark: 'Dark',
            trainingArena: 'Training Arena',
            trainedAI: 'Trained AI',
            draw: 'Draw!',
            drawReason: 'The game ended in a draw due to repetition or move limit.',
            showPaths: 'Paths',
            watchAI: 'Watch AI vs AI'
        }
    };

    let currentLang = localStorage.getItem('qouraid-lang') || 'ca';

    function t(key, params) {
        let str = (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace('{' + k + '}', v);
            }
        }
        return str;
    }

    function setLang(lang) {
        if (translations[lang]) {
            currentLang = lang;
            localStorage.setItem('qouraid-lang', lang);
            applyTranslations();
        }
    }

    function getLang() { return currentLang; }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
    }

    return { t, setLang, getLang, applyTranslations };
})();
