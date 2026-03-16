# QuorAIdor - Plan de Mejora Integral

## Visión general

Este documento define el plan de mejoras de UI/UX, modos de juego, usabilidad y
pulido visual para QuorAIdor. Está diseñado para ejecutarse de forma autónoma en
fases secuenciales, donde cada fase produce un commit funcional y deployable.

**Branch**: `feature/ai-evolution`  
**Estrategia de commits**: Un commit por fase completada, push inmediato.

---

## FASE A — Quick Wins (triviales, alto impacto acumulado)

> **Objetivo**: Mejoras de 1-5 líneas que elevan la calidad percibida sin riesgo.  
> **Commit**: `fix: quick wins — language detection, contrast, font sizes, focus, persist settings`

### A1. Auto-detección de idioma del navegador
- **Archivo**: `i18n.js:173`
- **Cambio**: Reemplazar `|| 'ca'` por detección con `navigator.language`, fallback a `en`.
- **Lógica**: Si `navigator.language` empieza por `ca` → `ca`, `es` → `es`, default → `en`.

### A2. Corregir contraste en tema claro
- **Archivo**: `style.css`
- **Cambio**: `--text-dim: #777` → `--text-dim: #555`, `--text-muted: #555` → `--text-muted: #444`.

### A3. Aumentar fuentes mínimas a 0.85rem
- **Archivos**: `style.css` (`.lang-btn`, `.wall-count`, `.panel-title`, `#analysis-content`, `#move-list`, `.mode-btn`)
- **Cambio**: Todo `font-size` < 0.85rem → 0.85rem.

### A4. Focus indicators para teclado
- **Archivo**: `style.css`
- **Cambio**: Añadir regla `button:focus-visible, .toggle-btn:focus-visible, .mode-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.

### A5. Persistir color, dificultad y paths entre sesiones
- **Archivo**: `ui.js`
- **Cambio**: En `startNewGame`, guardar `data-color` y `data-depth` seleccionados en localStorage. Al iniciar, restaurar.

### A6. Etiquetas P1/P2 en la barra de evaluación
- **Archivos**: `index.html`, `style.css`
- **Cambio**: Añadir `<span>` con "P1" abajo y "P2" arriba de `#eval-bar`.

### A7. Tooltips de dificultad
- **Archivo**: `index.html`
- **Cambio**: Añadir `title` a cada botón de dificultad explicando depth y velocidad.

### A8. Botón de rendirse
- **Archivos**: `index.html`, `ui.js`, `i18n.js`
- **Cambio**: Botón "Resign" junto a Undo. Llama a `showGameOver()` con winner=AI.

---

## FASE B — Feedback Visual Inmediato

> **Objetivo**: Que el usuario siempre sepa qué acaba de pasar.  
> **Commit**: `feat: visual feedback — last move highlight, invalid move shake, AI move indicator`

### B1. Highlight del último movimiento
- **Archivo**: `ui.js` (draw function)
- **Cambio**: Guardar `lastMove = { from, to, type }` en cada `applyHumanMove`/`doAIMove`. En `draw()`, pintar la celda origen semi-transparente y la destino con borde de color.
- **Para paredes**: Dibujar la pared recién colocada con un glow temporal (2-3 turnos).

### B2. Feedback en movimiento inválido
- **Archivo**: `ui.js` (handleBoardInput)
- **Cambio**: Cuando el click/tap cae en una celda no válida, aplicar flash rojo momentáneo (canvas overlay) + vibrar si `navigator.vibrate` disponible.

### B3. Indicador mejorado de "IA pensando"
- **Archivos**: `ui.js`, `style.css`
- **Cambio**: Reemplazar el texto overlay por un spinner CSS centrado sobre el canvas + texto "IA pensando..." debajo. Usar `requestAnimationFrame` para animar.

---

## FASE C — Modo Humano vs Humano

> **Objetivo**: Permitir juego local entre dos personas.  
> **Commit**: `feat: add local human vs human game mode`

### C1. Botón "Humano vs Humano" en el menú
- **Archivo**: `index.html`
- **Cambio**: Nuevo botón entre "Start Game" y "Watch AI vs AI".

### C2. Lógica HvH en ui.js
- **Archivo**: `ui.js`
- **Cambio**: Nueva función `startHvHGame()` donde `humanPlayer = 'both'`. En `applyHumanMove`, si ambos son humanos, no llamar a `doAIMove()`. Alternar el indicador de turno: "Turno de P1" / "Turno de P2". Ocultar panel de análisis de IA (no tiene sentido).
- **Undo**: Retroceder 1 movimiento en vez de 2.

### C3. Selector de color reemplazado por selector de modo
- **Archivos**: `index.html`, `ui.js`, `style.css`
- **Cambio**: Reorganizar el menú: primero elegir modo (vs IA / vs Humano / Ver IA vs IA), luego mostrar opciones relevantes (color solo en vs IA, dificultad solo si hay IA).

### C4. Traducciones
- **Archivo**: `i18n.js`
- **Cambio**: Añadir keys: `hvh`, `turnP1`, `turnP2`, `vsHuman`, `vsAI`, `selectMode`.

---

## FASE D — Transiciones y Animaciones

> **Objetivo**: Que la app se sienta fluida y pulida.  
> **Commit**: `feat: screen transitions and pawn movement animation`

### D1. Transiciones entre pantallas
- **Archivos**: `style.css`, `ui.js`
- **Cambio**: Reemplazar `display: none/block` por `opacity + transform` transitions. Clase `.screen` tiene `opacity: 0; transform: translateY(20px); transition: all 0.3s ease`. Clase `.screen.active` tiene `opacity: 1; transform: none`.
- **JS**: `showScreen()` gestiona clases `.active` con un breve delay para la entrada.

### D2. Animación de movimiento de peón
- **Archivos**: `ui.js`, `renderer.js`
- **Cambio**: Al aplicar un movimiento, interpolar posición del peón con `requestAnimationFrame` durante ~200ms (ease-out). Guardar `animState = { player, fromRow, fromCol, toRow, toCol, t, duration }`. En `draw()`, si hay animación activa, dibujar el peón en posición interpolada.

### D3. Fade-in de paredes
- **Archivo**: `ui.js`
- **Cambio**: Las paredes recién colocadas se dibujan con `globalAlpha` que sube de 0 a 1 en 150ms.

---

## FASE E — Responsive & Mobile

> **Objetivo**: Que el juego sea totalmente jugable en móvil.  
> **Commit**: `feat: responsive layout with scalable board for mobile`

### E1. Canvas responsivo
- **Archivo**: `renderer.js`, `ui.js`
- **Cambio**: Calcular `CELL` dinámicamente: `CELL = Math.floor((Math.min(viewportWidth, viewportHeight) - 100) / SIZE)`, con mínimo 30 y máximo 50. Recalcular en `window.resize`. `GAP` y `PAD` proporcionales.
- **Importante**: `cellFromPixel` debe usar las mismas constantes dinámicas.

### E2. Layout adaptativo con tabs en móvil
- **Archivos**: `index.html`, `style.css`
- **Cambio**: En `@media (max-width: 600px)`, el game-screen muestra solo el tablero + controles arriba. Los paneles laterales se colapsan en tabs debajo: "Info" | "Moves" | "Analysis". El eval bar se convierte en horizontal y se mueve arriba del tablero.

### E3. Eval bar horizontal en móvil
- **Archivos**: `index.html`, `style.css`
- **Cambio**: `@media (max-width: 600px) { #eval-bar { height: 20px; width: 100%; flex-direction: row; } }`

### E4. Mode buttons más grandes en móvil
- **Archivo**: `style.css`
- **Cambio**: `@media (max-width: 600px) { .mode-btn { padding: 12px 8px; font-size: 1rem; } }`

---

## FASE F — Onboarding y Reglas

> **Objetivo**: Que un nuevo usuario pueda aprender a jugar.  
> **Commit**: `feat: how to play modal with interactive rules explanation`

### F1. Modal de reglas
- **Archivos**: `index.html`, `style.css`
- **Cambio**: Botón "How to Play" / "Cómo jugar" en el menú. Abre un modal con secciones:
  1. **Objetivo**: Llegar al lado opuesto.
  2. **Movimiento**: Ejemplo visual (mini canvas 3x3).
  3. **Paredes**: Explicación + ejemplo visual.
  4. **Saltos**: Explicación + ejemplo.
  5. **Estrategia básica**: 2-3 tips.

### F2. Lógica del modal
- **Archivo**: `ui.js`
- **Cambio**: Función `showRules()` que renderiza mini-boards de ejemplo usando `BoardRenderer.drawBoard` en canvases pequeños dentro del modal.

### F3. Traducciones de reglas
- **Archivo**: `i18n.js`
- **Cambio**: Añadir keys para todos los textos de reglas en CA/ES/EN.

---

## FASE G — Mejoras de Información

> **Objetivo**: Que la información presentada sea clara y útil.  
> **Commit**: `feat: improved game info — contextual labels, move history nav, resign`

### G1. Análisis contextual (You/AI en vez de P1/P2)
- **Archivos**: `ai.js` (getPositionSummary, getBestMoveHint), `ui.js`
- **Cambio**: Pasar `humanPlayer` al AI para que use "You"/"AI" (o traducciones) en vez de "P1"/"P2".

### G2. Navegación en historial de movimientos
- **Archivo**: `ui.js`
- **Cambio**: Cada entrada del move list es clickeable. Click salta a ese estado (usando `stateHistory[index]`). Añadir `currentMoveIndex` para trackear posición. Botones `←` `→` para navegar.
- **Nota**: Si el usuario navega atrás y luego mueve, descartar la historia futura.

### G3. Descripción de dirección de movimiento
- **Archivos**: `index.html`, `i18n.js`
- **Cambio**: Junto al selector de color, mostrar "You move ↓" o "You move ↑" según el color elegido.

---

## FASE H — Guardar / Cargar Partidas

> **Objetivo**: No perder partidas al cerrar el navegador.  
> **Commit**: `feat: auto-save game state and manual save/load`

### H1. Auto-save del estado de partida
- **Archivo**: `ui.js`
- **Cambio**: Después de cada movimiento, guardar en `localStorage('qouraid-game-state')`:
  `{ state, stateHistory, humanPlayer, aiPlayer, depth, usingTrainedWeights, positionCounts }`.
- Al cargar la página, si hay partida guardada, mostrar opción "Continue Game" en el menú.

### H2. Confirmar al salir al menú
- **Archivo**: `ui.js`
- **Cambio**: "Menu" button muestra modal: "Game in progress. Save and exit?"
  Opciones: "Save & Exit" / "Discard & Exit" / "Cancel".

### H3. Limpiar save al terminar partida
- **Archivo**: `ui.js`
- **Cambio**: En `showGameOver()`, borrar `localStorage('qouraid-game-state')`.

---

## FASE I — Pulido Visual Final

> **Objetivo**: Detalles estéticos que elevan la calidad percibida.  
> **Commit**: `feat: visual polish — board shadows, color consolidation, theme transitions`

### I1. Consolidar colores en CSS custom properties
- **Archivos**: `style.css`, `renderer.js`
- **Cambio**: Mover `#4fc3f7`, `#e94560` etc. a `--color-p1`, `--color-p2` en `:root`. `getColors()` lee de CSS vars.

### I2. Sombras y profundidad en el tablero
- **Archivo**: `renderer.js`
- **Cambio**: Añadir `ctx.shadowColor/shadowBlur` sutil a los peones. Borde redondeado en las celdas (`roundRect`). Sombra en las paredes colocadas.

### I3. Transición suave de theme en canvas
- **Archivo**: `ui.js`
- **Cambio**: Al cambiar tema, fade-out canvas (200ms), cambiar tema, fade-in canvas.

### I4. Favicon y meta tags
- **Archivo**: `index.html`
- **Cambio**: Añadir favicon SVG simple (tablero estilizado), meta description, viewport meta mejorado, og:tags básicos.

---

## FASE J — Validación Training Arena

> **Objetivo**: Mejorar usabilidad de la arena de entrenamiento.  
> **Commit**: `feat: training arena UX — tooltips, validation, confirmation dialogs`

### J1. Tooltips en parámetros de configuración
- **Archivo**: `training.html`
- **Cambio**: Añadir `title` a cada label e input con explicación del parámetro.

### J2. Validación de inputs
- **Archivo**: `training.js` (readConfig)
- **Cambio**: Verificar rangos válidos (population > elite, maxGenerations > 0, etc.). Mostrar error inline si falla.

### J3. Confirmación al parar entrenamiento
- **Archivo**: `training.js`
- **Cambio**: "Back to Config" muestra modal: "Stop training? Progress is saved automatically."

### J4. Confirmación al importar población
- **Archivo**: `training.js`
- **Cambio**: Al importar, mostrar preview (N genomes, generation, etc.) con botón "Confirm Import".

---

## Orden de ejecución

```
FASE A  →  Quick wins, sin riesgo
FASE B  →  Feedback visual, mejora experiencia inmediata
FASE C  →  Nuevo modo de juego (HvH)
FASE D  →  Animaciones, pulido de movimiento
FASE E  →  Mobile responsive (cambio mayor)
FASE F  →  Onboarding
FASE G  →  Info mejorada
FASE H  →  Save/load
FASE I  →  Pulido visual
FASE J  →  Training arena UX
```

Cada fase produce un commit independiente y funcional. Si algo falla, se puede
revertir la fase sin afectar las anteriores.

---

## Convenciones

- **Commits**: Prefijo semántico (`feat:`, `fix:`, `refactor:`).
- **Push**: Inmediato después de cada commit exitoso.
- **Branch**: Todo en `feature/ai-evolution`.
- **Testing**: Verificación manual abriendo `index.html` y `training.html` tras cada fase.
- **i18n**: Toda cadena nueva se traduce a CA/ES/EN.
- **Sin archivos nuevos innecesarios**: Preferir editar existentes. Solo crear archivos si la fase lo requiere explícitamente.
