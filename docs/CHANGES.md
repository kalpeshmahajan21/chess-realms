# Chess Realms v2 — What changed

The brief described a "chase" game; the supplied codebase is **Chess Realms**, a 3D chess game.
All of the brief's goals were applied to chess, and every v1 feature was kept: 3 modes, 5 AI
levels, 8 arenas, 7 piece materials, clocks, undo, hints, draw/resign, camera presets, 2D/top
view, coordinates, screenshots, haptics, records + head-to-head, highlight replay, online rooms.

## Measured results

Headless Chrome, AMD integrated GPU, 1440×900, same machine for both versions.

| | v1 | v2 |
|---|---|---|
| Draw calls per frame (in game) | 1,193 – 2,690 | **66 – 128** |
| WebGL contexts on the menu | 3 (+1 per material preview) | **1** |
| Frames per second while Hard AI thinks | 0 (main thread blocked) | **56 – 58** |
| Pieces rebuilt per move | all 32 (new geometry + materials) | **0** (meshes reused) |
| Per-frame allocations (particles, colours, canvas uploads) | many | **none in steady state** |
| Production bundle | — | ~370 KB gzipped, split into cacheable chunks |
| Console errors during a full playthrough | — | **0** |

## Bugs fixed

- Move, capture and check sounds played two or three times per move.
- vs Computer: choosing Black made the AI move for **both** sides.
- vs Computer: the human could click and move the AI's pieces.
- The AI search froze the whole page (rendering included) at higher levels.
- The chosen piece material was ignored — every piece was hard-coded ivory/obsidian.
- Undo replayed from the start position, so it broke after any FEN load (highlight replay).
- The render loop read stale React props (camera preset, settings, arena).
- `R` resigned instantly with no confirmation.
- Arena switching leaked nested geometry, materials and textures.
- A real-clock day/night cycle tinted arenas unpredictably (cyan sun in the esports arena, etc.).
- The board looked identical in all eight arenas (per-arena colours were computed but unused).
- Cathedral brazier lights cast point-light shadows (12 extra scene renders per frame).
- A 1.4 MB PNG was used as the favicon.
- Old music/SFX mute flags persisted with no UI left to clear them.

## Graphics

- **Pieces:** new tournament Staunton set — smooth lathe profiles, real crenellated rook, extruded
  bevelled knight (shown in profile from the player's seat), crowned queen and king. One merged mesh
  per piece, cached per type. The original "Gilded Warrior" set remains selectable in Settings.
- **Materials:** physically based finishes for all seven choices — veined Carrara marble, glassy
  obsidian, brushed silver/gold, dispersive crystal (transmission + dispersion), ruby, jade.
  Same-material games darken the black army so sides stay distinct.
- **Board:** per-arena procedural boards (walnut/maple parquet, red-lacquer wood, marble inlay,
  sandstone and lapis, slate, glass, arcane stone) with a bevelled frame, metal inlay, plinth and
  pedestal, coordinates engraved on the frame. 64 squares render in one draw call.
- **Lighting:** per-arena lighting rig (sun with tight shadow frustum, sky/ground fill, rim light),
  arena-tinted environment map for reflections, exponential fog, gradient sky with sun glow.
- **Post-processing:** MSAA, HDR bloom (only true highlights bloom), ACES tone mapping, colour grade
  (saturation, contrast, warm/cool split), vignette and a red "tension" pulse in check or low time.
- **Performance:** automatic static batching of arena scenery (a dry run with a fake clock finds what
  animates), point lights capped per quality level, shadow map re-rendered only when something moves,
  adaptive resolution, render loop paused in background tabs, WebGL context-loss handling.

## Animation and game feel

- Moves lift, glide and settle with a slight lean; knights hop; castling moves king and rook together.
- Captures: the attacker strikes, the victim topples away, skids and sinks; debris in the victim's
  colour bounces with physics, plus sparks, dust and a shockwave. Camera shake and a small FOV punch.
- Optional capture cinematics ("Big moments" by default): close over-the-shoulder shot with slow motion
  on impact, letterbox bars, skippable with a tap or Space.
- Promotion morph with a sparkle burst; check pulse ring under the king; landing dust on every move.
- Camera: damped orbit, fly-in intro, turn-change rotation in local games, idle drift, slow menu orbit,
  victory orbit with fireworks, aspect-aware framing (portrait, landscape phones, tablets, desktop),
  foreground scenery is clipped so it cannot block the board.
- Drag: the piece follows the pointer with lag and leans into the motion; illegal drops spring back.
- Hover lift on movable pieces; selected piece floats gently.

## UI / UX

A new Apple-inspired design system (SF / Inter type scale, translucent materials, hairline borders,
spring motion) and rebuilt screens: loading, first-run name prompt, main menu over the live scene,
arena picker with live preview, settings (Game / Graphics / Audio / Accessibility), how-to-play,
HUD (player cards with clocks, captured pieces, material lead, thinking indicator; status pill; move
list with evaluation bar; control dock with camera menu), pause menu, promotion picker, confirm
dialogs, toasts, results screen with stats and records, highlight replay bar, online waiting card.

## Audio

Duplicate triggers removed; sounds are timed to the landing / impact. New adaptive tension layer: a
heartbeat whose tempo and level follow check and low-clock tension while the ambience ducks.
Master, music and SFX volume plus mute in Settings.

## Input and accessibility

Mouse, touch (tap, drag, one-finger orbit, pinch zoom), full keyboard play with a board cursor, and
gamepad support. Reduce motion, high-visibility move hints, text size, orbit sensitivity, haptics
toggle, focus-visible outlines, labelled controls and live status announcements.

## Architecture

`GameController` owns all game rules and flow and exposes a small store; React screens subscribe to
slices; the 3D scene subscribes to the same store and to typed events (`sync`, `move`, `gameOver`,
`skip`, `screenshot`) whose handlers return promises, so game flow waits for animations without
timers. Tuning lives in `src/config/`. Dead code and unused dependencies (`@google/genai`, `express`,
`dotenv`, `d3`, duplicate `motion`, four unused piece styles, unused arena builder) were removed.

## v2.1 — Realistic arenas

Four arenas were rebuilt from real-world assets (all free: Poly Haven CC0 and NASA public domain — see CREDITS.md):

| Arena (id) | How it is built |
|---|---|
| Grand Library (`traditional`) | Modelled room: scanned herringbone parquet, walnut bookcases on four walls holding ~10,000 instanced leather-bound books with gilt bands, plaster walls, coffered ceiling, wool rug, walnut library table, scanned chandelier, armchair, grandfather clock, marble bust, oil lamp, vase and plants; lit by a real palace-hall HDRI plus warm lamps. |
| Palace Courtyard (`india`) | Real 360° photo of Piazza Bologni, Palermo projected as ground + sky; board on a scanned-marble table; sun direction read from the HDR so shadows match the photo; a shadow catcher puts the table shadow on the photographed paving. |
| Football Stadium (`chess_arena`) | Real stadium panorama with the mowed pitch as ground; board on a matte broadcast stage; camera flashes from the stands on captures. |
| Deep Space (`shadow_dungeon`) | NASA Milky Way sky, 9,000 crisp stars, Earth from orbit (NASA day map, city lights on the night side, drifting clouds, ocean glint, atmospheric limb), NASA Moon, Saturn with rings, the Sun with glare, floating platform. |

Also: chessboards in these arenas use real scanned maple/walnut veneer and marble (raw scans are "finished" in code with an oil tint), photos are shown at their true colours by cancelling the final ACES pass, each arena sets its own camera angle (low cinematic orbit in the menu), arenas load asynchronously with a loading indicator and cancel cleanly if you switch again, and real preview thumbnails appear in the arena picker.

**v2.2** rebuilt the other four the same way:

| Arena (id) | How it is built |
|---|---|
| Kyoto Garden (`japan`) | Real garden photo (pavilion, stone lantern, koi pond); cedar table on black-lacquered legs. |
| Metropolis Night (`usa`) | Real harbour city at blue hour; polished granite plinth with a warm LED line; HDR highlights clamped so street lamps light the scene without flaring in the lacquer. |
| Pharaoh Sands (`egypt`) | Real desert with rocky outcrops under a hot sun; stacked sandstone plinth; marble-and-lapis board. |
| Royal Citadel (`royal_kingdom`) | Real palace ballroom (chandelier, gilt, paintings, parquet); walnut and gold pedestal table, two scanned armchairs. |

Boards now use a satin lacquer (broad sheen instead of a pin-point sun glint).

Measured: 63–87 draw calls per frame in every arena; GPU memory identical after three full laps through all eight arenas (42 geometries / 31 textures each lap — no leaks).

## Known limitations

- Pieces and arenas are procedural; there are no sculpted/scanned models or texture photography.
  A future upgrade could load compressed glTF piece sets (Draco/Meshopt + KTX2).
- Asset weight: ~81 MB in `public/realms` (the 8K panoramas are ~half of it and load only on High quality); hosting must serve these files.
- Ambient audio loops are still the v1 synthesised ones (e.g. Kyoto plays its original bowl-and-flute bed).
- Photo arenas are photographs: the background cannot move with parallax, and at the playing angle you mostly see the ground (the buildings and stands show in the menu orbit, or drag to lower the camera).
- The Grand Library is the heaviest arena (~600K triangles); it runs ~45 fps on an integrated laptop GPU at 1440×900 on High.
- Online play depends on the free public PeerJS signalling server; networks that block WebRTC fall
  back to same-device tabs only. There is no matchmaking, reconnection or move clock sync.
- The AI is a classic alpha-beta engine (roughly club strength at the top level); ELO labels are
  approximate. A WASM Stockfish build would give real grandmaster strength.
- No screen-space reflections or ambient occlusion (cost on mobile); contact grounding comes from
  shadow maps.
- Audio is synthesised; recorded foley would sound richer.

## Recommended next upgrades

1. glTF piece sets with KTX2 textures, loaded lazily per set.
2. Stockfish WASM worker for the top difficulty and post-game analysis.
3. Online: reconnect, spectators, synced clocks, rematch handshake, a small signalling server.
4. PWA offline install (service worker) — the manifest is already in place.
5. Puzzle and lesson modes reusing the highlight/replay system.

## Quality checklist

- [x] Graphics — PBR pieces and boards, per-arena lighting, fog, sky, env reflections, bloom, grading
- [x] Animation — moves, captures, castling, promotion, camera intro/turn/victory, particles
- [x] UI — design system, every screen rebuilt, responsive phone/tablet/desktop, no overflow
- [x] Controls — mouse, touch, keyboard, gamepad; confirmations for destructive actions
- [x] Performance — 10–30× fewer draw calls, AI off main thread, adaptive resolution
- [x] Gameplay — all v1 modes kept; AI/turn bugs fixed; automated playthroughs pass
- [x] Build — strict TypeScript clean, production build verified in a real browser, 0 console errors

## v2.3 — Reliable capture cinematics

- **Every capture plays a cinematic** (both colours, all modes, en passant and capture-promotions).
  The old "Big moments" mode only fired for queen/rook captures, promotions and mate — that was why
  most captures showed nothing.
- **Strict queue**: moves are applied one at a time in the controller and animated one at a time in
  the scene, so an online or AI move arriving mid-cinematic waits its turn instead of fighting for the camera.
- **Four rotating shots**: over-the-shoulder, low-angle hero tracking the attacker, side tracking, and a
  slow orbit around the impact; slow-mo, shatter, shake and realm particles at impact (~2–3 s total).
- **Always restores**: camera returns to the exact previous view and controls come back in a `finally`,
  even if an animation throws.
- **Settings → Cinematics: On / Off** (default On; old saved "Big moments" migrates to On).
  Click or Space skips the current cinematic.
- Tested: 24 captures in a two-player game (14 white, 10 black) and 14 vs AI (11 by the AI) — a
  cinematic every time, camera restored every time, skip in ~0.3 s.

## v2.4 — Five arenas rebuilt in real 3D

Palace Courtyard (Rajput palace), Kyoto Garden (tea house, koi pond, torii, pagoda), Metropolis Night
(rooftop helipad, lit skyscrapers, circling helicopter), Pharaoh Sands (temple, sarcophagi, mummies, pyramids)
and Spanish Café (replaces Royal Citadel; patrons playing chess, coffee and croissant, guitar ambience) are now
modelled scenes instead of 360° photo backdrops. New code: `src/render/realms/{kit,PalaceRealm,KyotoRealm,
MetropolisRealm,EgyptRealm,CafeRealm}.ts`. New CC0 Poly Haven assets; unused photo panoramas retired
(public/realms 157 MB → 104 MB). Memory stays flat when switching arenas; no page errors.

## v2.5 — Menu, Sapphire pieces, online piece choice

- **Sapphire** replaces Crystal (same saved id `diamond`): sky blue on one side, deep navy on the other.
- **Menu**: wider two-column panel on desktop/laptop (no scrolling at 1366×768 and up); large name card with
  initial avatar, name and record (tap to rename). Phones keep the scrolling bottom sheet.
- **Online rooms**: each player picks only their own pieces. The guest's choice is sent with the join request;
  if it matches the host's, the guest gets a contrasting set (Obsidian, or Marble when the host has Obsidian)
  and a message saying so.
- New crest logo (`public/assets/logo.png`) in the menu and loading screen; favicon and home-screen icons updated.

## v2.6 — Final polish and device pass

- Bigger crest (72 px) and a metallic "Chess Realms" wordmark in the menu; 120 px crest on the loading screen.
- Arena picker redesigned as game-select cards: full-bleed 768×432 thumbnails (all 8 re-rendered, no UI),
  numbered badges, accent-coloured glow and "Selected" tag, hover zoom and light sweep, readable heading fade.
- Device pass on 12 sizes (iPhone SE, iPhone 17, iPhone 17 Pro Max, Galaxy S24 Ultra, Moto G, Galaxy S8,
  Galaxy Fold closed, iPhone landscape, iPad mini, iPad Air, iPad Pro landscape, 1366×768 laptop): menu, arena
  picker, game, settings and game-over checked for overflow, off-screen controls and errors — none remain.
- Fixed: one-frame black flicker when the adaptive resolution changed or the window/phone rotated (canvas is
  now redrawn immediately after a resize).
- Fixed: landscape phones — menu now uses two columns with a compact header; pop-up sheets and the game-over
  card scroll instead of running off-screen.
- Fixed: bright hotspot on the library floor in the phone camera view (satin floor, softer lamp, calmer glow).
