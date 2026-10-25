# Chess Realms — Audit & Upgrade Plan

> Note: the brief describes a "chase" game, but the supplied codebase is **Chess Realms**, a 3D chess game.
> The brief's goals (premium visuals, animation, UI, feel, performance) are applied to chess. No chase
> mechanics were invented; every working chess feature is preserved.

## 1. Audit

### Stack
React 19 + TypeScript + Vite 8 + Tailwind 4, raw Three.js r186 (no R3F), framer-motion, PeerJS,
procedural Web Audio. No external models, textures or audio files.

### Gameplay loop (preserved)
Menu → choose mode (local 2P / vs Rika AI with 5 levels / online room) → names, piece materials,
arena (8), clock (none / 5 / 10 min) → play (click or drag, legal-move highlights, promotion picker,
undo, hint, draw offer, resign, camera presets, 2D top view, coordinates, screenshot) → game over
(checkmate, stalemate, threefold, 50-move, insufficient material, timeout, resignation, agreed draw)
→ career W/L/D + head-to-head records → Best Moments 3D replay → rematch / menu.

### Measured baseline (headless Chrome, AMD iGPU, 1440×900)
| Scene | Draw calls / frame | Triangles / frame |
|---|---|---|
| Menu (3 WebGL contexts) | 1,283 | 192k |
| Esports Arena | 1,249 | 189k |
| Cathedral Sanctum | 2,690 | 356k |
| Other arenas | ~1,200 | ~170k |

### Bugs found
- Move sounds play 2–3× per move (ChessView3D, App and the AI/online paths each play them).
- vs-AI: when the human picks Black, the AI moves for **both** sides (`turn === 'b' || turn === p2.color`).
- vs-AI: the human can click and move the AI's pieces.
- AI search runs on the main thread — the whole game freezes while Hard 3/4 thinks.
- Chosen piece material is ignored: every piece is hard-coded ivory/obsidian.
- `undoMove` replays from the start position, so undo is wrong after any FEN load (Best Moments replay).
- Render loop closes over stale props (`cameraPreset`, `settings`, `currentArena`) → top-view transitions
  and victory fireworks use outdated values.
- Pressing `R` resigns instantly with no confirmation.
- `ChessView3D` rebuilds **all 32 piece meshes** (new geometry + materials) after every move.
- Every board/highlight/particle creates new geometry + material per object per frame (GC stalls).
- Arena update redraws and re-uploads a canvas texture every frame, allocates Colors per frame, reads
  `new Date()` per frame for a real-clock day/night cycle that tints every arena unpredictably.
- Arena teardown only disposes direct child meshes → GPU memory leaks when switching arenas.
- The board looks identical in all 8 arenas (per-arena colours are computed but never used).
- 4 extra WebGL contexts for material previews on the menu (mobile browsers cap contexts).

### Architecture problems
- `App.tsx` (1,100 lines) mixes game rules, clocks, AI, online, persistence and all modal state.
- Dead code / deps: 4 unused piece styles, unused traditional-study builder, `EvaluationGraph` + d3,
  `@google/genai`, `express`, `dotenv`, duplicate `motion` package, logo-variant favicon gimmick.

## 2. Plan

| Area | Upgrade |
|---|---|
| Foundation | `GameController` (rules, clocks, AI, online, records) + tiny external store; renderer subscribes to typed events; config files for tuning and quality. |
| AI | Web Worker with time budget + iterative deepening; main thread never blocks. |
| Rendering | One `ChessScene` owning renderer, post-FX, camera rig, board, pieces, FX, arena. Shadow map only re-rendered when something moves. Adaptive resolution. |
| Pieces | New hand-tuned Staunton set (smooth lathe profiles, extruded bevelled knight), one merged mesh per piece, cached geometry, real PBR materials honouring the player's choice. Original "Warrior" set kept as an option (merged for speed). |
| Board | Per-arena board themes (wood, marble, sandstone, slate…), 2 draw calls for 64 squares, clean chess.com-style move dots/rings, hover outline, last-move tint, check glow. |
| Arenas | All 8 kept. Automatic static batching (detects what animates), proper disposal, throttled updates, per-arena fog/exposure/environment. |
| Post-FX | MSAA, ACES tone mapping, gentle bloom, colour grade + vignette, tension vignette (check / low clock). |
| Animation | Lift-arc-settle moves, knight hop, castling choreography, capture knock-over + debris, promotion morph, hover lift, idle camera drift, turn-change orbit, intro fly-in, victory orbit, optional short capture cinematics. |
| UI | Apple-style design system (SF/Inter type scale, 8-pt spacing, translucent materials). New loading, menu, arena picker, settings, how-to-play, HUD, pause, promotion, game-over, best-moments, dialogs, toasts. Fully responsive. |
| Input | Mouse, touch, keyboard board cursor (arrows + Enter), gamepad (D-pad/A/B/Start). |
| Audio | Fixed double triggers, adaptive tension layer (check, low clock), master/music/SFX volume. |
| Accessibility | Reduced motion, text size, camera sensitivity, high-visibility move hints, haptics toggle. |
