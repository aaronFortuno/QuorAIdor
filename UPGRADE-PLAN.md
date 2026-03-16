# QuorAIdor — Plan de Mejora Integral v2

> Documento operativo para ejecución autónoma.
> Cada fase → commit → push. Sin dependencias cruzadas salvo donde se indique.

**Branch**: `feature/ai-evolution`
**Estado**: Fases A–J del plan v1 completadas. Este plan v2 cubre las tres
grandes áreas pendientes.

---

## ÁREA 1 — Bugs + Accesibilidad

### Fase 1A: Fix bugs conocidos
**Commit**: `fix: eval bar mobile, save/load serialization, history nav safety`

| Bug | Archivo | Solución |
|-----|---------|----------|
| Eval bar móvil: JS setea `height` pero en horizontal necesita `width` | `ui.js` `updateEvalBar()` | Detectar orientación del bar; setear `width` si `window.innerWidth <= 600` |
| Save/load: `edges` y `wallSet` se pierden en JSON.parse | `ui.js` `loadSavedGame()` | No guardar `edges`/`wallSet` en el save. En el load, reconstruirlos con `buildEdgesFromWalls(state.walls)` ya expuesto en game.js. Añadir `rebuildState(s)` helper |
| History nav: swap de state sin try/finally | `ui.js` `navigateToMove()` | Envolver en try/finally. Mejor aún: no mutar `state`; pasar `browseState` directamente a `draw(overrideState)` |
| Flash de catalán al cargar | `index.html` | Poner strings neutrales o vacíos en el HTML; i18n los rellena al init. Setear `lang` attr dinámicamente |
| Mobile tabs labels hardcoded en inglés | `ui.js` `initMobileTabs()` | Usar `I18n.t('tabInfo')`, etc. Añadir 3 keys a i18n |
| `infoClone` dead code | `ui.js:1200` | Eliminar |

### Fase 1B: ARIA roles y semántica
**Commit**: `feat: ARIA roles, dialog semantics, canvas accessibility`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Modals: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` | `index.html` | En `game-over-modal`, `confirm-exit-modal`, `rules-modal` |
| Focus trap en modals | `ui.js` | Al abrir modal, capturar Tab/Shift+Tab dentro. Al cerrar, devolver foco al trigger |
| Canvas: `role="img"` + `aria-label` dinámico | `index.html`, `ui.js` | Actualizar aria-label con estado del juego tras cada movimiento: "Board: P1 at e5, P2 at e1, 3 walls placed" |
| `aria-live` region para anuncios | `index.html`, `ui.js` | `<div id="game-announce" aria-live="polite" class="sr-only">` Anunciar turnos, movimientos, game over |
| `lang` attr dinámico | `ui.js`, `i18n.js` | `document.documentElement.lang = currentLang` al cambiar idioma |
| Quitar `user-scalable=no` | `index.html` | Permitir zoom en móvil |
| `.sr-only` utility class | `style.css` | `position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)` |

### Fase 1C: Navegación por teclado en el tablero
**Commit**: `feat: keyboard navigation for board — arrow keys, enter, tab`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Canvas focusable: `tabindex="0"` | `index.html` | El canvas recibe foco |
| Cursor virtual: `selectedCell = {row, col}` | `ui.js` | Se dibuja como borde amarillo pulsante en la celda seleccionada |
| Arrow keys mueven el cursor | `ui.js` keydown handler | ← → ↑ ↓ mueven, con wrap |
| Enter confirma | `ui.js` | En modo move: si la celda es válida, aplica movimiento. En modo wall: coloca pared en la intersección |
| Tab cambia modo (move → wall-h → wall-v) | `ui.js` | Cycle con Tab (sin Shift) |
| Escape cancela selección | `ui.js` | Vuelve a move mode |
| Feedback sonoro opcional | Futuro | No en esta fase |

---

## ÁREA 2 — IA Avanzada + Plataforma de Entrenamiento

### Fase 2A: Opening book
**Commit**: `feat: opening book — first 4 moves from known Quoridor theory`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Nuevo archivo `openings.js` | Crear | Mapa de posiciones iniciales → movimiento óptimo. Formato: `{ positionHash: move }`. 3-4 plies de profundidad |
| Contenido del libro | Research | Las aperturas conocidas de Quoridor: advance centrally (e2, e3), early wall patterns (d1h at move 3-4). Basado en literatura de Quoridor competitivo |
| Integración en `getBestMove` | `ai.js` | Si el estado actual está en el libro, retornar directamente sin buscar. Check: `openings[posKey] || null` |
| El libro NO se usa en training | `training.js` | Para que el training explore libremente, no se consulta el libro |
| Script `<script src="openings.js">` | `index.html` | Antes de `ai.js` |

### Fase 2B: Transposition table
**Commit**: `feat: Zobrist hashing and transposition table for minimax`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Zobrist keys | `ai.js` | Array de random 64-bit ints (usando dos 32-bit) para: 81 positions × 2 players + 128 wall slots + side-to-move. Inicializar una vez |
| Hash incremental en `applyMove` | `game.js` | `state.hash` campo nuevo. XOR al mover peón (quitar pos vieja, poner nueva), al añadir pared, al cambiar turno |
| `createState` inicializa hash | `game.js` | Hash de la posición inicial |
| `cloneState` copia hash | `game.js` | Primitivo, se copia solo |
| Transposition table (Map) | `ai.js` | `ttable = new Map()`. Key = hash, Value = `{ depth, score, flag, bestMove }`. Flag: EXACT / LOWER / UPPER |
| Lookup en minimax | `ai.js` | Antes de expandir: si `ttable.has(hash)` con depth >= actual depth, usar score si flag permite. Tras evaluar: guardar resultado |
| Limpieza de TT | `ai.js` | `getBestMove` limpia la tabla si > 100k entradas para evitar memory leak |
| Tamaño configurable | `ai.js` | `TT_MAX_SIZE = 100000` |

### Fase 2C: Iterative deepening
**Commit**: `feat: iterative deepening with time limit for adaptive search depth`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| `getBestMoveIterative(state, maxTimeMs)` | `ai.js` | Loop: depth 1, 2, 3... hasta `maxTimeMs` agotado. Usa TT de fase 2B para move ordering (best move de iteración anterior va primero) |
| Time check en minimax | `ai.js` | Cada N nodos (ej. 1000), check `Date.now() - startTime > maxTimeMs`. Si sí, throw/return flag de timeout |
| Integración en UI | `ui.js` | Para depth >= 3, usar `getBestMoveIterative` con timeouts: Hard=2s, Expert=5s |
| `getBestMoveAtDepth` sin cambios | `ai.js` | El training sigue usando depth fijo para reproducibilidad |

### Fase 2D: Estrategias documentadas para la plataforma de entrenamiento
**Commit**: `feat: strategy guide and training documentation`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Sección "Estrategia" en el modal de reglas | `ui.js`, `i18n.js` | Expandir el modal con una pestaña "Strategy" que explique: corridor traps, wall economy, tempo, racing vs blocking |
| Tooltips en el analysis panel | `ui.js` | Explicar qué significa cada métrica (path distance, corridor risk, etc.) |
| Training arena: comparación genome vs default | `training.js`, `training.html` | Botón "Test vs Default" que juega el mejor genome contra los pesos default en 10 partidas y muestra win rate |

---

## ÁREA 3 — Multijugador + Usuarios

> **Nota**: Actualmente el proyecto es 100% estático (sin backend, sin dependencias).
> Para multijugador real necesitamos infraestructura servidor. La estrategia es:
> usar un backend mínimo con WebSockets que sirva como relay de mensajes.

### Fase 3A: Infraestructura servidor
**Commit**: `feat: add Node.js server with WebSocket support for multiplayer`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| `package.json` | Crear | `{ "name": "quoraidor", dependencies: { "ws": "^8", "express": "^4", "uuid": "^9" } }` |
| `server.js` | Crear | Express sirve los archivos estáticos. WS server en el mismo puerto. Gestión de rooms/partidas |
| Room system | `server.js` | `rooms = Map<roomId, { players: [ws1, ws2], state, spectators }>`. Crear sala, unirse, espectador |
| Message protocol | `server.js` + doc | JSON messages: `{ type: 'create'|'join'|'move'|'state'|'chat'|'error', data }` |
| Validación server-side | `server.js` | El servidor valida cada movimiento con `game.js` (importado como módulo). No confía en el cliente |
| Heartbeat/ping | `server.js` | Detectar desconexiones, pausar partida |
| `.gitignore` update | `.gitignore` | Añadir `node_modules/` |

### Fase 3B: Cliente multiplayer
**Commit**: `feat: multiplayer lobby and online game client`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Nuevo screen: Lobby | `index.html`, `style.css` | Screen con: crear sala, unirse por código, lista de salas públicas |
| `multiplayer.js` | Crear | Módulo cliente WebSocket: connect, createRoom, joinRoom, sendMove, onOpponentMove, onStateSync |
| Integración en `ui.js` | `ui.js` | Nuevo modo `gameMode = 'online'`. Movimientos del humano se envían al server vía `multiplayer.js`. Movimientos del oponente llegan por WS y se aplican |
| Sincronización de estado | `multiplayer.js` | Server es authoritative. Cliente envía intención de movimiento, server valida y broadcast nuevo estado |
| Manejo de desconexión | `ui.js`, `multiplayer.js` | Si oponente se desconecta: modal "Opponent disconnected", opción de esperar o ganar por abandono |
| Chat mínimo | `index.html`, `multiplayer.js` | Panel de chat lateral con mensajes de texto básicos |
| Traducciones multiplayer | `i18n.js` | Keys: `createRoom`, `joinRoom`, `roomCode`, `waitingOpponent`, `opponentDisconnected`, `onlineGame`, `enterCode`, `copyCode` |

### Fase 3C: Sistema de usuarios y sesiones
**Commit**: `feat: user accounts with guest and registered modes`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Guest mode | `server.js`, `multiplayer.js` | Por defecto, usuarios son "Guest-XXXX" (nombre aleatorio). Se almacena en localStorage. Sin registro requerido |
| Registro opcional | `server.js` | Endpoint REST: `POST /api/register { username, password }`, `POST /api/login`. Passwords hasheados con bcrypt. SQLite como DB ligera |
| `database.js` (server) | Crear | Wrapper SQLite: `users`, `games`, `stats` tables. Esquema mínimo |
| JWT sessions | `server.js` | Token JWT en login, enviado en WS handshake como query param. Guest users reciben token temporal |
| Perfil de usuario | `index.html`, `ui.js` | Mostrar nombre de usuario en header. Modal de perfil con stats |
| Persistencia de stats en servidor | `server.js`, `database.js` | Tras cada partida online: guardar resultado, actualizar wins/losses/draws, calcular rating ELO |

### Fase 3D: Estadísticas y ranking
**Commit**: `feat: player statistics, ELO rating, and leaderboard`

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| ELO rating system | `server.js` | K-factor 32 para nuevos, 16 para establecidos. Cálculo estándar FIDE. Rating inicial 1200 |
| Stats endpoint | `server.js` | `GET /api/stats/:userId` → `{ wins, losses, draws, elo, gamesPlayed, winRate, longestStreak }` |
| Leaderboard endpoint | `server.js` | `GET /api/leaderboard?limit=50` → Top jugadores por ELO |
| Stats panel en UI | `index.html`, `ui.js`, `style.css` | Screen "Profile" accesible desde header. Muestra: rating, historial, winrate chart |
| Leaderboard screen | `index.html`, `style.css` | Tabla con ranking global, filtrable por período |
| Stats locales (offline) | `ui.js` | Para partidas vs IA: trackear wins/losses en localStorage separadamente. Mostrar junto a stats online |

---

## Orden de ejecución

```
ÁREA 1 (Bugs + Accesibilidad):
  1A → 1B → 1C                         [3 commits]

ÁREA 2 (IA + Plataforma):
  2A → 2B → 2C → 2D                    [4 commits]

ÁREA 3 (Multiplayer + Usuarios):
  3A → 3B → 3C → 3D                    [4 commits]

Total: 11 commits secuenciales
```

Áreas 1 y 2 son independientes del backend y se ejecutan primero.
Área 3 requiere infraestructura nueva y se aborda al final.

---

## Convenciones

- **Commits**: Prefijo semántico (`feat:`, `fix:`, `refactor:`).
- **Push**: Inmediato después de cada commit.
- **Branch**: `feature/ai-evolution`.
- **i18n**: Toda cadena nueva en CA/ES/EN.
- **Accesibilidad**: Todo nuevo elemento interactivo tiene ARIA + keyboard support.
- **Server**: Puerto por defecto 3000. Configurable via `PORT` env var.
- **Testing**: Verificar que `index.html` sigue funcionando como estático (sin server) para el modo offline vs IA.
