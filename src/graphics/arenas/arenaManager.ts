import * as THREE from 'three';
import { ArenaId } from '../../audio/soundEngine.ts';
import { buildGothicCathedralSanctum, CathedralSanctumScene } from './cathedralSanctum.ts';

const STAGE_CYAN = new THREE.Color(0x00f0ff);
const STAGE_MAGENTA = new THREE.Color(0xf43f5e);

/** Dispose geometries, materials and textures of every mesh/points/line under root. */
export function disposeDeep(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    (Array.isArray(mat) ? mat : [mat]).forEach(x => {
      for (const v of Object.values(x)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      x.dispose();
    });
  });
}

export class ArenaManager {
  public landmarkGroup: THREE.Group;
  public lightsGroup: THREE.Group;
  private saturnGroup: THREE.Group | null = null;
  private jupiterMesh: THREE.Mesh | null = null;
  private asteroidBeltGroup: THREE.Group | null = null;
  private starfieldPoints: THREE.Points | null = null;

  // Esports Championship Arena reactive state
  private innerRingMat: THREE.MeshBasicMaterial | null = null;
  private outerRingMat: THREE.MeshBasicMaterial | null = null;
  private jumbotronCanvas: HTMLCanvasElement | null = null;
  private jumbotronCtx: CanvasRenderingContext2D | null = null;
  private jumbotronTex: THREE.CanvasTexture | null = null;
  private crowdPoints: THREE.Points | null = null;
  private crowdMat: THREE.PointsMaterial | null = null;
  private crowdPhases: Float32Array | null = null;
  private crowdBaseColors: Float32Array | null = null;
  private crowdTime: number = 0;
  private spectatorFlare: number = 0;
  private turnColorProgress: number = 0;
  private jumbotronTime: number = 0;

  // Medieval Warrior Chamber reactive lighting
  private medievalFireLight: THREE.PointLight | null = null;
  private medievalTorchLights: THREE.PointLight[] = [];

  // Shadow Dungeon Living God Statue
  public livingGodHead: THREE.Group | null = null;
  public godEyePulseTimer: number = 0;

  private sceneRef: THREE.Scene | null = null;

  // Ambient Effects Configuration
  public ambientEffectsEnabled: boolean = true;
  public ambientEffectsIntensity: number = 1.0;
  private currentArenaId: ArenaId = 'chess_arena';
  private currentBaseFogDensity: number = 0.025;
  private ambientEffectsTime: number = 0;

  // Metropolis Sweeping Searchlights
  private metropolisSearchlights: {
    group: THREE.Group;
    drum: THREE.Mesh;
    beam: THREE.Mesh;
    baseAngle: number;
    speed: number;
    sweepRange: number;
    tiltBase: number;
  }[] = [];

  // Shadow Dungeon Braziers
  private shadowDungeonBraziers: {
    light: THREE.PointLight;
    flame: THREE.Mesh;
    baseIntensity: number;
  }[] = [];

  // Gothic Cathedral Sanctum
  private cathedralSanctumScene: CathedralSanctumScene | null = null;
  private ceilingObjects: THREE.Object3D[] = [];
  private lastTopDown = false;
  private jumbotronAccum = 1;

  constructor() {
    this.landmarkGroup = new THREE.Group();
    this.landmarkGroup.name = 'ArenaLandmarks';
    this.lightsGroup = new THREE.Group();
    this.lightsGroup.name = 'ArenaLights';
  }

  public setAmbientEffects(enabled: boolean = true, intensity: number = 1.0) {
    this.ambientEffectsEnabled = enabled;
    this.ambientEffectsIntensity = intensity;
  }

  /** Remove and dispose all scenery (used when a photo/realm environment takes over). */
  public clear() {
    disposeDeep(this.landmarkGroup);
    disposeDeep(this.lightsGroup);
    this.landmarkGroup.clear();
    this.lightsGroup.clear();
    this.ceilingObjects = [];
    this.cathedralSanctumScene = null;
    this.metropolisSearchlights = [];
    this.shadowDungeonBraziers = [];
    this.livingGodHead = null;
    this.medievalFireLight = null;
    this.medievalTorchLights = [];
    this.jumbotronTex = null;
    this.jumbotronCtx = null;
    this.crowdPoints = null;
    this.innerRingMat = null;
    this.outerRingMat = null;
  }

  public setupArena(arena: ArenaId, scene: THREE.Scene) {
    this.saturnGroup = null;
    this.jupiterMesh = null;
    this.asteroidBeltGroup = null;
    this.starfieldPoints = null;

    this.innerRingMat = null;
    this.outerRingMat = null;
    this.jumbotronCanvas = null;
    this.jumbotronCtx = null;
    this.jumbotronTex = null;
    this.crowdPoints = null;
    this.crowdMat = null;
    this.crowdPhases = null;
    this.crowdBaseColors = null;
    this.crowdTime = 0;
    this.spectatorFlare = 0;
    this.turnColorProgress = 0;
    this.medievalFireLight = null;
    this.medievalTorchLights = [];
    this.cathedralSanctumScene = null;

    // Deep-dispose everything from the previous arena (v1 leaked nested geometry, materials and textures).
    disposeDeep(this.landmarkGroup);
    disposeDeep(this.lightsGroup);
    this.landmarkGroup.clear();
    this.lightsGroup.clear();

    this.currentArenaId = arena;
    this.currentBaseFogDensity = 0;
    this.metropolisSearchlights = [];
    this.shadowDungeonBraziers = [];
    this.sceneRef = scene;
    this.ceilingObjects = [];
    this.jumbotronAccum = 1;

    // Background, fog, sun and fill lights are owned by the renderer's lighting rig (per-arena themes).
    // This class only builds the surroundings and animates them.
    this.buildSurroundings(arena);

    this.landmarkGroup.traverse(o => {
      if (o.userData?.isCeilingObstacle) this.ceilingObjects.push(o);
      // Point/spot light shadows cost 6 extra scene renders each; arenas never need them.
      if ((o as THREE.Light).isLight) (o as THREE.Light).castShadow = false;
    });
    this.lightsGroup.traverse(o => {
      if ((o as THREE.Light).isLight) (o as THREE.Light).castShadow = false;
    });
  }

  private buildSurroundings(arena: ArenaId) {
    switch (arena) {
      case 'chess_arena':
        this.buildChessArena();
        break;
      case 'traditional':
        this.buildTraditionalStudy();
        break;
      case 'japan':
        this.buildJapanSanctuary();
        break;
      case 'india':
        this.buildIndiaRealm();
        break;
      case 'usa':
        this.buildUsaMetropolis();
        break;
      case 'egypt':
        this.buildEgyptGiza();
        break;
      case 'royal_kingdom':
        this.buildRoyalKingdom();
        break;
      case 'shadow_dungeon':
        this.buildShadowDungeon();
        break;
    }
  }

  // 1. ESPORTS CHESS ARENA (AAA TOURNAMENT STAGE OVERHAUL)
  private buildChessArena() {
    // Canvas texture for carbon stage floor
    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = 512;
    stageCanvas.height = 512;
    const sCtx = stageCanvas.getContext('2d')!;

    // Fill dark titanium background
    sCtx.fillStyle = '#090d16';
    sCtx.fillRect(0, 0, 512, 512);

    // Subtle carbon fiber grid
    sCtx.strokeStyle = '#1e293b';
    sCtx.lineWidth = 1;
    for (let i = 0; i < 512; i += 16) {
      sCtx.beginPath();
      sCtx.moveTo(i, 0);
      sCtx.lineTo(i, 512);
      sCtx.stroke();
      sCtx.beginPath();
      sCtx.moveTo(0, i);
      sCtx.lineTo(512, i);
      sCtx.stroke();
    }

    // Hexagonal circuit lines
    sCtx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    sCtx.lineWidth = 2;
    const center = 256;
    for (let r = 60; r <= 220; r += 50) {
      sCtx.beginPath();
      for (let a = 0; a < 6; a++) {
        const angle = (a * Math.PI) / 3;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        if (a === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      sCtx.closePath();
      sCtx.stroke();
    }

    // Glowing center emblem ring
    sCtx.strokeStyle = '#00f0ff';
    sCtx.lineWidth = 3;
    sCtx.beginPath();
    sCtx.arc(center, center, 120, 0, Math.PI * 2);
    sCtx.stroke();

    sCtx.strokeStyle = '#f43f5e';
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    sCtx.arc(center, center, 110, 0, Math.PI * 2);
    sCtx.stroke();

    const stageTex = new THREE.CanvasTexture(stageCanvas);
    stageTex.colorSpace = THREE.SRGBColorSpace;

    // 1. High-Tech Multi-Tiered Digital Carbon Stage Platform (Podium with Recessed LED Trenches)
    // Outer Elevated Titanium Deck (Tier 0 Base Podium)
    const baseStepGeom = new THREE.CylinderGeometry(16.2, 17.2, 0.35, 6);
    const baseStepMat = new THREE.MeshStandardMaterial({
      color: 0x070a12,
      roughness: 0.85,
      metalness: 0.1,
    });
    const baseStep = new THREE.Mesh(baseStepGeom, baseStepMat);
    baseStep.position.y = -0.65;
    baseStep.receiveShadow = true;
    this.landmarkGroup.add(baseStep);

    // Outer Titanium Beveled Edge Trim
    const baseTrimGeom = new THREE.TorusGeometry(16.2, 0.12, 16, 6);
    baseTrimGeom.rotateX(Math.PI / 2);
    const baseTrimMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.1, roughness: 0.85 });
    const baseTrim = new THREE.Mesh(baseTrimGeom, baseTrimMat);
    baseTrim.position.y = -0.48;
    this.landmarkGroup.add(baseTrim);

    // Recessed Glowing Underglow Strip LED Trenches
    const TrenchOuterGeom = new THREE.TorusGeometry(15.2, 0.14, 16, 64);
    TrenchOuterGeom.rotateX(Math.PI / 2);
    this.outerRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const outerRing = new THREE.Mesh(TrenchOuterGeom, this.outerRingMat);
    outerRing.position.y = -0.46;
    this.landmarkGroup.add(outerRing);

    // Upper Main Stage Floor Podium (Tier 1) - Positioned at y = -0.42 strictly beneath the board
    const floorGeom = new THREE.CylinderGeometry(14.0, 14.8, 0.30, 6);
    const floorMat = new THREE.MeshStandardMaterial({
      map: stageTex,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.y = -0.42;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Upper Podium Beveled Edge Trim
    const floorTrimGeom = new THREE.TorusGeometry(14.0, 0.10, 16, 6);
    floorTrimGeom.rotateX(Math.PI / 2);
    const floorTrim = new THREE.Mesh(floorTrimGeom, baseTrimMat);
    floorTrim.position.y = -0.27;
    this.landmarkGroup.add(floorTrim);

    // Recessed Inner LED Ring Underglow Strip
    const TrenchInnerGeom = new THREE.TorusGeometry(12.8, 0.10, 16, 64);
    TrenchInnerGeom.rotateX(Math.PI / 2);
    this.innerRingMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const innerRing = new THREE.Mesh(TrenchInnerGeom, this.innerRingMat);
    innerRing.position.y = -0.26;
    this.landmarkGroup.add(innerRing);

    // 2. 4 Massive Steel Space-Frame Truss Towers & High-Intensity Overhead Light Banks
    const cornerPositions: [number, number][] = [
      [9.5, 9.5],
      [-9.5, 9.5],
      [9.5, -9.5],
      [-9.5, -9.5],
    ];

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.95, roughness: 0.15 });

    cornerPositions.forEach(([x, z], idx) => {
      const tower = new THREE.Group();
      tower.position.set(x, 0, z);

      // Heavy Base Mounting Plate
      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), plateMat);
      basePlate.position.set(0, 0.06, 0);
      tower.add(basePlate);

      // 4-post scaffolding lattice
      const offsets: [number, number][] = [
        [0.48, 0.48],
        [-0.48, 0.48],
        [0.48, -0.48],
        [-0.48, -0.48],
      ];

      offsets.forEach(([ox, oz]) => {
        const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 9.8, 8);
        const post = new THREE.Mesh(postGeom, trussMat);
        post.position.set(ox, 4.9, oz);
        tower.add(post);
      });

      // Horizontal cross struts & diagonal X-bracing beams
      for (let h = 1.2; h <= 9.2; h += 1.6) {
        const mX = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.05), trussMat);
        mX.position.set(0, h, 0.48);
        tower.add(mX);

        const mX2 = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.05, 0.05), trussMat);
        mX2.position.set(0, h, -0.48);
        tower.add(mX2);

        const mZ = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.96), trussMat);
        mZ.position.set(0.48, h, 0);
        tower.add(mZ);

        const mZ2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.96), trussMat);
        mZ2.position.set(-0.48, h, 0);
        tower.add(mZ2);
      }

      // Top Steel Mounting Cap Plate
      const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.3), plateMat);
      topPlate.position.set(0, 9.8, 0);
      tower.add(topPlate);

      // High-Intensity Overhead Stadium Light Bank Box
      const spotColor = idx % 2 === 0 ? 0x00f0ff : 0xf43f5e;

      const lightBankGeom = new THREE.BoxGeometry(1.2, 0.4, 0.8);
      const lightBank = new THREE.Mesh(lightBankGeom, plateMat);
      lightBank.position.set(0, 9.8, 0);

      // 4 Glowing Spotlight Bulb Lenses in Light Bank
      const lensGeom = new THREE.CircleGeometry(0.18, 16);
      const lensMat = new THREE.MeshBasicMaterial({ color: spotColor });
      for (let lx = -0.35; lx <= 0.35; lx += 0.7) {
        for (let lz = -0.2; lz <= 0.2; lz += 0.4) {
          const lens = new THREE.Mesh(lensGeom, lensMat);
          lens.position.set(lx, -0.21, lz);
          lens.rotation.x = Math.PI / 2;
          lightBank.add(lens);
        }
      }

      lightBank.lookAt(0, 0.2, 0);
      tower.add(lightBank);

      // Physical 3D Volumetric Light Cone Shaft
      const beamTargetPos = new THREE.Vector3(0, 0.2, 0);
      const spotPos = new THREE.Vector3(x, 9.8, z);
      const beamLength = spotPos.distanceTo(beamTargetPos);

      const beamGeom = new THREE.ConeGeometry(2.8, beamLength, 32, 1, true);
      beamGeom.translate(0, -beamLength / 2, 0);
      beamGeom.rotateX(-Math.PI / 2);

      const beamMat = new THREE.MeshBasicMaterial({
        color: spotColor,
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const beamMesh = new THREE.Mesh(beamGeom, beamMat);
      beamMesh.position.set(0, 9.8, 0);
      beamMesh.lookAt(0, 0.2, 0);
      tower.add(beamMesh);

      this.landmarkGroup.add(tower);
    });

    // 3. Suspended Curved Digital Jumbotron Display Banners
    this.jumbotronCanvas = document.createElement('canvas');
    this.jumbotronCanvas.width = 512;
    this.jumbotronCanvas.height = 128;
    this.jumbotronCtx = this.jumbotronCanvas.getContext('2d')!;

    this.jumbotronTex = new THREE.CanvasTexture(this.jumbotronCanvas);
    this.jumbotronTex.colorSpace = THREE.SRGBColorSpace;
    this.jumbotronTex.wrapS = THREE.RepeatWrapping;
    this.jumbotronTex.repeat.x = -1;
    this.updateJumbotron('White', 'Black', 'w', 1);

    // Hanging North & South Jumbotrons (Positioned at y = 4.8, z = -12 and z = 12)
    const jumbotronGeom = new THREE.CylinderGeometry(12, 12, 2.2, 32, 1, true, Math.PI * 0.32, Math.PI * 0.36);
    const jumbotronMat = new THREE.MeshStandardMaterial({
      map: this.jumbotronTex,
      emissiveMap: this.jumbotronTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    const jumbotronNorth = new THREE.Mesh(jumbotronGeom, jumbotronMat);
    jumbotronNorth.position.set(0, 4.8, -12);
    this.landmarkGroup.add(jumbotronNorth);

    const jumbotronSouth = new THREE.Mesh(jumbotronGeom, jumbotronMat);
    jumbotronSouth.position.set(0, 4.8, 12);
    jumbotronSouth.rotation.y = Math.PI;
    this.landmarkGroup.add(jumbotronSouth);

    // 4. Full 3D Stadium Grandstand Bowl with Physical Riser Steps & Metal Guardrails
    const bleacherMat = new THREE.MeshStandardMaterial({
      color: 0x090d18,
      roughness: 0.75,
      metalness: 0.45,
      side: THREE.DoubleSide,
    });

    const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
    const bleacherRimsMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // 4 Physical Stepped Concentric Bleacher Rings with Guardrails
    const tiers = [
      { rInner: 17.5, rOuter: 20.0, height: 1.2, posY: 0.2 },
      { rInner: 20.0, rOuter: 22.8, height: 2.2, posY: 0.7 },
      { rInner: 22.8, rOuter: 25.8, height: 3.4, posY: 1.3 },
      { rInner: 25.8, rOuter: 29.0, height: 4.8, posY: 2.0 },
    ];

    tiers.forEach((t) => {
      // Step riser base cylinder
      const stepGeom = new THREE.CylinderGeometry(t.rOuter, t.rOuter + 0.3, t.height, 48, 1, true);
      const stepMesh = new THREE.Mesh(stepGeom, bleacherMat);
      stepMesh.position.y = t.posY;
      this.landmarkGroup.add(stepMesh);

      // Tread top seating ring
      const treadGeom = new THREE.RingGeometry(t.rInner, t.rOuter, 48);
      treadGeom.rotateX(-Math.PI / 2);
      const treadMesh = new THREE.Mesh(treadGeom, bleacherMat);
      treadMesh.position.y = t.posY + t.height / 2;
      this.landmarkGroup.add(treadMesh);

      // Neon LED rim strip along front step edge
      const rimGeom = new THREE.TorusGeometry(t.rInner, 0.08, 12, 64);
      rimGeom.rotateX(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeom, bleacherRimsMat);
      rimMesh.position.y = t.posY + t.height / 2 + 0.02;
      this.landmarkGroup.add(rimMesh);

      // Tubular Metal Guardrail along front edge
      const railGeom = new THREE.TorusGeometry(t.rInner + 0.15, 0.04, 12, 64);
      railGeom.rotateX(Math.PI / 2);
      const railMesh = new THREE.Mesh(railGeom, railMat);
      railMesh.position.y = t.posY + t.height / 2 + 0.38;
      this.landmarkGroup.add(railMesh);

      // Vertical Guardrail Posts
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 8), railMat);
        postMesh.position.set(
          Math.cos(a) * (t.rInner + 0.15),
          t.posY + t.height / 2 + 0.19,
          Math.sin(a) * (t.rInner + 0.15)
        );
        this.landmarkGroup.add(postMesh);
      }
    });

    // Outer Back Wall Stadium Enclosure
    const outerWallGeom = new THREE.CylinderGeometry(29.3, 29.3, 7.5, 48, 1, true);
    const outerWallMesh = new THREE.Mesh(outerWallGeom, bleacherMat);
    outerWallMesh.position.y = 3.5;
    this.landmarkGroup.add(outerWallMesh);

    // 850+ Spectator Points of Light with Procedural Breathing Twinkle Animations
    const totalPoints = 850;
    const positions = new Float32Array(totalPoints * 3);
    const colors = new Float32Array(totalPoints * 3);
    this.crowdPhases = new Float32Array(totalPoints);
    this.crowdBaseColors = new Float32Array(totalPoints * 3);

    const palette = [
      new THREE.Color(0x00f0ff),
      new THREE.Color(0x3b82f6),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0xd946ef),
      new THREE.Color(0x38bdf8),
    ];

    for (let i = 0; i < totalPoints; i++) {
      const angle = Math.random() * Math.PI * 2;
      const tierIndex = Math.floor(Math.random() * tiers.length);
      const t = tiers[tierIndex];

      const radius = t.rInner + 0.3 + Math.random() * (t.rOuter - t.rInner - 0.5);
      const height = t.posY + t.height / 2 + 0.25 + Math.random() * 0.4;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const col = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      this.crowdBaseColors[i * 3] = col.r;
      this.crowdBaseColors[i * 3 + 1] = col.g;
      this.crowdBaseColors[i * 3 + 2] = col.b;

      this.crowdPhases[i] = Math.random() * Math.PI * 2;
    }

    const crowdGeom = new THREE.BufferGeometry();
    crowdGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    crowdGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.crowdMat = new THREE.PointsMaterial({
      size: 0.30,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    this.crowdPoints = new THREE.Points(crowdGeom, this.crowdMat);
    this.crowdPoints.name = 'esportsCrowd';
    this.landmarkGroup.add(this.crowdPoints);

    // 5. ARCHITECTURAL INDOOR CHAMPIONSHIP STADIUM (ROOF TRUSSES, CEILING DOME & EXPANSIVE GROUND)
    // Expansive Sub-Level Ground Foundation (Radius: 32)
    const arenaGroundGeom = new THREE.CylinderGeometry(32, 33, 0.6, 64);
    const arenaGroundMat = new THREE.MeshStandardMaterial({
      color: 0x050811,
      roughness: 0.85,
      metalness: 0.1,
    });
    const arenaGround = new THREE.Mesh(arenaGroundGeom, arenaGroundMat);
    arenaGround.position.y = -0.75;
    arenaGround.receiveShadow = true;
    this.landmarkGroup.add(arenaGround);

    // Architectural Overhead Steel Space-Frame Cross-Trusses
    const trussMat2 = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.25 });
    
    // Central apex ring
    const apexRingGeom = new THREE.TorusGeometry(3.5, 0.15, 16, 32);
    apexRingGeom.rotateX(Math.PI / 2);
    const apexRing = new THREE.Mesh(apexRingGeom, trussMat2);
    apexRing.position.y = 15.5;
    this.landmarkGroup.add(apexRing);

    // Diagonal Arched Roof Girders connecting towers to apex ring
    cornerPositions.forEach(([x, z]) => {
      const start = new THREE.Vector3(x, 9.8, z);
      const end = new THREE.Vector3(0, 15.5, 0);
      const dist = start.distanceTo(end);
      const beamGeom = new THREE.CylinderGeometry(0.08, 0.08, dist, 8);
      const beam = new THREE.Mesh(beamGeom, trussMat2);
      beam.position.copy(start.clone().lerp(end, 0.5));
      beam.lookAt(end);
      beam.rotateX(Math.PI / 2);
      this.landmarkGroup.add(beam);
    });

    // High Stadium Ceiling Canopy Dome
    const canopyGeom = new THREE.SphereGeometry(32, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x070c18,
      roughness: 0.8,
      metalness: 0.3,
      side: THREE.BackSide,
    });
    const canopy = new THREE.Mesh(canopyGeom, canopyMat);
    canopy.position.y = 4.0;
    this.landmarkGroup.add(canopy);

    // Central Overhead Stadium Floodlight Bank Ring
    const floodlightRingGeom = new THREE.TorusGeometry(3.6, 0.08, 12, 32);
    floodlightRingGeom.rotateX(Math.PI / 2);
    const floodlightRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const floodlightRing = new THREE.Mesh(floodlightRingGeom, floodlightRingMat);
    floodlightRing.position.y = 15.4;
    this.landmarkGroup.add(floodlightRing);

    // Overhead Center Downlight
    const centerSpot = new THREE.PointLight(0x00f0ff, 1.2, 25);
    centerSpot.position.set(0, 15.0, 0);
    this.landmarkGroup.add(centerSpot);
  }

  // Trigger spectator flare cheer explosion on captures/checks/combat impacts
  public onCombatImpact() {
    this.spectatorFlare = 1.0;
    this.triggerGodStatuePulse();
  }

  public triggerGodStatuePulse() {
    this.godEyePulseTimer = 1.2;
  }

  // Live digital jumbotron canvas texture renderer
  public updateJumbotron(p1Name: string = 'White', p2Name: string = 'Black', turn: 'w' | 'b' = 'w', moveCount: number = 1) {
    if (!this.jumbotronCtx || !this.jumbotronTex) return;
    const jCtx = this.jumbotronCtx;

    jCtx.fillStyle = '#050a14';
    jCtx.fillRect(0, 0, 512, 128);

    // Glowing cyan background grid
    jCtx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
    jCtx.lineWidth = 1;
    for (let x = 0; x < 512; x += 32) {
      jCtx.beginPath();
      jCtx.moveTo(x, 0);
      jCtx.lineTo(x, 128);
      jCtx.stroke();
    }

    // Title banner
    jCtx.fillStyle = '#00f0ff';
    jCtx.font = 'bold 22px sans-serif';
    jCtx.textAlign = 'center';
    jCtx.fillText('CHESS WORLD CHAMPIONSHIP', 256, 36);

    // Live player names
    jCtx.fillStyle = '#f8fafc';
    jCtx.font = 'bold 15px sans-serif';
    const activeP1 = turn === 'w' ? `▶ ${p1Name.toUpperCase()} (W)` : `${p1Name} (W)`;
    const activeP2 = turn === 'b' ? `▶ ${p2Name.toUpperCase()} (B)` : `${p2Name} (B)`;
    jCtx.fillText(`${activeP1}   VS   ${activeP2}`, 256, 64);

    // Real-time Move Count & Turn Status
    const turnColor = turn === 'w' ? '#00f0ff' : '#f43f5e';
    jCtx.fillStyle = turnColor;
    jCtx.font = 'bold 14px sans-serif';
    const turnName = turn === 'w' ? p1Name.toUpperCase() : p2Name.toUpperCase();
    jCtx.fillText(`MOVE #${moveCount}  •  ${turnName}'S TURN`, 256, 88);

    // Dynamic Equalizer Spectrum Graphic
    this.jumbotronTime += 0.05;
    jCtx.fillStyle = turn === 'w' ? '#00f0ff' : '#f43f5e';
    for (let b = 0; b < 24; b++) {
      const h = Math.sin(b * 0.7 + this.jumbotronTime * 4) * 12 + 16;
      jCtx.fillRect(40 + b * 18, 122 - h, 12, h);
    }

    this.jumbotronTex.needsUpdate = true;
  }

  // Animation frame update tick for cosmic motion & esports arena state
  public update(
    dt: number,
    turn: "w" | "b" = "w",
    p1Name: string = "White",
    p2Name: string = "Black",
    moveCount: number = 1,
    topDown = false
  ) {
    // Hide ceilings while looking straight down (list cached at build time; v1 traversed the scene every frame).
    if (topDown !== this.lastTopDown) {
      this.lastTopDown = topDown;
      for (const o of this.ceilingObjects) o.visible = !topDown;
    }

    if (this.saturnGroup) {
      this.saturnGroup.rotation.y += dt * 0.03;
    }
    if (this.jupiterMesh) {
      this.jupiterMesh.rotation.y += dt * 0.02;
    }
    if (this.asteroidBeltGroup) {
      this.asteroidBeltGroup.rotation.y += dt * 0.025;
      this.asteroidBeltGroup.children.forEach(child => {
        if (child.userData.spinX) child.rotation.x += dt * child.userData.spinX;
        if (child.userData.spinY) child.rotation.y += dt * child.userData.spinY;
      });
    }
    if (this.starfieldPoints) {
      this.starfieldPoints.rotation.y += dt * 0.008;
    }

    // --- ESPORTS CHAMPIONSHIP ARENA DYNAMIC REACTIVE UPDATES ---

    // Procedural Breathing Spectator Crowd Twinkle Animation
    this.crowdTime += dt;
    if (this.crowdPoints && this.crowdPhases && this.crowdBaseColors) {
      const colorAttr = this.crowdPoints.geometry.attributes.color as THREE.BufferAttribute;
      if (colorAttr) {
        const colors = colorAttr.array as Float32Array;
        const flareMult = 1.0 + this.spectatorFlare * 1.5;
        for (let i = 0; i < this.crowdPhases.length; i++) {
          const phase = this.crowdPhases[i];
          const pulse = 0.72 + 0.38 * Math.sin(this.crowdTime * 2.2 + phase);
          const r = this.crowdBaseColors[i * 3];
          const g = this.crowdBaseColors[i * 3 + 1];
          const b = this.crowdBaseColors[i * 3 + 2];
          colors[i * 3] = Math.min(1.0, r * pulse * flareMult);
          colors[i * 3 + 1] = Math.min(1.0, g * pulse * flareMult);
          colors[i * 3 + 2] = Math.min(1.0, b * pulse * flareMult);
        }
        colorAttr.needsUpdate = true;
      }
    }

    // 1. Reactive Spectator Flare Decay on Impact (0.8s smooth pulse decay)
    if (this.spectatorFlare > 0) {
      this.spectatorFlare = Math.max(0, this.spectatorFlare - dt / 0.8);
      const flareBoost = 1.0 + this.spectatorFlare * 1.8;

      if (this.crowdMat) {
        this.crowdMat.size = 0.30 * Math.min(1.8, flareBoost);
        this.crowdMat.opacity = Math.min(1.0, 0.85 + this.spectatorFlare * 0.15);
      }

      if (this.outerRingMat) {
        this.outerRingMat.color.setHSL(0.52, 1.0, 0.5 + this.spectatorFlare * 0.4);
      }
    } else {
      if (this.crowdMat && this.crowdMat.size !== 0.30) {
        this.crowdMat.size = 0.30;
        this.crowdMat.opacity = 0.85;
      }
      if (this.outerRingMat) {
        this.outerRingMat.color.setHex(0x00f0ff);
      }
    }

    // 2. Turn-Reactive Stage Underglow Transition
    // Smoothly transition inner ring color between electric cyan (#00f0ff when White) and electric magenta (#f43f5e when Black)
    const targetProgress = turn === 'w' ? 0 : 1;
    this.turnColorProgress += (targetProgress - this.turnColorProgress) * Math.min(1, dt * 5.0);

    if (this.innerRingMat) {
      this.innerRingMat.color.copy(STAGE_CYAN).lerp(STAGE_MAGENTA, this.turnColorProgress);
    }

    // 3. Dynamic Jumbotron Displays
    if (this.jumbotronTex) {
      this.jumbotronAccum += dt;
      if (this.jumbotronAccum >= 1 / 12) {
        this.jumbotronAccum = 0;
        this.updateJumbotron(p1Name, p2Name, turn, moveCount);
      }
    }

    // --- AMBIENT EFFECTS INTENSITY GOVERNANCE ---
    const effectiveIntensity = this.ambientEffectsEnabled ? this.ambientEffectsIntensity : 0.0;
    // Accumulate phase with effective speed so adjustments are smooth and avoid abrupt rotation snaps
    this.ambientEffectsTime += dt * effectiveIntensity;


    // 4. Medieval Warrior Chamber Dynamic Fireplace & Torch Ember Flicker
    if (this.medievalFireLight) {
      const ft = performance.now() * 0.007;
      const flicker = (Math.sin(ft * 5.1) * 0.35 + Math.cos(ft * 11.3) * 0.2) * Math.max(0.1, effectiveIntensity);
      this.medievalFireLight.intensity = effectiveIntensity > 0.01 ? (3.6 * Math.max(0.4, effectiveIntensity) + flicker) : 0.6;
    }
    if (this.medievalTorchLights.length > 0) {
      const tt = performance.now() * 0.009;
      this.medievalTorchLights.forEach((light, i) => {
        const flicker = (Math.sin(tt * 4.7 + i * 2.1) * 0.22 + Math.cos(tt * 8.3 + i) * 0.12) * Math.max(0.1, effectiveIntensity);
        light.intensity = effectiveIntensity > 0.01 ? (1.3 * Math.max(0.3, effectiveIntensity) + flicker) : 0.2;
      });
    }

    // 5. Shadow Dungeon Living God Statue tracking & eye pulse
    if (this.livingGodHead) {
      // Subtly rotate head to watch whichever half of the board is currently moving
      const targetAngle = (turn === 'w' ? 0.08 : -0.08) + Math.sin(this.crowdTime * 0.9) * 0.03;
      this.livingGodHead.rotation.y = THREE.MathUtils.lerp(this.livingGodHead.rotation.y, targetAngle, dt * 2.5);

      const ud = this.livingGodHead.userData;
      if (this.godEyePulseTimer > 0) {
        this.godEyePulseTimer = Math.max(0, this.godEyePulseTimer - dt);
        const progress = this.godEyePulseTimer / 1.2;
        if (ud.eyeLight) ud.eyeLight.intensity = (2.5 + progress * 6.5) * Math.max(0.2, effectiveIntensity);
        if (ud.pupilMat) ud.pupilMat.color.setHex(progress > 0.4 ? 0xff1744 : 0xf59e0b);
      } else {
        if (ud.eyeLight) ud.eyeLight.intensity = 2.5 * Math.max(0.2, effectiveIntensity);
        if (ud.pupilMat) ud.pupilMat.color.setHex(0xf59e0b);
      }
    }

    // 6. Shadow Dungeon Blue Cauldron Braziers Flicker
    if (this.shadowDungeonBraziers.length > 0) {
      const bt = performance.now() * 0.008;
      this.shadowDungeonBraziers.forEach((br, i) => {
        const flicker = (Math.sin(bt * 4.3 + i * 1.7) * 0.35 + Math.cos(bt * 7.9 + i) * 0.2) * Math.max(0.1, effectiveIntensity);
        br.light.intensity = effectiveIntensity > 0.01 ? (br.baseIntensity * effectiveIntensity + flicker) : 0.1;
        const flameScale = effectiveIntensity > 0.01 ? (0.6 + 0.4 * effectiveIntensity) + flicker * 0.25 : 0.35;
        br.flame.scale.set(flameScale, flameScale, flameScale);
      });
    }

    // 7. Metropolis Sweeping Volumetric Searchlights
    if (this.metropolisSearchlights.length > 0) {
      this.metropolisSearchlights.forEach((sl, idx) => {
        // Searchlight sweep speed directly multiplies by ambient effects intensity smoothly
        const currentAngle = sl.baseAngle + Math.sin(this.ambientEffectsTime * sl.speed + idx * 1.5) * sl.sweepRange;
        sl.group.rotation.y = currentAngle;
        sl.group.rotation.x = sl.tiltBase + Math.cos(this.ambientEffectsTime * sl.speed * 0.7 + idx) * 0.12;

        // Beam opacity scales with intensity or hides when off
        sl.beam.visible = effectiveIntensity > 0.01;
        if (sl.beam.material instanceof THREE.Material && 'opacity' in sl.beam.material) {
          (sl.beam.material as THREE.MeshBasicMaterial).opacity = Math.min(0.24, 0.12 * effectiveIntensity);
        }
      });
    }

    // 8. Gothic Cathedral Sanctum Animated Fire Braziers & Embers
    if (this.cathedralSanctumScene) {
      this.cathedralSanctumScene.update(dt, performance.now() * 0.001);
    }
  }

  // 2. GOTHIC CATHEDRAL SANCTUM (Wizard Chess 3D: Sanctum Edition)
  private buildTraditionalStudy() {
    this.cathedralSanctumScene = buildGothicCathedralSanctum();
    this.landmarkGroup.add(this.cathedralSanctumScene.landmarkGroup);
    this.lightsGroup.add(this.cathedralSanctumScene.lightsGroup);
    return;
  }

  private buildJapanSanctuary() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 17, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x1c1a1f, roughness: 0.7 })
    );
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Large glowing dusk sun sphere low on the horizon behind Torii gate
    const sunGeom = new THREE.SphereGeometry(4.5, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdcb0 });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(0, 3.2, -18.5);
    this.landmarkGroup.add(sun);

    const sunLight = new THREE.PointLight(0xffa86b, 3.0, 30);
    sunLight.position.set(0, 4.0, -17);
    this.landmarkGroup.add(sunLight);

    // Vermilion Torii Gate
    const torii = new THREE.Group();
    torii.position.set(0, 0, -9.5);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xca2e2e, roughness: 0.4 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.5 });

    const pilL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 16), pillarMat);
    pilL.position.set(-3.2, 3.5, 0);
    const pilR = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 16), pillarMat);
    pilR.position.set(3.2, 3.5, 0);
    torii.add(pilL, pilR);

    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.6, 0.8), pillarMat);
    kasagi.position.set(0, 6.8, 0);
    torii.add(kasagi);

    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.3, 0.9), topMat);
    shimaki.position.set(0, 7.2, 0);
    torii.add(shimaki);

    const nuki = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.4, 0.6), pillarMat);
    nuki.position.set(0, 5.6, 0);
    torii.add(nuki);

    this.landmarkGroup.add(torii);

    // 6 Sculpted 3D Sakura Cherry Blossom Trees
    const treeCoords: [number, number, number][] = [
      [-9.5, 0, -6.5],
      [9.5, 0, -6.5],
      [-11, 0, 2.5],
      [11, 0, 2.5],
      [-7.5, 0, 9.5],
      [7.5, 0, 9.5],
    ];

    treeCoords.forEach(([tx, ty, tz]) => {
      const tree = new THREE.Group();
      tree.position.set(tx, ty, tz);

      // Dark timber trunk
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d1810, roughness: 0.8 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 4.5, 10), trunkMat);
      trunk.position.y = 2.25;
      tree.add(trunk);

      // Branches
      const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.2, 8), trunkMat);
      branch1.position.set(0.4, 3.8, 0.2);
      branch1.rotation.z = -0.5;
      tree.add(branch1);

      // Pink low-poly blossom canopy clusters
      const blossomColors = [0xffb7c5, 0xf472b6, 0xfbcfe8];
      for (let c = 0; c < 6; c++) {
        const cRadius = 1.1 + Math.random() * 0.4;
        const cGeom = new THREE.IcosahedronGeometry(cRadius, 1);
        const cMat = new THREE.MeshStandardMaterial({
          color: blossomColors[c % blossomColors.length],
          roughness: 0.6,
        });
        const cluster = new THREE.Mesh(cGeom, cMat);
        const angle = (c * Math.PI * 2) / 6;
        cluster.position.set(
          Math.cos(angle) * 1.1,
          4.8 + (c % 3) * 0.6,
          Math.sin(angle) * 1.1
        );
        tree.add(cluster);
      }

      this.landmarkGroup.add(tree);
    });

    // Curved Red Wooden Taiko-bashi Bridge (East flank)
    const bridge = new THREE.Group();
    bridge.position.set(10.5, 0, -1.5);
    bridge.rotation.y = -Math.PI / 2;

    const archMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4 });
    const archGeom = new THREE.TorusGeometry(3.5, 0.22, 12, 24, Math.PI * 0.6);
    const arch = new THREE.Mesh(archGeom, archMat);
    arch.position.y = 0.5;
    bridge.add(arch);

    this.landmarkGroup.add(bridge);

    // Stone Toro Lanterns
    [-6.5, 6.5].forEach(x => {
      const lantern = new THREE.Group();
      lantern.position.set(x, 0, 4.5);

      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 6), stoneMat);
      base.position.y = 0.25;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 6), stoneMat);
      post.position.y = 1.1;

      const firebox = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.7, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      firebox.position.y = 1.95;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 6), stoneMat);
      roof.position.y = 2.55;

      lantern.add(base, post, firebox, roof);

      const lLight = new THREE.PointLight(0xf59e0b, 1.8, 7);
      lLight.position.set(0, 1.95, 0);
      lantern.add(lLight);

      this.landmarkGroup.add(lantern);
    });

    // Distant mountain silhouette ring
    const mountainGeom = new THREE.CylinderGeometry(35, 38, 12, 32, 1, true);
    const mountainMat = new THREE.MeshBasicMaterial({ color: 0x1e122a, side: THREE.BackSide });
    const mountains = new THREE.Mesh(mountainGeom, mountainMat);
    mountains.position.y = 4.0;
    this.landmarkGroup.add(mountains);
  }

  // 4. INDIA REALM
  private buildIndiaRealm() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 17, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x6e2916, roughness: 0.6 })
    );
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Glowing Golden-Hour Sun Disc
    const sunGeom = new THREE.SphereGeometry(5.0, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(0, 4.5, -20);
    this.landmarkGroup.add(sun);

    // Taj Mahal (North backdrop)
    const taj = new THREE.Group();
    taj.position.set(0, 0, -12);

    const ivoryMat = new THREE.MeshStandardMaterial({ color: 0xfefce8, roughness: 0.35 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.8, 4.8), ivoryMat);
    plinth.position.y = 1.9;
    taj.add(plinth);

    const domeGeom = new THREE.SphereGeometry(1.95, 20, 16);
    domeGeom.scale(1, 1.35, 1);
    const dome = new THREE.Mesh(domeGeom, ivoryMat);
    dome.position.set(0, 5.5, 0);
    taj.add(dome);

    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9 })
    );
    finial.position.set(0, 7.6, 0);
    taj.add(finial);

    [-4.8, 4.8].forEach(mx => {
      const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 8.0, 12), ivoryMat);
      minaret.position.set(mx, 4.0, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), ivoryMat);
      cap.position.set(mx, 8.2, 0);
      taj.add(minaret, cap);
    });
    this.landmarkGroup.add(taj);

    // Reflecting Pool in front of Taj Mahal
    const poolGeom = new THREE.BoxGeometry(4.2, 0.1, 6.0);
    const poolMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.9 });
    const pool = new THREE.Mesh(poolGeom, poolMat);
    pool.position.set(0, -0.15, -7.5);
    this.landmarkGroup.add(pool);

    // India Gate (East monument arch)
    const gate = new THREE.Group();
    gate.position.set(11, 0, -2);
    gate.rotation.y = -Math.PI / 2;
    const sandStoneMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });

    const pierL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.6), sandStoneMat);
    pierL.position.set(-1.8, 3, 0);
    const pierR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6, 1.6), sandStoneMat);
    pierR.position.set(1.8, 3, 0);
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 1.8), sandStoneMat);
    archTop.position.set(0, 6.8, 0);
    gate.add(pierL, pierR, archTop);
    this.landmarkGroup.add(gate);

    // Qutub Minar (West fluted minaret)
    const qutub = new THREE.Group();
    qutub.position.set(-11, 0, -2);
    for (let s = 0; s < 5; s++) {
      const rBot = 1.3 - s * 0.18;
      const rTop = 1.15 - s * 0.18;
      const story = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, 2.2, 16),
        new THREE.MeshStandardMaterial({ color: s % 2 === 0 ? 0xb45309 : 0x92400e, roughness: 0.7 })
      );
      story.position.y = 1.1 + s * 2.2;
      qutub.add(story);
    }
    this.landmarkGroup.add(qutub);
  }

  // 5. USA METROPOLIS NIGHT (Capitol + 45 Skyscrapers + Liberty + Golden Gate + Rooftop String Lights)
  private buildUsaMetropolis() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 19, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x050a14, roughness: 0.15, metalness: 0.85 })
    );
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Rooftop Terrace Parapet Wall
    const parapetGeom = new THREE.CylinderGeometry(13.8, 14.0, 0.8, 32, 1, true);
    const parapetMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const parapet = new THREE.Mesh(parapetGeom, parapetMat);
    parapet.position.y = 0.2;
    this.landmarkGroup.add(parapet);

    // Rooftop String Lights (Post connected lights)
    for (let s = 0; s < 12; s++) {
      const angle = (s * Math.PI * 2) / 12;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      bulb.position.set(Math.cos(angle) * 13.8, 0.75, Math.sin(angle) * 13.8);
      this.landmarkGroup.add(bulb);
    }

    // Wooden Rooftop Water Tower
    const waterTower = new THREE.Group();
    waterTower.position.set(9.5, 0, 8.5);

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 })
    );
    tank.position.y = 3.2;

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
    );
    roof.position.y = 4.7;

    const stilts = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.1, 2.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 })
    );
    stilts.position.y = 1.1;

    waterTower.add(tank, roof, stilts);
    this.landmarkGroup.add(waterTower);

    // Grand Neoclassical Capitol Building (North side)
    const capitol = new THREE.Group();
    capitol.position.set(0, 0, -11.5);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });

    // Portico & colonnade
    const portico = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.5, 2.5), whiteMat);
    portico.position.y = 1.25;

    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 2.0, 16), whiteMat);
    domeBase.position.y = 3.5;

    const capitolDome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 14), whiteMat);
    capitolDome.position.y = 5.2;

    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), whiteMat);
    cupola.position.y = 6.6;

    capitol.add(portico, domeBase, capitolDome, cupola);
    this.landmarkGroup.add(capitol);

    // Dense 360-degree skyline of 45+ skyscrapers
    const skylineMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
    const winColors = [0xfef08a, 0x38bdf8, 0xf43f5e];

    for (let k = 0; k < 45; k++) {
      const angle = (k * Math.PI * 2) / 45;
      const radius = 17 + Math.random() * 8;
      const h = 7 + Math.random() * 12;
      const w = 1.8 + Math.random() * 1.2;

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
      const bx = Math.cos(angle) * radius;
      const bz = Math.sin(angle) * radius;
      b.position.set(bx, h / 2 - 1, bz);
      this.landmarkGroup.add(b);

      // Lit window dots
      if (k % 2 === 0) {
        const winMat = new THREE.MeshBasicMaterial({ color: winColors[k % winColors.length] });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), winMat);
        win.position.set(bx * 0.95, h * 0.7, bz * 0.95);
        win.lookAt(0, h * 0.7, 0);
        this.landmarkGroup.add(win);
      }
    }

    // Statue of Liberty (West side)
    const liberty = new THREE.Group();
    liberty.position.set(-11.5, 0, 0);

    const copperMat = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.45 });
    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 4, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 })
    );
    pedestal.position.y = 2;
    liberty.add(pedestal);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 4.5, 12), copperMat);
    body.position.y = 6.25;
    liberty.add(body);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8), copperMat);
    arm.position.set(0.6, 9.2, 0);
    arm.rotation.z = -0.3;
    liberty.add(arm);

    const torch = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    torch.position.set(1.1, 10.5, 0);
    liberty.add(torch);

    const torchLight = new THREE.PointLight(0xf59e0b, 2.5, 10);
    torchLight.position.set(1.1, 10.5, 0);
    liberty.add(torchLight);

    this.landmarkGroup.add(liberty);

    // Golden Gate Bridge Tower (East side)
    const bridge = new THREE.Group();
    bridge.position.set(12.5, 0, 0);
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.4 });

    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.8), orangeMat);
    tL.position.set(0, 6, -1.8);
    const tR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.8), orangeMat);
    tR.position.set(0, 6, 1.8);
    for (let c = 3; c < 12; c += 3) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 3.6), orangeMat);
      strut.position.set(0, c, 0);
      bridge.add(strut);
    }
    bridge.add(tL, tR);
    this.landmarkGroup.add(bridge);

    // 4 Gotham Rooftop Volumetric Sweeping Searchlights
    const searchlightConfigs = [
      { pos: [-12.0, 11.0, -9.0], baseAngle: -Math.PI * 0.25, speed: 1.1, sweepRange: 0.65, tiltBase: 0.38 },
      { pos: [12.5, 12.0, -8.0], baseAngle: Math.PI * 0.25, speed: 0.9, sweepRange: 0.75, tiltBase: 0.42 },
      { pos: [0.0, 8.5, 13.5], baseAngle: Math.PI, speed: 1.25, sweepRange: 0.8, tiltBase: 0.35 },
      { pos: [-10.5, 10.5, 8.5], baseAngle: -Math.PI * 0.75, speed: 0.95, sweepRange: 0.6, tiltBase: 0.45 },
    ];

    const slMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const lensFaceMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });

    searchlightConfigs.forEach((cfg, idx) => {
      const slMount = new THREE.Group();
      slMount.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

      // Steel pedestal base
      const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.8, 12), slMetalMat);
      basePedestal.position.y = 0.4;
      slMount.add(basePedestal);

      // Yoke assembly fork
      const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.2), slMetalMat);
      yokeL.position.set(-0.48, 1.0, 0);
      const yokeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.2), slMetalMat);
      yokeR.position.set(0.48, 1.0, 0);
      slMount.add(yokeL, yokeR);

      // Rotating head group
      const slHead = new THREE.Group();
      slHead.position.set(0, 1.1, 0);

      // Projector cylindrical drum
      const drumGeom = new THREE.CylinderGeometry(0.46, 0.46, 0.9, 16);
      drumGeom.rotateX(Math.PI / 2);
      const drum = new THREE.Mesh(drumGeom, slMetalMat);
      slHead.add(drum);

      // Projector front glowing lens
      const lensGeom = new THREE.CircleGeometry(0.44, 16);
      const lens = new THREE.Mesh(lensGeom, lensFaceMat);
      lens.position.set(0, 0, 0.46);
      slHead.add(lens);

      // Volumetric Sweeping Beam Cone
      const beamLength = 45;
      const beamGeom = new THREE.ConeGeometry(4.2, beamLength, 24, 1, true);
      beamGeom.translate(0, beamLength / 2, 0);
      beamGeom.rotateX(Math.PI / 2);

      const beamMat = new THREE.MeshBasicMaterial({
        color: idx % 2 === 0 ? 0x93c5fd : 0x60a5fa,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const beam = new THREE.Mesh(beamGeom, beamMat);
      beam.position.set(0, 0, 0.46);
      beam.userData = { isSearchlightBeam: true };
      slHead.add(beam);

      slMount.add(slHead);
      this.landmarkGroup.add(slMount);

      this.metropolisSearchlights.push({
        group: slHead,
        drum,
        beam,
        baseAngle: cfg.baseAngle,
        speed: cfg.speed,
        sweepRange: cfg.sweepRange,
        tiltBase: cfg.tiltBase,
      });
    });
  }

  // 6. EGYPT GIZA (Sun Disc + Sand Dunes + Pyramids + Sphinx + Obelisks)
  private buildEgyptGiza() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 19, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.9 })
    );
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Blazing Desert Sun Disc
    const sunGeom = new THREE.SphereGeometry(4.8, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(0, 4.0, -19);
    this.landmarkGroup.add(sun);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 });

    // Great Pyramid of Khufu
    const pyr1 = new THREE.Mesh(new THREE.ConeGeometry(9.5, 9, 4), stoneMat);
    pyr1.rotation.y = Math.PI / 4;
    pyr1.position.set(-4, 4.5, -13);
    this.landmarkGroup.add(pyr1);

    // Pyramid of Khafre
    const pyr2 = new THREE.Mesh(new THREE.ConeGeometry(7.5, 7.5, 4), stoneMat);
    pyr2.rotation.y = Math.PI / 4;
    pyr2.position.set(6, 3.75, -15);
    this.landmarkGroup.add(pyr2);

    // Great Sphinx with nemes headdress
    const sphinx = new THREE.Group();
    sphinx.position.set(11, 0, 1);
    sphinx.rotation.y = -Math.PI / 2;

    const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.2, 3), stoneMat);
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 14), stoneMat);
    head.position.set(2.4, 2.8, 0);
    const headdress = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 4), stoneMat);
    headdress.position.set(2.4, 3.2, 0);
    sphinx.add(body, head, headdress);
    this.landmarkGroup.add(sphinx);

    // Glowing Hieroglyph Obelisks
    [-7.5, 7.5].forEach(x => {
      const obelisk = new THREE.Group();
      obelisk.position.set(x, 0, 5.5);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 6, 4), stoneMat);
      shaft.position.y = 3;
      shaft.rotation.y = Math.PI / 4;

      const pyramidion = new THREE.Mesh(
        new THREE.ConeGeometry(0.48, 0.9, 4),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.2 })
      );
      pyramidion.position.y = 6.45;
      pyramidion.rotation.y = Math.PI / 4;

      obelisk.add(shaft, pyramidion);
      this.landmarkGroup.add(obelisk);
    });
  }

  // 7. ROYAL KINGDOM (Ashlar stone walls, Gothic windows, Dais, Throne, Candelabras, Torch Sconces)
  private buildRoyalKingdom() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 17, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 })
    );
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.7 });

    // Medieval Ashlar Stone Block Wall Enclosure (Z = -24)
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(48, 18, 1), stoneMat);
    wallNorth.position.set(0, 8.5, -24);
    this.landmarkGroup.add(wallNorth);

    // 4 Grand Gothic Pillars supporting arched vaulting
    const pillarPositions: [number, number][] = [
      [-8, -7],
      [8, -7],
      [-8, 7],
      [8, 7],
    ];

    pillarPositions.forEach(([x, z]) => {
      const pillar = new THREE.Group();
      pillar.position.set(x, 0, z);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 10, 16), stoneMat);
      shaft.position.y = 5;
      pillar.add(shaft);

      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 4.5),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6, side: THREE.DoubleSide })
      );
      banner.position.set(0, 5.5, 0.9);
      pillar.add(banner);

      // Warm Torch Sconce casting flickering orange point light
      const torchLight = new THREE.PointLight(0xf97316, 2.2, 10);
      torchLight.position.set(0, 4.5, 1.1);
      pillar.add(torchLight);

      this.landmarkGroup.add(pillar);
    });

    // Raised Red-Carpeted Royal Dais with Gold-Trimmed Throne
    const dais = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.2, 3.5),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
    );
    dais.position.set(0, 0.6, -10);

    const throne = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.8, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.8, roughness: 0.2 })
    );
    throne.position.set(0, 2.5, -10);
    this.landmarkGroup.add(dais, throne);
  }

  // Procedural Cobblestone Brick Texture Generator for floor and walls
  private createCobblestoneTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a'; // dark slate-blue base
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5;
    const rows = 16;
    const cols = 8;
    const rh = 512 / rows;
    const cw = 512 / cols;

    for (let r = 0; r < rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * rh);
      ctx.lineTo(512, r * rh);
      ctx.stroke();

      const offset = (r % 2) * (cw / 2);
      for (let c = 0; c <= cols + 1; c++) {
        const x = c * cw + offset;
        ctx.beginPath();
        ctx.moveTo(x, r * rh);
        ctx.lineTo(x, (r + 1) * rh);
        ctx.stroke();
      }
    }

    // Weathered stone fissures & noise
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const fx = Math.random() * 512;
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx + (Math.random() - 0.5) * 40, 512);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 8. SHADOW DUNGEON (Abyss's Vault - Cartenon Temple Palace Court & Grinning God Statue)
  private buildShadowDungeon() {
    const cobblestoneTex = this.createCobblestoneTexture();

    const wallMat = new THREE.MeshStandardMaterial({
      map: cobblestoneTex,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.BackSide,
    });

    // 1. Enclosing Stone Colosseum Walls (360-degree cylinder)
    const colosseumWall = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 18, 14, 48, 1, true),
      wallMat
    );
    colosseumWall.position.y = 5.0;
    this.landmarkGroup.add(colosseumWall);

    // 2. Vaulted Palace Ceiling Dome (Ribbed Gothic Stone Dome Cap)
    const domeGeom = new THREE.SphereGeometry(18.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshStandardMaterial({
      map: cobblestoneTex,
      roughness: 0.9,
      side: THREE.BackSide,
    });
    const ceilingDome = new THREE.Mesh(domeGeom, domeMat);
    ceilingDome.position.y = 7.0;
    this.landmarkGroup.add(ceilingDome);

    // 12 Stone Pilasters along circular wall
    const pilasterMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    for (let p = 0; p < 12; p++) {
      const angle = (p * Math.PI * 2) / 12;
      const px = Math.cos(angle) * 17.6;
      const pz = Math.sin(angle) * 17.6;
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.7, 12, 0.4), pilasterMat);
      pilaster.position.set(px, 5.5, pz);
      pilaster.lookAt(0, 5.5, 0);
      this.landmarkGroup.add(pilaster);
    }

    // 3. Brick Platform Floor & Concentric Carved Stone Circles
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 18.5, 0.5, 48),
      new THREE.MeshStandardMaterial({
        map: cobblestoneTex,
        roughness: 0.75,
        metalness: 0.15,
      })
    );
    floor.position.y = -0.45;
    floor.receiveShadow = true;
    this.landmarkGroup.add(floor);

    // Concentric ceremonial ring grooves
    const ringRadii = [3.5, 6.5, 10.0];
    ringRadii.forEach(r => {
      const ringGeom = new THREE.RingGeometry(r, r + 0.16, 48);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.y = -0.19;
      this.landmarkGroup.add(ring);
    });

    // 4. The Colossal Grinning God Statue (The Architect) at [0, 0, -9.8]
    const statueGroup = new THREE.Group();
    statueGroup.position.set(0, 0, -9.8);

    const stoneGodMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.75,
      metalness: 0.2,
    });

    // Massive Gothic Stone Throne
    const throneSeat = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 4.2, 3.0),
      stoneGodMat
    );
    throneSeat.position.y = 2.1;
    statueGroup.add(throneSeat);

    const throneBack = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 9.5, 1.2),
      stoneGodMat
    );
    throneBack.position.set(0, 4.8, -1.5);
    statueGroup.add(throneBack);

    // Seated Titan Figure (height: 9.5)
    const titanBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 6.0, 2.4),
      stoneGodMat
    );
    titanBody.position.set(0, 4.5, 0);
    statueGroup.add(titanBody);

    // Sinister Grinning Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 8.2, 0);

    const headBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.2, 2.0),
      stoneGodMat
    );
    headGroup.add(headBase);

    // Spiked Thorned Crown
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x050811, metalness: 0.8, roughness: 0.3 });
    for (let sp = -2; sp <= 2; sp++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), crownMat);
      spike.position.set(sp * 0.35, 1.3, 0);
      headGroup.add(spike);
    }

    // Glowing Amber-Red Slit Pupils
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const leftPupil = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.2), pupilMat);
    leftPupil.position.set(-0.45, 0.2, 1.05);
    const rightPupil = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.2), pupilMat);
    rightPupil.position.set(0.45, 0.2, 1.05);
    headGroup.add(leftPupil, rightPupil);

    const eyeLight = new THREE.PointLight(0xf59e0b, 2.5, 6);
    eyeLight.position.set(0, 0.2, 1.2);
    headGroup.add(eyeLight);

    // Wide, Unnerving Smile with Sharp Stone Teeth
    const teethMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const mouthWidth = 1.3;
    const teethCount = 7;
    for (let t = 0; t < teethCount; t++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.1), teethMat);
      const tx = -mouthWidth / 2 + 0.1 + t * (mouthWidth / (teethCount - 1));
      tooth.position.set(tx, -0.65, 1.03);
      headGroup.add(tooth);
    }

    headGroup.userData = {
      isLivingGodHead: true,
      eyeLight,
      pupilMat,
    };
    this.livingGodHead = headGroup;

    statueGroup.add(headGroup);
    this.landmarkGroup.add(statueGroup);

    // 6. Ring of 10 Towering Stone Sentinel Statues around circular wall curve
    for (let st = 0; st < 10; st++) {
      const angle = (st * Math.PI * 2) / 10;
      const sRadius = 15.0;
      const sx = Math.cos(angle) * sRadius;
      const sz = Math.sin(angle) * sRadius;

      const sentinel = new THREE.Group();
      sentinel.position.set(sx, 0, sz);
      sentinel.lookAt(0, 0, 0);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.0, 0.8), stoneGodMat);
      body.position.y = 2.5;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.7, 0.65), stoneGodMat);
      head.position.y = 5.35;

      // Executioner axe / polearm held upright
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 6.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
      );
      pole.position.set(0.6, 3.2, 0);

      sentinel.add(body, head, pole);
      this.landmarkGroup.add(sentinel);
    }

    // 7. Stone Cauldron Braziers with Blue Soul Embers
    for (let b = 0; b < 6; b++) {
      const angle = (b * Math.PI * 2) / 6;
      const bRadius = 11.5;
      const bx = Math.cos(angle) * bRadius;
      const bz = Math.sin(angle) * bRadius;

      const brazier = new THREE.Group();
      brazier.position.set(bx, 0, bz);

      const cauldron = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.5, 1.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.4 })
      );
      cauldron.position.y = 0.6;

      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      flame.position.y = 1.35;

      const light = new THREE.PointLight(0x00f0ff, 1.5, 7);
      light.position.set(0, 1.4, 0);

      brazier.add(cauldron, flame, light);
      this.landmarkGroup.add(brazier);
      this.shadowDungeonBraziers.push({ light, flame, baseIntensity: 1.5 });
    }
  }
}
