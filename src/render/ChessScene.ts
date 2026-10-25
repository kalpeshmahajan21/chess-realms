import * as THREE from 'three';
import type { GameController, GameState, ViewEvents } from '../game/GameController.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { ArenaManager } from '../graphics/arenas/arenaManager.ts';
import { getArenaTheme, ArenaTheme } from '../config/arenaThemes.ts';
import { QUALITY_PRESETS, resolveQuality, QualityPreset, ResolvedQuality } from '../config/quality.ts';
import { TIMING } from '../config/gameConfig.ts';
import { Animator } from './anim.ts';
import { BoardView, squareCenter, squareFromPoint } from './BoardView.ts';
import { PieceView } from './PieceView.ts';
import { CameraRig } from './CameraRig.ts';
import { Effects } from './Effects.ts';
import { PostFX, buildEnvironment } from './PostFX.ts';
import { batchStatic } from './staticBatch.ts';
import { REALM_FACTORIES } from './realms/index.ts';
import { AssetScope } from './realms/assets.ts';
import type { Realm } from './realms/types.ts';
import type { ScannedBoard } from './BoardView.ts';
import type { ArenaId } from '../audio/soundEngine.ts';

/** Ground level of arena scenery relative to the board surface (the board sits on a pedestal). */
const SCENERY_DROP = -0.85;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop, uHorizon, uBottom, uSun, uSunColor;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-y, 0.0, 1.0), 0.35));
    float sun = max(dot(normalize(vDir), normalize(uSun)), 0.0);
    c += uSunColor * (pow(sun, 64.0) * 0.6 + pow(sun, 6.0) * 0.12);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

/** One capture cinematic: who took whom, where, and which camera shot framed it. */
export interface CinematicEvent {
  attacker: { type: string; color: string };
  victim: { type: string; color: string };
  from: number;
  to: number;
  shot: 0 | 1 | 2 | 3;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  mode: 'none' | 'piece' | 'orbit';
  sq: number | null;
  moved: boolean;
  /** Piece was already selected before this press (a tap then deselects it). */
  wasSelected: boolean;
}

export class ChessScene {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private post!: PostFX;
  private animator = new Animator();
  private board = new BoardView();
  private pieces = new PieceView(this.animator);
  private effects = new Effects();
  private arena = new ArenaManager();
  private sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private rim = new THREE.DirectionalLight(0xffffff, 0.6);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
  private sky: THREE.Mesh;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private theme!: ArenaTheme;
  private quality!: QualityPreset;
  private qualityName!: ResolvedQuality;
  private builtArena: ArenaId | null = null;
  private realm: Realm | null = null;
  private boardScope: AssetScope | null = null;
  private arenaToken = 0;
  private pmrem: THREE.PMREMGenerator | null = null;
  private menuPolar = 1.02;
  private moveChain: Promise<void> = Promise.resolve();
  /** Every capture cinematic that has played: { attacker, victim, from, to, shot }. */
  readonly cinematicLog: CinematicEvent[] = [];
  private shotIndex = 0;
  private unsubs: (() => void)[] = [];
  private raf = 0;
  private last = performance.now();
  private running = false;
  private disposed = false;
  private hover: number | null = null;
  private pointers = new Map<number, PointerState>();
  private pinchDist = 0;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TIMING.liftHeight + 0.12));
  private shadowDirty = 3;
  private slowmo = 0;
  private frameTimes: number[] = [];
  private pixelRatio = 1;
  private adaptCooldown = 2;
  private prevState: GameState | null = null;
  private moveInFlight = false;
  private width = 1;
  private height = 1;

  constructor(private container: HTMLElement, private game: GameController) {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.renderer.domElement.tabIndex = -1;
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(w / h);
    this.rig.resize(w / h, h);

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;

    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7.2;
    sc.right = sc.top = 7.2;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.rim, this.hemi, this.sky);
    this.scene.add(this.board.group, this.pieces.group, this.effects.group, this.arena.landmarkGroup, this.arena.lightsGroup);
    this.arena.landmarkGroup.position.y = SCENERY_DROP;
    this.arena.lightsGroup.position.y = SCENERY_DROP;

    this.applyQuality(this.game.state.settings.graphicsQuality, true);
    const firstArena = this.setArena(this.game.state.arena, true);
    this.configurePieces(true);
    this.pieces.sync(this.game.engine.state.board);
    this.board.setCoordinatesVisible(this.game.state.settings.showCoordinates);
    this.rig.orbit(0.05);

    this.bindEvents();
    this.bindInput();
    this.prevState = this.game.state;
    this.unsubs.push(this.game.store.subscribe(() => this.onState(this.game.state)));
    this.onState(this.game.state);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.unsubs.push(() => ro.disconnect());
    const vis = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', vis);
    this.unsubs.push(() => document.removeEventListener('visibilitychange', vis));
    const lost = (e: Event) => {
      e.preventDefault();
      this.stop();
      this.game.toast('Graphics were reset by the system — recovering…', 'warning');
    };
    const restored = () => {
      this.shadowDirty = 3;
      this.start();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', lost);
    this.renderer.domElement.addEventListener('webglcontextrestored', restored);

    this.start();
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { __scene: unknown }).__scene = { rig: this.rig, renderer: this.renderer, scene: this.scene, THREE, cinematics: this.cinematicLog };
    // Leave the loading screen once the first arena (and its real-world assets) is on screen.
    void firstArena.finally(() => requestAnimationFrame(() => this.game.setSceneReady(true)));
  }

  // ------------------------------------------------------------------ configuration
  private applyQuality(q: GameState['settings']['graphicsQuality'], initial = false) {
    const name = resolveQuality(q);
    if (!initial && name === this.qualityName) return;
    this.qualityName = name;
    this.quality = QUALITY_PRESETS[name];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    // three r186 folds soft shadows into PCF; the kernel radius controls penumbra softness.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.shadow.radius = this.quality.softShadows ? 3.5 : 1;
    this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.post?.dispose();
    this.post = new PostFX(this.renderer, this.scene, this.rig.camera, this.quality, this.width, this.height);
    if (this.theme) this.post.applyTheme(this.theme.light);
    this.effects.intensity = this.quality.particles;
    this.effects.setViewportHeight(this.height, this.pixelRatio);
    this.shadowDirty = 3;
    if (!initial) {
      this.setArena(this.game.state.arena, true);
      if (this.configurePieces()) this.pieces.sync(this.game.engine.state.board, { rebuild: true });
    }
  }

  private configurePieces(force = false): boolean {
    const s = this.game.state;
    const changed = this.pieces.configure(s.settings.pieceSet, this.quality.pieceSegments, this.qualityName !== 'low', s.p1, s.p2);
    return changed || force;
  }

  /**
   * Build an arena. The four realistic arenas are async realms (real HDRIs, photos, scans, models);
   * the others use the procedural v1 builders. A newer request cancels an older one still loading.
   */
  private async setArena(id: ArenaId, force = false): Promise<void> {
    if (!force && id === this.builtArena) return;
    this.builtArena = id;
    const token = ++this.arenaToken;
    const theme = getArenaTheme(id);
    const factory = REALM_FACTORIES[id];

    let realm: Realm | null = null;
    let scanned: ScannedBoard | null = null;
    const boardScope = new AssetScope();
    if (factory || theme.board.scan) {
      this.game.setArenaLoading(true);
      try {
        [realm, scanned] = await Promise.all([
          factory ? factory({ renderer: this.renderer, quality: this.quality, qualityName: this.qualityName }) : Promise.resolve(null),
          theme.board.scan ? this.loadScannedBoard(theme.board.scan, boardScope) : Promise.resolve(null),
        ]);
      } catch (err) {
        console.error(`[arena] ${id} failed to load`, err);
        this.game.toast('Some arena assets could not be loaded — showing a simpler version.', 'warning');
        realm = null;
        scanned = null;
      } finally {
        if (token === this.arenaToken) this.game.setArenaLoading(false);
      }
      if (token !== this.arenaToken || this.disposed) {
        realm?.dispose();
        boardScope.dispose();
        return;
      }
    }

    // Tear down whatever was there before.
    if (this.realm) {
      this.scene.remove(this.realm.group);
      this.realm.dispose();
      this.realm = null;
    }
    this.arena.clear();
    this.boardScope?.dispose();
    this.boardScope = boardScope;
    this.theme = theme;

    this.applyThemeLighting();
    if (realm) {
      this.realm = realm;
      this.scene.add(realm.group);
      this.applyRealmLighting(realm);
    } else {
      this.buildLegacyArena(id);
    }

    this.board.build(theme.board, this.qualityName === 'high' ? 2048 : 1024, { stand: realm ? realm.boardStand : 'pedestal', scanned });
    this.board.setCoordinatesVisible(this.game.state.settings.showCoordinates);
    const s = this.game.state;
    this.effects.setAmbient(theme.light.ambientParticles, s.settings.ambientEffects && !s.settings.reducedMotion, this.quality.particles);
    soundEngine.playArenaAmbient(id);
    this.shadowDirty = 3;
    // The arena may change the preferred camera angle.
    this.updateCameraIntent(this.game.state, null);
  }

  private async loadScannedBoard(scan: NonNullable<ArenaTheme['board']['scan']>, scope: AssetScope): Promise<ScannedBoard> {
    const [ld, ln, dd, dn, frame] = await Promise.all([
      scope.image(`tex/${scan.light}/diff.jpg`),
      scope.image(`tex/${scan.light}/nor.jpg`),
      scope.image(`tex/${scan.dark}/diff.jpg`),
      scope.image(`tex/${scan.dark}/nor.jpg`),
      scope.pbr(scan.frame),
    ]);
    return {
      light: { diff: ld, nor: ln, tint: scan.lightTint, filter: scan.lightFilter },
      dark: { diff: dd, nor: dn, tint: scan.darkTint, filter: scan.darkFilter },
      frame,
      frameColor: scan.frameColor,
    };
  }

  /** Lighting from a realm's real HDR environment. */
  private applyRealmLighting(realm: Realm) {
    const L = realm.lighting;
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.fog = L.fog ? new THREE.FogExp2(L.fog.color, L.fog.density) : null;
    this.sun.color.setHex(L.sunColor);
    this.sun.intensity = L.sunIntensity;
    this.sun.position.copy(L.sunDir).normalize().multiplyScalar(40);
    if (L.rim) {
      this.rim.color.setHex(L.rim.color);
      this.rim.intensity = L.rim.intensity;
      this.rim.position.copy(L.rim.dir).normalize().multiplyScalar(30);
    } else {
      this.rim.intensity = 0;
    }
    this.hemi.intensity = L.hemiIntensity;
    this.sky.visible = false;
    this.envRT?.dispose();
    this.envRT = null;
    if (L.prefiltered) {
      this.scene.environment = L.environment;
    } else {
      this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
      this.envRT = this.pmrem.fromEquirectangular(L.environment);
      this.scene.environment = this.envRT.texture;
    }
    this.scene.environmentIntensity = L.envIntensity;
    this.scene.environmentRotation.set(0, L.envRotation, 0);
    // Realm tables and stages are wider than the board: widen the shadow frustum to cover them.
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.far = 120;
    sc.updateProjectionMatrix();
    this.rig.preferredPolar = realm.seatPolar ?? 0.92;
    this.menuPolar = realm.menuPolar ?? Math.max(1.02, this.rig.preferredPolar + 0.04);
    this.rig.camera.far = realm.far;
    this.rig.camera.updateProjectionMatrix();
    this.post.applyRealm(L.bloom, L.grade);
  }

  /** Baseline lighting from the arena theme (used directly by the procedural arenas). */
  private applyThemeLighting() {
    const L = this.theme.light;
    this.sky.visible = true;
    this.scene.environmentIntensity = 1;
    this.scene.environmentRotation.set(0, 0, 0);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7.2;
    sc.right = sc.top = 7.2;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.rig.preferredPolar = 0.92;
    this.menuPolar = 1.02;
    this.rig.camera.far = 220;
    this.rig.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.fog = new THREE.FogExp2(L.fogColor, L.fogDensity);
    this.sun.color.setHex(L.sunColor);
    this.sun.intensity = L.sunIntensity;
    this.sun.position.set(...L.sunDir).normalize().multiplyScalar(22);
    this.rim.color.setHex(L.envKey);
    this.rim.intensity = L.sunIntensity * 0.25;
    this.rim.position.set(-L.sunDir[0], L.sunDir[1] * 0.6, -L.sunDir[2]).normalize().multiplyScalar(20);
    this.hemi.color.setHex(L.skyColor);
    this.hemi.groundColor.setHex(L.groundColor);
    this.hemi.intensity = L.hemiIntensity;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.uTop.value.setHex(L.envTop).multiplyScalar(0.8);
    u.uHorizon.value.setHex(L.fogColor);
    u.uBottom.value.setHex(L.fogColor).multiplyScalar(0.6);
    u.uSun.value.set(...L.sunDir).normalize();
    u.uSunColor.value.setHex(L.sunColor);

    this.envRT?.dispose();
    this.envRT = buildEnvironment(this.renderer, L);
    this.scene.environment = this.envRT.texture;
    this.post.applyTheme(L);
  }

  /** Procedural v1 scenery: build, cap its point lights, then merge everything static. */
  private buildLegacyArena(id: ArenaId) {
    this.arena.landmarkGroup.position.y = 0;
    this.arena.setupArena(id, this.scene);
    this.arena.landmarkGroup.position.y = SCENERY_DROP;
    this.limitArenaLights();
    const s = this.game.state;
    const stats = batchStatic(this.arena.landmarkGroup, dt => this.arena.update(dt, 'w', s.p1.name, s.p2.name, 1, false));
    if (import.meta.env.DEV) console.info(`[arena] ${id}: ${stats.meshesBefore} meshes -> ${stats.meshesAfter} (${stats.dynamic} animated)`);
    this.arena.setAmbientEffects(s.settings.ambientEffects, s.settings.ambientEffects ? 1 : 0);
  }

  private limitArenaLights() {
    const lights: THREE.Light[] = [];
    const collect = (o: THREE.Object3D) => {
      if ((o as THREE.PointLight).isPointLight || (o as THREE.SpotLight).isSpotLight) lights.push(o as THREE.Light);
    };
    this.arena.landmarkGroup.traverse(collect);
    this.arena.lightsGroup.traverse(collect);
    // The scenery's own directional/hemisphere lights would double the rig's lighting.
    const extra: THREE.Object3D[] = [];
    this.arena.lightsGroup.traverse(o => {
      if ((o as THREE.DirectionalLight).isDirectionalLight || (o as THREE.HemisphereLight).isHemisphereLight) extra.push(o);
    });
    extra.forEach(o => o.parent?.remove(o));
    lights.sort((a, b) => b.intensity - a.intensity);
    lights.slice(this.quality.maxPointLights).forEach(l => l.parent?.remove(l));
  }

  // ------------------------------------------------------------------ store reactions
  private onState(s: GameState) {
    const p = this.prevState;
    this.prevState = s;
    if (!p || p.arena !== s.arena) this.transitionArena(s.arena);
    if (!p || p.settings.graphicsQuality !== s.settings.graphicsQuality) this.applyQuality(s.settings.graphicsQuality);
    if (!p || p.settings.showCoordinates !== s.settings.showCoordinates) this.board.setCoordinatesVisible(s.settings.showCoordinates);
    if (p && (p.settings.ambientEffects !== s.settings.ambientEffects || p.settings.reducedMotion !== s.settings.reducedMotion)) {
      this.arena.setAmbientEffects(s.settings.ambientEffects, s.settings.ambientEffects ? 1 : 0);
      this.effects.setAmbient(this.theme.light.ambientParticles, s.settings.ambientEffects && !s.settings.reducedMotion, this.quality.particles);
    }
    if (
      p &&
      (p.settings.pieceSet !== s.settings.pieceSet || p.p1.material !== s.p1.material || p.p2.material !== s.p2.material || p.p1.color !== s.p1.color)
    ) {
      if (this.configurePieces() && !this.moveInFlight) {
        this.pieces.sync(this.game.engine.state.board, { rebuild: true });
        this.shadowDirty = 2;
      }
    }
    this.rig.sensitivity = s.settings.cameraSensitivity;
    this.rig.idleSway = !s.settings.reducedMotion;

    // Camera intent
    if (!p || p.screen !== s.screen || p.cameraPreset !== s.cameraPreset || p.turn !== s.turn || p.replay.active !== s.replay.active || p.p1.color !== s.p1.color) {
      this.updateCameraIntent(s, p);
    }
    this.updateHighlights(s);
    this.updateTension(s);
    if (p && p.selected !== s.selected) this.pieces.setLift(s.selected, s.selected !== null ? 0.1 : 0);
    if (s.screen !== 'playing' && this.hover !== null) this.hover = null;
  }

  private transitionArena(id: ArenaId) {
    if (id === this.builtArena) return;
    // Quick dip to black hides the rebuild hitch.
    this.post.fade = 1;
    window.setTimeout(() => {
      if (this.disposed) return;
      void this.setArena(id).finally(() => {
        // Only reveal once the latest requested arena is in place.
        if (this.builtArena === id) this.post.fade = 0;
      });
    }, 220);
  }

  private viewerSide(s: GameState): 'w' | 'b' {
    if (s.mode === 'pass_and_play') return s.settings.autoRotateCamera ? s.turn : 'w';
    return s.p1.color;
  }

  private updateCameraIntent(s: GameState, p: GameState | null) {
    if (this.rig.inCinematic) return;
    if (s.screen === 'menu' || s.screen === 'loading') {
      this.rig.orbit(s.settings.reducedMotion ? 0 : 0.045, this.menuPolar, 1.12, 0);
      return;
    }
    if (s.screen === 'gameover' && !s.replay.active) {
      this.rig.orbit(s.settings.reducedMotion ? 0 : 0.09, 0.98, 1.08, 0.2);
      return;
    }
    const side = this.viewerSide(s);
    switch (s.cameraPreset) {
      case 'white':
        return this.rig.seat('w');
      case 'black':
        return this.rig.seat('b');
      case 'side':
        return this.rig.sideView();
      case 'top':
        return this.rig.topView(side);
      default:
        // Turn changes only re-seat in pass-and-play; elsewhere the camera stays with the local player.
        if (!p || p.screen !== 'playing' || p.cameraPreset !== 'auto' || s.mode === 'pass_and_play' || p.p1.color !== s.p1.color || p.replay.active !== s.replay.active) {
          this.rig.seat(side);
        }
    }
  }

  private updateHighlights(s: GameState) {
    const playing = s.screen === 'playing' || s.screen === 'gameover';
    this.board.setHighlights({
      lastMove: playing ? s.lastMove : null,
      selected: s.screen === 'playing' ? s.selected : null,
      targets: s.screen === 'playing' && s.settings.showLegalMoves ? s.targets : [],
      hover: s.screen === 'playing' ? this.hover : null,
      cursor: s.screen === 'playing' ? s.cursor : null,
      check: playing ? s.checkSquare : -1,
      hint: s.hint,
      highVisibility: s.settings.highVisibilityHints,
    });
  }

  private updateTension(s: GameState) {
    let t = 0;
    if (s.screen === 'playing' && !s.result && !s.replay.active) {
      const localTurn = this.game.isLocalColor(s.turn);
      if (s.checkSquare >= 0) t = localTurn ? 0.75 : 0.35;
      if (s.settings.clockMode !== 'none' && localTurn) {
        const left = s.turn === 'w' ? s.whiteTime : s.blackTime;
        if (left < TIMING.lowClockSeconds && s.sanHistory.length > 0) t = Math.max(t, 0.45 + (1 - left / TIMING.lowClockSeconds) * 0.45);
      }
    }
    this.post.tension = s.settings.reducedMotion ? t * 0.5 : t;
    soundEngine.setTension(t);
  }

  // ------------------------------------------------------------------ controller events
  private bindEvents() {
    const on = <K extends keyof ViewEvents>(k: K, h: (p: ViewEvents[K]) => void | Promise<void>) => this.unsubs.push(this.game.on(k, h));

    on('sync', async ({ intro }) => {
      this.animator.finishAll();
      this.animator.endSkip();
      this.effects.clear();
      if (this.configurePieces()) {
        await this.pieces.sync(this.game.engine.state.board, { rebuild: true });
      }
      const s = this.game.state;
      if (intro && !s.settings.reducedMotion) {
        this.rig.introFrom(this.viewerSide(s));
        this.shadowDirty = 60;
        await this.pieces.sync(this.game.engine.state.board, { intro: true, reducedMotion: s.settings.reducedMotion });
      } else {
        await this.pieces.sync(this.game.engine.state.board, {});
      }
      this.shadowDirty = 3;
    });

    // Moves (and their capture cinematics) play strictly one at a time, in arrival order.
    on('move', payload => {
      const run = this.moveChain.then(() => this.playMove(payload));
      this.moveChain = run.catch(err => console.error('[move] animation failed', err));
      return this.moveChain;
    });

    on('gameOver', ({ winner }) => {
      const s = this.game.state;
      if (s.settings.reducedMotion) return;
      if (winner) {
        const accent = new THREE.Color(this.theme.accent).getHex();
        this.effects.fireworks([accent, 0xffffff, 0xffd166, 0x7cc4ff], 7);
      }
    });

    on('skip', () => {
      this.animator.finishAll();
      this.slowmo = 0;
      this.animator.timeScale = 1;
      if (this.rig.inCinematic) this.rig.release(6);
    });

    on('screenshot', () => {
      this.renderFrame(0);
      try {
        const url = this.renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `chess-realms-${this.builtArena}-${Date.now()}.png`;
        a.click();
        this.game.toast('Screenshot saved', 'success');
      } catch {
        this.game.toast('Screenshot is not available on this device.', 'warning');
      }
    });
  }

  /**
   * Frame a capture. Four shots are used in strict rotation so consecutive captures never look the same:
   *  0 over-the-shoulder of the attacker · 1 low-angle hero shot on the attacker (tracks it)
   *  2 side tracking shot · 3 slow orbit around the impact square.
   */
  private async openShot(move: ViewEvents['move']['move'], victimSq: number) {
    const shot = (this.shotIndex++ % 4) as CinematicEvent['shot'];
    const attacker = this.pieces.get(move.from);
    const from = squareCenter(move.from);
    const to = squareCenter(victimSq);
    const attackDir = to.clone().sub(from).setY(0);
    if (attackDir.lengthSq() < 1e-6) attackDir.set(0, 0, -1);
    attackDir.normalize();
    const side = new THREE.Vector3(-attackDir.z, 0, attackDir.x);
    // Pick the side of the move that faces the player's seat so shots never start from behind a wall of pieces.
    if (side.dot(this.rig.camera.position.clone().setY(0)) < 0) side.negate();
    const track = () => attacker?.mesh.position ?? to;
    this.cinematicLog.push({ attacker: move.piece, victim: move.captured!, from: move.from, to: move.to, shot });

    switch (shot) {
      case 0:
        this.rig.focus(to, attackDir.clone().negate().addScaledVector(side, 0.6).normalize(), 3.4, 1.05);
        break;
      case 1:
        this.rig.focus(from, attackDir.clone().addScaledVector(side, 0.35).normalize(), 3.0, 1.36, { track, lift: 0.55, lambda: 3.8 });
        break;
      case 2:
        this.rig.focus(from, side, 4.3, 1.16, { track, lift: 0.4, lambda: 4.2 });
        break;
      case 3:
        this.rig.focus(to, side.clone().addScaledVector(attackDir, -0.4).normalize(), 3.8, 1.0, { orbitSpeed: 0.55 });
        break;
    }
    await this.animator.wait(0.4);
  }

  private async playMove({ move, isCheck, isMate, cinematic }: ViewEvents['move']) {
    const s = this.game.state;
    const reduced = s.settings.reducedMotion;
    this.moveInFlight = true;
    this.hover = null;
    const material = (this.pieces.get(move.from)?.material ?? s.p1.material) as string;
    const victimSq = move.isEnPassant ? (move.piece.color === 'w' ? move.to - 8 : move.to + 8) : move.to;
    const victimMat = move.captured ? this.pieces.materialAt(victimSq) : null;
    const victimColor = new THREE.Color(0xdddddd);
    if (victimMat && 'color' in victimMat) victimColor.copy((victimMat as THREE.MeshStandardMaterial).color);

    try {
      if (cinematic && !reduced && move.captured) await this.openShot(move, victimSq);

      await this.pieces.animateMove(
        move,
        {
          onImpact: info => {
            const away = new THREE.Vector3().subVectors(info.impactPoint, squareCenter(move.from)).setY(0).normalize();
            this.effects.impact(info.impactPoint, victimColor, away, new THREE.Color(this.theme.accent).getHex());
            soundEngine.playCaptureSound(move.to % 8, material);
            this.arena.onCombatImpact();
            this.realm?.onImpact?.(info.impactPoint);
            if (!reduced) {
              this.rig.shake(cinematic ? 0.55 : 0.32);
              this.rig.kickFov(cinematic ? -3.5 : -1.5);
              if (cinematic) this.slowmo = 0.55;
            }
          },
          onLand: info => {
            this.effects.landing(squareCenter(info.move.to), info.move.piece.type === 'n' ? 1.2 : 0.8);
            if (isMate) soundEngine.playCheckmateSound();
            else if (isCheck) soundEngine.playCheckSound(move.to % 8);
            else if (!move.captured) soundEngine.playMoveSound(move.to % 8, material);
            if (isCheck || isMate) {
              const kingSq = this.game.state.checkSquare;
              if (kingSq >= 0) this.effects.checkPulse(squareCenter(kingSq));
              if (!reduced) this.rig.shake(isMate ? 0.5 : 0.15);
            }
            if (move.isCastling) soundEngine.playMoveSound((move.to % 8) ^ 1, material);
          },
          onPromote: obj => {
            this.effects.sparkle(obj.mesh.position, new THREE.Color(this.theme.accent).getHex(), 60, 1.2);
            soundEngine.playGameStart();
          },
        },
        { reducedMotion: reduced, slowImpact: cinematic }
      );
      if (cinematic && !reduced && !this.animator.isSkipping) await this.animator.wait(0.35);
    } finally {
      if (this.rig.inCinematic) this.rig.release();
      this.animator.endSkip();
      this.slowmo = 0;
      this.moveInFlight = false;
      this.shadowDirty = 2;
      // Materials may have changed mid-move (rare); re-sync quietly.
      if (this.configurePieces()) this.pieces.sync(this.game.engine.state.board, { rebuild: true });
      else this.pieces.sync(this.game.engine.state.board);
    }
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const el = this.renderer.domElement;
    const opts = { passive: false } as AddEventListenerOptions;
    const down = (e: PointerEvent) => this.onPointerDown(e);
    const move = (e: PointerEvent) => this.onPointerMove(e);
    const up = (e: PointerEvent) => this.onPointerUp(e);
    const leave = () => {
      if (this.hover !== null) {
        this.hover = null;
        this.updateHighlights(this.game.state);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.rig.zoomBy(Math.exp(e.deltaY * 0.0012));
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down, opts);
    el.addEventListener('pointermove', move, opts);
    el.addEventListener('pointerup', up, opts);
    el.addEventListener('pointercancel', up, opts);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, opts);
    el.addEventListener('contextmenu', ctx);
    this.unsubs.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
    });
  }

  private setRay(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
  }

  /** Square under the pointer: tall pieces win over the board square behind them. */
  private pickSquare(x: number, y: number): number | null {
    this.setRay(x, y);
    const viaPiece = this.pieces.pick(this.raycaster.ray);
    if (viaPiece !== null) return viaPiece;
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return squareFromPoint(hit.x, hit.z);
  }

  private onPointerDown(e: PointerEvent) {
    e.preventDefault();
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.game.hideCursor();
    const ps: PointerState = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, mode: 'none', sq: null, moved: false, wasSelected: false };
    this.pointers.set(e.pointerId, ps);
    if (this.pointers.size === 2) {
      // Second finger: switch to pinch/orbit, cancel any piece drag.
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      for (const p of this.pointers.values()) {
        if (p.mode === 'piece' && p.sq !== null) void this.pieces.cancelDrag(p.sq);
        p.mode = 'orbit';
      }
      return;
    }
    const s = this.game.state;
    if (s.screen !== 'playing') {
      ps.mode = 'orbit';
      return;
    }
    if (s.animating) {
      this.game.skipAnimation();
      ps.mode = 'orbit';
      return;
    }
    const sq = this.pickSquare(e.clientX, e.clientY);
    ps.sq = sq;
    ps.wasSelected = sq !== null && s.selected === sq;
    if (sq !== null && this.game.beginDrag(sq)) {
      ps.mode = 'piece';
    } else {
      ps.mode = sq !== null && s.selected !== null && s.targets.some(t => t.sq === sq) ? 'none' : 'orbit';
    }
  }

  private onPointerMove(e: PointerEvent) {
    const ps = this.pointers.get(e.pointerId);
    if (!ps) {
      this.updateHover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - ps.x;
    const dy = e.clientY - ps.y;
    ps.x = e.clientX;
    ps.y = e.clientY;
    if (!ps.moved && Math.hypot(e.clientX - ps.startX, e.clientY - ps.startY) > 6) {
      ps.moved = true;
      if (ps.mode === 'piece' && ps.sq !== null) {
        this.pieces.beginDrag(ps.sq);
        soundEngine.playClickSound();
      }
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.rig.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
      this.rig.rotateBy(dx * 0.5, dy * 0.5, this.height);
      return;
    }
    if (ps.mode === 'orbit' && ps.moved) {
      this.rig.rotateBy(dx, dy, this.height);
    } else if (ps.mode === 'piece' && ps.moved && ps.sq !== null) {
      this.setRay(e.clientX, e.clientY);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
        hit.x = THREE.MathUtils.clamp(hit.x, -4.3, 4.3);
        hit.z = THREE.MathUtils.clamp(hit.z, -4.3, 4.3);
        this.dragTarget = hit;
        this.dragSq = ps.sq;
        const over = squareFromPoint(hit.x, hit.z);
        if (over !== this.hover) {
          this.hover = over;
          this.updateHighlights(this.game.state);
        }
      }
    }
  }

  private dragTarget: THREE.Vector3 | null = null;
  private dragSq: number | null = null;

  private onPointerUp(e: PointerEvent) {
    const ps = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (!ps) return;
    const s = this.game.state;
    if (ps.mode === 'piece' && ps.sq !== null) {
      if (ps.moved) {
        const target = this.dragTarget ? squareFromPoint(this.dragTarget.x, this.dragTarget.z) : null;
        this.dragTarget = null;
        this.dragSq = null;
        const moved = this.game.dropOn(ps.sq, target);
        if (!moved) {
          void this.pieces.cancelDrag(ps.sq);
          if (target !== null && target !== ps.sq) soundEngine.playClickSound();
        }
      } else {
        // Plain tap: the press already selected it; a second tap deselects.
        if (ps.wasSelected) this.game.clearSelection();
      }
      return;
    }
    if (!ps.moved && s.screen === 'playing') {
      const sq = this.pickSquare(e.clientX, e.clientY);
      if (sq !== null) this.game.pressSquare(sq);
      else this.game.clearSelection();
    }
  }

  private updateHover(x: number, y: number) {
    const s = this.game.state;
    if (s.screen !== 'playing' || s.animating) return;
    const sq = this.pickSquare(x, y);
    let hover: number | null = null;
    let cursor = 'grab';
    if (sq !== null) {
      const piece = this.game.engine.getPiece(sq);
      const ownTurn = piece && piece.color === s.turn && this.game.isLocalColor(s.turn) && !this.game.isAITurn();
      const target = s.targets.some(t => t.sq === sq);
      if (ownTurn || target) {
        hover = sq;
        cursor = 'pointer';
      }
    }
    this.renderer.domElement.style.cursor = cursor;
    if (hover !== this.hover) {
      this.hover = hover;
      this.pieces.setLift(s.selected ?? hover, s.selected !== null ? 0.1 : hover !== null ? 0.05 : 0);
      this.updateHighlights(s);
    }
  }

  // ------------------------------------------------------------------ loop
  private start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number) {
    // Slow motion around cinematic impacts, eased back to normal speed.
    if (this.slowmo > 0) this.slowmo -= dt;
    const targetScale = this.slowmo > 0 ? 0.3 : 1;
    this.animator.timeScale += (targetScale - this.animator.timeScale) * Math.min(1, dt * 10);
    const gdt = dt * this.animator.timeScale;

    this.animator.update(dt);
    if (this.dragSq !== null && this.dragTarget) this.pieces.dragTo(this.dragSq, this.dragTarget, dt);
    this.pieces.update(dt, performance.now() / 1000);
    this.board.update(dt);
    this.effects.update(gdt);
    const s = this.game.state;
    if (this.realm) this.realm.update(gdt, performance.now() / 1000);
    else this.arena.update(gdt, s.turn, s.p1.name, s.p2.name, s.sanHistory.length + 1, s.cameraPreset === 'top');
    this.rig.update(dt);

    if (this.animator.busy || this.dragSq !== null) this.shadowDirty = Math.max(this.shadowDirty, 1);
    this.renderFrame(dt);
    this.adaptResolution(dt);
  }

  private renderFrame(dt: number) {
    if (this.shadowDirty > 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty--;
    }
    this.sky.position.copy(this.rig.camera.position);
    this.post.render(dt);
  }

  /** Drop resolution when frames are slow, raise it again when there is headroom. */
  private adaptResolution(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    this.adaptCooldown -= this.frameTimes.reduce((a, b) => a + b, 0);
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (this.adaptCooldown > 0) return;
    const max = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    let next = this.pixelRatio;
    if (avg > 1 / 45) next = Math.max(this.quality.minPixelRatio, this.pixelRatio - 0.15);
    else if (avg < 1 / 58 && this.pixelRatio < max) next = Math.min(max, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(this.width, this.height, false);
      this.post.setSize(this.width, this.height);
      this.effects.setViewportHeight(this.height, next);
      this.adaptCooldown = 2;
      // Resizing clears the canvas; redraw now so the browser never shows a blank (black) frame.
      this.renderFrame(0);
    }
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.rig.resize(w / h, h);
    this.effects.setViewportHeight(h, this.pixelRatio);
    this.updateCameraIntent(this.game.state, null);
    // Same as above: redraw straight away so rotating a phone or resizing a window never flashes black.
    if (this.running && !this.disposed) this.renderFrame(0);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.unsubs.forEach(u => u());
    this.pieces.clear();
    this.board.dispose();
    this.effects.dispose();
    this.post.dispose();
    this.envRT?.dispose();
    this.realm?.dispose();
    this.boardScope?.dispose();
    this.pmrem?.dispose();
    soundEngine.stopAmbient();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
