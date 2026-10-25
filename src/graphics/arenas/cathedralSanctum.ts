import * as THREE from 'three';

/**
 * FULL 360° GOTHIC CATHEDRAL SANCTUM ARCHITECTURE & TWIN ANIMATED FIRE BRAZIERS
 * Wizard Chess 3D: Sanctum Edition
 *
 * Dimensions: width 36, length 44, height 22
 * - Ashlar sandstone courses & flagstone floor procedural canvas textures
 * - 8 Clustered Gothic Pier columns with engaged colonnettes and flared capitals
 * - Tall pointed-arch lancet clerestory windows with glowing sky-blue moonlit stained glass
 * - Far end (z = -21.8) circular Gothic Rose Window with radial tracery + arched wooden doors
 * - Twin burning medieval fire braziers (x = ±7.2, z = 0) with multi-cone volumetric flames,
 *   25 rising glowing ember sparks each, and flickering point lights.
 */

export interface BrazierInstance {
  group: THREE.Group;
  light: THREE.PointLight;
  flameCones: THREE.Mesh[];
  embers: {
    points: THREE.Points;
    velocities: Float32Array;
    initialY: number;
  };
}

export interface CathedralSanctumScene {
  landmarkGroup: THREE.Group;
  lightsGroup: THREE.Group;
  braziers: BrazierInstance[];
  update: (dt: number, time: number) => void;
}

// 1. Procedural Ashlar Sandstone Wall Texture Generator
export function createStoneWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base sandstone color
  ctx.fillStyle = '#2a262e';
  ctx.fillRect(0, 0, 512, 512);

  // Stone courses (ashlar masonry blocks)
  const rowHeight = 32;
  const blockWidth = 64;

  for (let y = 0; y < 512; y += rowHeight) {
    const rowOffset = (y / rowHeight) % 2 === 0 ? 0 : blockWidth / 2;
    for (let x = -blockWidth; x < 512 + blockWidth; x += blockWidth) {
      const bx = x + rowOffset;
      // Slight tone variation per block
      const tone = Math.floor(Math.random() * 25 - 12);
      const r = Math.min(255, Math.max(0, 42 + tone));
      const g = Math.min(255, Math.max(0, 38 + tone));
      const b = Math.min(255, Math.max(0, 48 + tone));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(bx + 1.5, y + 1.5, blockWidth - 3, rowHeight - 3);

      // Fine chiseled texture noise
      for (let n = 0; n < 30; n++) {
        const nx = bx + Math.random() * blockWidth;
        const ny = y + Math.random() * rowHeight;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(nx, ny, 2, 2);
      }
    }

    // Mortar joint line
    ctx.strokeStyle = '#141217';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 2. Procedural Flagstone Floor Texture Generator
export function createFlagstoneFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#16141a';
  ctx.fillRect(0, 0, 512, 512);

  // Irregular paving slabs
  const slabSize = 64;
  for (let y = 0; y < 512; y += slabSize) {
    const shift = (y / slabSize) % 2 === 0 ? 0 : 32;
    for (let x = -slabSize; x < 512 + slabSize; x += slabSize) {
      const sx = x + shift;
      const shade = Math.floor(Math.random() * 20 - 10);
      ctx.fillStyle = `rgb(${26 + shade}, ${24 + shade}, ${32 + shade})`;
      ctx.fillRect(sx + 2, y + 2, slabSize - 4, slabSize - 4);

      // Inner flagstone bevel/wear
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 2, y + 2, slabSize - 4, slabSize - 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 3. Stained Glass Rose Window Texture Generator
export function createRoseWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const center = 256;

  // Dark background
  ctx.fillStyle = '#050a18';
  ctx.fillRect(0, 0, 512, 512);

  // Concentric stained glass petals
  const petals = 16;
  for (let i = 0; i < petals; i++) {
    const a1 = (i * Math.PI * 2) / petals;
    const a2 = ((i + 1) * Math.PI * 2) / petals;

    // Outer ring: celestial sky-blue
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, 230, a1, a2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(56, 189, 248, 0.75)' : 'rgba(147, 51, 234, 0.65)';
    ctx.fill();

    // Inner ring: gold/amber
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, 140, a1, a2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(244, 63, 94, 0.75)';
    ctx.fill();

    // Center jewel core
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, 60, a1, a2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  }

  // Heavy stone tracery spoke lines
  ctx.strokeStyle = '#121118';
  ctx.lineWidth = 6;
  for (let i = 0; i < petals; i++) {
    const angle = (i * Math.PI * 2) / petals;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(angle) * 240, center + Math.sin(angle) * 240);
    ctx.stroke();
  }

  // Concentric stone rings
  [60, 140, 230].forEach(r => {
    ctx.beginPath();
    ctx.arc(center, center, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 4. Clustered Gothic Pier Column Generator
function createGothicPier(height: number): THREE.Group {
  const column = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x322d38,
    roughness: 0.75,
    metalness: 0.12,
  });

  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.25,
    metalness: 0.85,
  });

  // Octagonal molded plinth base
  const plinth = new THREE.CylinderGeometry(1.4, 1.6, 0.8, 8);
  const plinthMesh = new THREE.Mesh(plinth, stoneMat);
  plinthMesh.position.y = 0.4;
  plinthMesh.receiveShadow = true;
  column.add(plinthMesh);

  const plinthMolding = new THREE.CylinderGeometry(1.2, 1.4, 0.4, 8);
  const moldingMesh = new THREE.Mesh(plinthMolding, stoneMat);
  moldingMesh.position.y = 1.0;
  column.add(moldingMesh);

  // Central massive shaft
  const centerShaft = new THREE.CylinderGeometry(0.85, 0.85, height - 2.8, 16);
  const centerMesh = new THREE.Mesh(centerShaft, stoneMat);
  centerMesh.position.y = (height - 2.8) / 2 + 1.2;
  centerMesh.castShadow = true;
  centerMesh.receiveShadow = true;
  column.add(centerMesh);

  // 4 Engaged Colonnettes clustered around central shaft
  const colonnetteGeom = new THREE.CylinderGeometry(0.28, 0.28, height - 2.8, 12);
  const colRadius = 0.95;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI * 2) / 4;
    const colMesh = new THREE.Mesh(colonnetteGeom, stoneMat);
    colMesh.position.set(
      Math.cos(angle) * colRadius,
      (height - 2.8) / 2 + 1.2,
      Math.sin(angle) * colRadius
    );
    colMesh.castShadow = true;
    column.add(colMesh);

    // Gold collar ring mid-way up each colonnette
    const collar = new THREE.TorusGeometry(0.30, 0.03, 8, 16);
    collar.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collar, goldAccentMat);
    collarMesh.position.set(
      Math.cos(angle) * colRadius,
      height * 0.45,
      Math.sin(angle) * colRadius
    );
    column.add(collarMesh);
  }

  // Flared molded stone capital at the top
  const capitalBase = new THREE.CylinderGeometry(1.4, 1.0, 0.6, 8);
  const capMesh = new THREE.Mesh(capitalBase, stoneMat);
  capMesh.position.y = height - 1.3;
  column.add(capMesh);

  const capitalTop = new THREE.BoxGeometry(2.4, 0.5, 2.4);
  const capTopMesh = new THREE.Mesh(capitalTop, stoneMat);
  capTopMesh.position.y = height - 0.75;
  column.add(capTopMesh);

  return column;
}

// 5. Fire Brazier Generator
export function createFireBrazier(posX: number, posZ: number): BrazierInstance {
  const group = new THREE.Group();
  group.position.set(posX, 0, posZ);

  // Sandstone plinth: two-tier carved plinth
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x36303d,
    roughness: 0.8,
    metalness: 0.1,
  });

  const tier1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 2.2), plinthMat);
  tier1.position.y = 0.175;
  tier1.receiveShadow = true;
  group.add(tier1);

  const tier2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.7), plinthMat);
  tier2.position.y = 0.575;
  tier2.receiveShadow = true;
  group.add(tier2);

  // Wrought-iron bowl & 8 curved iron ribs
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1c1917,
    roughness: 0.6,
    metalness: 0.85,
  });

  const bowlGeom = new THREE.CylinderGeometry(1.0, 0.4, 0.5, 16, 1, true);
  const bowl = new THREE.Mesh(bowlGeom, ironMat);
  bowl.position.y = 1.05;
  group.add(bowl);

  const bowlRimGeom = new THREE.TorusGeometry(1.0, 0.06, 8, 24);
  bowlRimGeom.rotateX(Math.PI / 2);
  const bowlRim = new THREE.Mesh(bowlRimGeom, ironMat);
  bowlRim.position.y = 1.30;
  group.add(bowlRim);

  // 8 Vertical curved iron ribs
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const ribGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8);
    const rib = new THREE.Mesh(ribGeom, ironMat);
    rib.rotation.z = 0.25;
    rib.rotation.y = angle;
    rib.position.set(Math.cos(angle) * 0.75, 1.05, Math.sin(angle) * 0.75);
    group.add(rib);
  }

  // Glowing charcoal bed
  const coalsGeom = new THREE.CircleGeometry(0.85, 16);
  coalsGeom.rotateX(-Math.PI / 2);
  const coalsMat = new THREE.MeshBasicMaterial({
    color: 0xff3b00,
  });
  const coals = new THREE.Mesh(coalsGeom, coalsMat);
  coals.position.y = 1.15;
  group.add(coals);

  // Multi-layered volumetric flame cones (5 overlapping cones)
  const flameColors = [
    { color: 0xfef08a, scale: 0.45, height: 1.1, opacity: 0.95 }, // White-yellow core
    { color: 0xfde047, scale: 0.60, height: 1.3, opacity: 0.85 },
    { color: 0xf97316, scale: 0.75, height: 1.5, opacity: 0.75 }, // Bright orange
    { color: 0xe11d48, scale: 0.85, height: 1.7, opacity: 0.65 },
    { color: 0xdc2626, scale: 0.95, height: 1.9, opacity: 0.55 }, // Crimson tips
  ];

  const flameCones: THREE.Mesh[] = [];
  flameColors.forEach(cfg => {
    // Narrower, dimmer layers: the v1 cones were large enough to dominate the frame under bloom.
    const geom = new THREE.ConeGeometry(cfg.scale * 0.6, cfg.height * 0.85, 12, 1, true);
    geom.translate(0, (cfg.height * 0.85) / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity * 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(geom, mat);
    cone.position.y = 1.25;
    group.add(cone);
    flameCones.push(cone);
  });

  // 25 Rising glowing ember sparks per brazier
  const emberCount = 25;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberVelocities = new Float32Array(emberCount * 3);

  for (let i = 0; i < emberCount; i++) {
    const r = Math.random() * 0.6;
    const theta = Math.random() * Math.PI * 2;
    emberPositions[i * 3] = Math.cos(theta) * r;
    emberPositions[i * 3 + 1] = 1.3 + Math.random() * 1.5;
    emberPositions[i * 3 + 2] = Math.sin(theta) * r;

    emberVelocities[i * 3] = (Math.random() - 0.5) * 0.25;
    emberVelocities[i * 3 + 1] = 0.8 + Math.random() * 0.9;
    emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }

  const emberGeom = new THREE.BufferGeometry();
  emberGeom.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));

  const emberMat = new THREE.PointsMaterial({
    color: 0xfbbf24,
    size: 0.12,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const emberPoints = new THREE.Points(emberGeom, emberMat);
  group.add(emberPoints);

  // Dynamic flickering warm PointLight
  const light = new THREE.PointLight(0xff7b29, 5.0, 32);
  light.position.set(0, 2.2, 0);
  light.castShadow = false; // point-light shadows are 6 extra renders each
  light.shadow.bias = -0.002;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  group.add(light);

  return {
    group,
    light,
    flameCones,
    embers: {
      points: emberPoints,
      velocities: emberVelocities,
      initialY: 1.3,
    },
  };
}

/**
 * Builds the entire Gothic Cathedral Sanctum Hall
 */
export function buildGothicCathedralSanctum(): CathedralSanctumScene {
  const landmarkGroup = new THREE.Group();
  landmarkGroup.name = 'GothicCathedralSanctum';

  const lightsGroup = new THREE.Group();
  lightsGroup.name = 'SanctumLights';

  const braziers: BrazierInstance[] = [];

  // Dimensions
  const hallWidth = 36;
  const hallLength = 44;
  const hallHeight = 22;

  // 1. Textures & Materials
  const stoneWallTex = createStoneWallTexture();
  const flagstoneFloorTex = createFlagstoneFloorTexture();
  const roseTex = createRoseWindowTexture();

  const wallMat = new THREE.MeshStandardMaterial({
    map: stoneWallTex,
    bumpMap: stoneWallTex,
    bumpScale: 0.04,
    roughness: 0.82,
    metalness: 0.12,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map: flagstoneFloorTex,
    bumpMap: flagstoneFloorTex,
    bumpScale: 0.04,
    roughness: 0.78,
    metalness: 0.15,
  });

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x141117,
    roughness: 0.9,
    metalness: 0.1,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.22,
    metalness: 0.88,
  });

  // 2. Floor Slab (width: 36, length: 44)
  const floorGeom = new THREE.BoxGeometry(hallWidth, 0.8, hallLength);
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.position.y = -0.4;
  floorMesh.receiveShadow = true;
  landmarkGroup.add(floorMesh);

  // 3. Vaulted Ceiling & Ribs
  const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(hallWidth, 0.8, hallLength), ceilingMat);
  ceilingMesh.position.y = hallHeight;
  ceilingMesh.userData = { isCeilingObstacle: true };
  landmarkGroup.add(ceilingMesh);

  // Gothic transverse pointed vault ribs
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x242028, roughness: 0.75 });
  for (let z = -18; z <= 18; z += 6) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(hallWidth - 1, 0.9, 1.2), ribMat);
    rib.position.set(0, hallHeight - 0.5, z);
    rib.userData = { isCeilingObstacle: true };
    landmarkGroup.add(rib);
  }

  // 4. Cathedral Walls
  // North / Far Altar Wall (z = -22)
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(hallWidth, hallHeight, 1.4), wallMat);
  wallN.position.set(0, hallHeight / 2, -hallLength / 2);
  wallN.receiveShadow = true;
  landmarkGroup.add(wallN);

  // South / Entrance Wall (z = +22)
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(hallWidth, hallHeight, 1.4), wallMat);
  wallS.position.set(0, hallHeight / 2, hallLength / 2);
  wallS.receiveShadow = true;
  landmarkGroup.add(wallS);

  // West Wall (x = -18)
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(1.4, hallHeight, hallLength), wallMat);
  wallW.position.set(-hallWidth / 2, hallHeight / 2, 0);
  wallW.receiveShadow = true;
  landmarkGroup.add(wallW);

  // East Wall (x = +18)
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.4, hallHeight, hallLength), wallMat);
  wallE.position.set(hallWidth / 2, hallHeight / 2, 0);
  wallE.receiveShadow = true;
  landmarkGroup.add(wallE);

  // 5. 8 Clustered Gothic Pier Columns (x = ±10.5, z = -15, -5, 5, 15)
  const colX = [-10.5, 10.5];
  const colZ = [-15, -5, 5, 15];
  colX.forEach(x => {
    colZ.forEach(z => {
      const col = createGothicPier(hallHeight - 0.5);
      col.position.set(x, 0, z);
      landmarkGroup.add(col);
    });
  });

  // 6. Tall Pointed-Arch Clerestory Lancet Windows along Left & Right Walls
  const windowZPositions = [-15, -5, 5, 15];
  windowZPositions.forEach(z => {
    [-17.2, 17.2].forEach(x => {
      const winGroup = new THREE.Group();
      winGroup.position.set(x, 12, z);

      // Pointed lancet window frame
      const frameGeom = new THREE.BoxGeometry(0.3, 8.5, 3.2);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.9 });
      winGroup.add(new THREE.Mesh(frameGeom, frameMat));

      // Luminous stained glass pane
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x60a5fa,
        emissiveIntensity: 0.45,
        roughness: 0.1,
        transparent: true,
        opacity: 0.88,
      });
      const glassGeom = new THREE.BoxGeometry(0.1, 7.8, 2.8);
      winGroup.add(new THREE.Mesh(glassGeom, glassMat));

      // Central stone mullion
      const mullion = new THREE.BoxGeometry(0.15, 8.0, 0.2);
      winGroup.add(new THREE.Mesh(mullion, frameMat));

      // Pointed arch peak
      const archPeakGeom = new THREE.ConeGeometry(1.4, 2.0, 4);
      const archPeak = new THREE.Mesh(archPeakGeom, frameMat);
      archPeak.rotation.y = Math.PI / 4;
      archPeak.position.y = 4.8;
      winGroup.add(archPeak);

      landmarkGroup.add(winGroup);
    });
  });

  // 7. Magnificent Circular Gothic Rose Window on Far End Wall (z = -21.8, radius = 3.8)
  const roseGroup = new THREE.Group();
  roseGroup.position.set(0, 13.5, -21.2);

  // Outer stone circular ring
  const roseRingGeom = new THREE.TorusGeometry(3.9, 0.35, 16, 48);
  const roseStoneMat = new THREE.MeshStandardMaterial({ color: 0x221e26, roughness: 0.8 });
  roseGroup.add(new THREE.Mesh(roseRingGeom, roseStoneMat));

  // Glowing Rose Window glass plane
  const rosePlaneGeom = new THREE.CircleGeometry(3.8, 48);
  const roseGlassMat = new THREE.MeshStandardMaterial({
    map: roseTex,
    emissive: 0x60a5fa,
    emissiveMap: roseTex,
    emissiveIntensity: 0.5,
    roughness: 0.15,
    side: THREE.DoubleSide,
  });
  roseGroup.add(new THREE.Mesh(rosePlaneGeom, roseGlassMat));

  // Radial Stone Spoke Tracery
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI * 2) / 16;
    const spokeGeom = new THREE.CylinderGeometry(0.04, 0.04, 3.8, 8);
    const spoke = new THREE.Mesh(spokeGeom, roseStoneMat);
    spoke.rotation.z = angle;
    spoke.position.set(Math.cos(angle) * 1.9, Math.sin(angle) * 1.9, 0.05);
    roseGroup.add(spoke);
  }
  landmarkGroup.add(roseGroup);

  // 8. Double-Arched Wooden Cathedral Doors with Iron Ring Handles (Far Wall, z = -21.5)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 3.2, -21.2);

  const doorWoodMat = new THREE.MeshStandardMaterial({ color: 0x2b1810, roughness: 0.65 });
  const doorIronMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, metalness: 0.8, roughness: 0.4 });

  // Outer stone portal arch
  const portalArch = new THREE.BoxGeometry(6.6, 6.8, 0.5);
  doorGroup.add(new THREE.Mesh(portalArch, roseStoneMat));

  // Left & Right Doors
  [-1.4, 1.4].forEach(dx => {
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6.0, 0.2), doorWoodMat);
    doorLeaf.position.x = dx;
    doorGroup.add(doorLeaf);

    // Iron ring handle
    const ringGeom = new THREE.TorusGeometry(0.18, 0.035, 12, 24);
    const ring = new THREE.Mesh(ringGeom, doorIronMat);
    ring.position.set(dx + (dx < 0 ? 0.9 : -0.9), 0.2, 0.16);
    doorGroup.add(ring);

    // Iron strap hinges
    for (let hy of [-2.0, 0, 2.0]) {
      const hingeGeom = new THREE.BoxGeometry(2.4, 0.12, 0.05);
      const hinge = new THREE.Mesh(hingeGeom, doorIronMat);
      hinge.position.set(dx, hy, 0.12);
      doorGroup.add(hinge);
    }
  });
  landmarkGroup.add(doorGroup);

  // 9. Twin Animated Fire Braziers (x = ±7.2, z = 0)
  const brazierL = createFireBrazier(-7.2, 0);
  const brazierR = createFireBrazier(7.2, 0);
  landmarkGroup.add(brazierL.group);
  landmarkGroup.add(brazierR.group);
  braziers.push(brazierL, brazierR);

  // 10. Cathedral Ambient Fill & Moonbeam Lighting
  // Soft cool blue moonlit skylight pouring through clerestory windows
  const moonbeamLight = new THREE.DirectionalLight(0x60a5fa, 0.65);
  moonbeamLight.position.set(12, 18, -8);
  lightsGroup.add(moonbeamLight);

  const cathedralAmbient = new THREE.HemisphereLight(0xffedd5, 0x14101e, 0.45);
  lightsGroup.add(cathedralAmbient);

  // Update loop for animated flames and ember sparks
  const update = (dt: number, time: number) => {
    braziers.forEach((br, bIdx) => {
      // 1. Oscillate flame cones
      br.flameCones.forEach((cone, i) => {
        const osc = Math.sin(time * 14 + i * 1.5 + bIdx * 3.1) * 0.12;
        cone.scale.set(1.0 + osc, 1.0 + osc * 1.5, 1.0 + osc);
        cone.rotation.y = time * 2.5 + i * 0.7;
      });

      // 2. Flicker warm PointLight
      const flicker =
        Math.sin(time * 18 + bIdx * 4) * 0.45 +
        Math.cos(time * 31 + bIdx * 2) * 0.25;
      br.light.intensity = 5.0 + flicker;

      // 3. Update 25 rising glowing ember sparks
      const posAttr = br.embers.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;
      const vels = br.embers.velocities;

      for (let i = 0; i < 25; i++) {
        positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
        positions[i * 3] += vels[i * 3] * dt;
        positions[i * 3 + 2] += vels[i * 3 + 2] * dt;

        // Reset ember if it rises too high
        if (positions[i * 3 + 1] > 3.8) {
          const r = Math.random() * 0.5;
          const theta = Math.random() * Math.PI * 2;
          positions[i * 3] = Math.cos(theta) * r;
          positions[i * 3 + 1] = br.embers.initialY + Math.random() * 0.2;
          positions[i * 3 + 2] = Math.sin(theta) * r;
        }
      }
      posAttr.needsUpdate = true;
    });
  };

  return {
    landmarkGroup,
    lightsGroup,
    braziers,
    update,
  };
}
