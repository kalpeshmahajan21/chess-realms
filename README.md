# Chess Realms

Cinematic 3D chess for the browser. Play the computer (five strengths), a friend on the same
device, or a friend online — across eight arenas, with physically based pieces, capture
cinematics, procedural audio and a highlight reel at the end of every game.

The eight arenas are built from real-world assets (scanned textures and models, real HDR light):
- **Grand Library** — walnut bookcases, leather, chandelier and scanned furniture.
- **Palace Courtyard** — a red-sandstone Rajput palace: cusped arcades, marble onion dome, minarets, water channels.
- **Football Stadium** — a real 360° stadium photograph as ground and sky.
- **Deep Space** — NASA imagery of the Milky Way, Earth and Moon.
- **Kyoto Garden** — tea-house veranda, koi pond, torii, stone lanterns, cherry and maple trees, pagoda.
- **Metropolis Night** — a rooftop helipad among lit skyscrapers, with a helicopter circling.
- **Pharaoh Sands** — a temple court with sarcophagi and mummies, and the Giza pyramids at sunset.
- **Spanish Café** — an Andalusian café: azulejo tiles, patrons playing chess, coffee and a croissant by the board.

See [docs/CREDITS.md](docs/CREDITS.md). The code bundle is ~440 KB gzipped; each arena streams its own
assets (roughly 5–20 MB) when selected.

Built with React 19, TypeScript, Three.js r186 and Vite.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> `bun install` also works (a `bun.lock` is included).

## Test it

```bash
npm test          # rules (perft), gameplay, AI, v2 regression and score-tracker tests
npm run typecheck # strict TypeScript check
```

## Build and deploy

```bash
npm run build     # type-checks, then writes a static site to dist/
npm run preview   # serves dist/ on http://localhost:4173 to try the production build
```

`dist/` is a plain static site. Upload it to any static host:

| Host | How |
|---|---|
| Netlify | Drag `dist/` onto app.netlify.com/drop, or build command `npm run build`, publish dir `dist` |
| Vercel | Framework preset "Vite" (defaults are correct) |
| GitHub Pages | Copy `dist/` to the Pages branch; if served from a sub-path, build with `vite build --base=/repo-name/` |
| Cloudflare Pages | Build `npm run build`, output `dist` |
| Google AI Studio / Cloud Run | Unchanged from v1 — the app is still a client-only Vite project |

No environment variables or server are required. Online play uses the public PeerJS signalling
server for WebRTC; two tabs on the same device also connect directly through `BroadcastChannel`.

---

## How to play

| | |
|---|---|
| **Move** | Drag a piece, or tap it and tap a square. Dots = moves, rings = captures. |
| **Camera** | Drag empty space to orbit, scroll / pinch to zoom, **Camera** button or `C` for presets. |
| **Keyboard** | Arrows move a board cursor, `Enter` selects/moves, `Space` skips an animation, `U` undo, `H` hint, `D` draw, `R` resign, `M` mute, `Esc` pause. |
| **Gamepad** | D-pad / stick moves the cursor, `A` select, `B` cancel, `X` hint, `Y` camera, `LB` undo, `Start` pause. |

---

## Project layout

```
src/
  App.tsx                 Screen routing, overlays, global controls
  config/                 Tuning in one place
    gameConfig.ts         Animation timings, clocks, AI levels, default settings
    arenaThemes.ts        Per-arena board style, lighting, fog, grade, particles
    quality.ts            Low / Medium / High presets + device detection
  game/
    GameController.ts     Rules flow, turns, clocks, AI, online, records, highlights
    store.ts              Tiny external store (useSyncExternalStore)
    moments.ts            Highlight scoring
  engine/
    chess.ts              Rules engine (perft-verified)
    aiEngine.ts           Negamax + quiescence + TT, time-budgeted iterative deepening
    ai.worker.ts          Runs the search off the main thread
    aiClient.ts           Worker client with main-thread fallback
  render/
    ChessScene.ts         Renderer, lighting rig, sky, input, frame loop, adaptive resolution
    CameraRig.ts          Damped orbit camera, presets, cinematics, shake, framing
    PieceView.ts          Piece meshes and all move / capture / promotion animation
    pieceGeometry.ts      Procedural Staunton set (+ v1 Warrior set), merged per piece
    pieceMaterials.ts     PBR materials for the seven piece finishes
    BoardView.ts          Board, frame, coordinates and move highlights
    Effects.ts            Pooled GPU particles, debris, shockwaves, ambient particles
    PostFX.ts             MSAA, bloom, ACES, colour grade, vignette, tension pulse
    staticBatch.ts        Merges static arena geometry (dry-run detection of animation)
  render/realms/          All eight arenas (one file each), shared kit.ts helpers, asset loader, stadium photo backdrop
  graphics/arenas/        v1 procedural arena builders (kept as a fallback if assets fail to load)
  audio/soundEngine.ts    Procedural Web Audio SFX, ambience and tension heartbeat
  input/useControls.ts    Keyboard + gamepad
  ui/                     Design-system kit and every screen
public/realms/            HDRIs, photos, scanned textures, models, NASA maps (loaded per arena)
docs/
  CREDITS.md              Licences and sources for every real-world asset
  UPGRADE_PLAN.md         Audit of v1 and the upgrade plan
  CHANGES.md              What changed in v2, measurements, limitations
```

See [docs/CHANGES.md](docs/CHANGES.md) for the full list of improvements and measurements.
