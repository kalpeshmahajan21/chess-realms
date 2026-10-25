import * as THREE from 'three';

/**
 * Geometry for the original v1 "Gilded Warrior" piece set (body + gold trim parts).
 * Merged into single meshes by render/pieceGeometry.ts.
 */

// Lathe helper
function createLathe(points: [number, number][], segments = 32): THREE.BufferGeometry {
  const vPoints = points.map(([r, h]) => new THREE.Vector2(r, h));
  return new THREE.LatheGeometry(vPoints, segments);
}

// 1. PAWN: Armored foot-soldier on stepped circular pedestal holding a vertical broadsword and shield
export function buildWarriorPawn(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Stepped circular pedestal
  const baseProfile: [number, number][] = [
    [0.0, 0.0],
    [0.34, 0.0],
    [0.34, 0.06],
    [0.30, 0.09],
    [0.26, 0.13],
    [0.21, 0.20],
    [0.17, 0.35],
    [0.14, 0.48],
  ];
  bodyGeoms.push(createLathe(baseProfile, 28));

  // Gold ring at base tier
  const goldBaseRing = new THREE.TorusGeometry(0.32, 0.02, 12, 28);
  goldBaseRing.rotateX(Math.PI / 2);
  goldBaseRing.translate(0, 0.06, 0);
  goldGeoms.push(goldBaseRing);

  // Armored torso & chestplate
  const torso = new THREE.CylinderGeometry(0.18, 0.15, 0.32, 16);
  torso.translate(0, 0.62, 0);
  bodyGeoms.push(torso);

  // Gold breastplate chevron emblem
  const chestPlate = new THREE.BoxGeometry(0.16, 0.14, 0.04);
  chestPlate.translate(0, 0.64, 0.15);
  goldGeoms.push(chestPlate);

  // Shoulders (pauldrons)
  const pauldronL = new THREE.SphereGeometry(0.08, 12, 12);
  pauldronL.translate(-0.20, 0.70, 0);
  goldGeoms.push(pauldronL);
  const pauldronR = new THREE.SphereGeometry(0.08, 12, 12);
  pauldronR.translate(0.20, 0.70, 0);
  goldGeoms.push(pauldronR);

  // Armored Great-helm with eye slit
  const helmet = new THREE.CylinderGeometry(0.13, 0.14, 0.22, 16);
  helmet.translate(0, 0.86, 0);
  bodyGeoms.push(helmet);

  const helmDome = new THREE.SphereGeometry(0.13, 16, 12);
  helmDome.translate(0, 0.97, 0);
  bodyGeoms.push(helmDome);

  // Gold crest ridge on helmet
  const crest = new THREE.BoxGeometry(0.03, 0.12, 0.24);
  crest.translate(0, 1.02, 0);
  goldGeoms.push(crest);

  // Shield on left arm
  const shield = new THREE.BoxGeometry(0.18, 0.36, 0.04);
  shield.rotateY(0.2);
  shield.translate(-0.22, 0.60, 0.12);
  bodyGeoms.push(shield);

  // Gold shield rim & boss
  const shieldBoss = new THREE.SphereGeometry(0.05, 12, 12);
  shieldBoss.translate(-0.21, 0.60, 0.15);
  goldGeoms.push(shieldBoss);

  // Vertical broadsword held in right hand in front
  const swordBlade = new THREE.BoxGeometry(0.03, 0.52, 0.02);
  swordBlade.translate(0.14, 0.64, 0.16);
  goldGeoms.push(swordBlade);

  const swordCross = new THREE.BoxGeometry(0.14, 0.03, 0.03);
  swordCross.translate(0.14, 0.50, 0.16);
  goldGeoms.push(swordCross);

  const swordPommel = new THREE.SphereGeometry(0.03, 8, 8);
  swordPommel.translate(0.14, 0.36, 0.16);
  goldGeoms.push(swordPommel);

  return { bodyGeoms, goldGeoms };
}

// 2. ROOK: Fortified medieval siege tower with gold-trimmed battlements and gothic slit windows
export function buildWarriorRook(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Heavy stepped square-to-round stone base
  const plinth = new THREE.BoxGeometry(0.72, 0.12, 0.72);
  plinth.translate(0, 0.06, 0);
  bodyGeoms.push(plinth);

  const goldPlinthTrim = new THREE.BoxGeometry(0.74, 0.02, 0.74);
  goldPlinthTrim.translate(0, 0.12, 0);
  goldGeoms.push(goldPlinthTrim);

  // Tapered circular tower shaft
  const towerProfile: [number, number][] = [
    [0.0, 0.12],
    [0.34, 0.12],
    [0.32, 0.22],
    [0.26, 0.45],
    [0.28, 0.82],
    [0.36, 0.94],
    [0.38, 1.08],
    [0.25, 1.08],
    [0.25, 0.96],
    [0.0, 0.96],
  ];
  bodyGeoms.push(createLathe(towerProfile, 32));

  // 4 Gold-trimmed crenellations / battlements on top rim
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI * 2) / 4 + Math.PI / 4;
    const merlon = new THREE.BoxGeometry(0.16, 0.18, 0.12);
    merlon.rotateY(angle);
    merlon.translate(Math.cos(angle) * 0.30, 1.14, Math.sin(angle) * 0.30);
    bodyGeoms.push(merlon);

    const merlonCap = new THREE.BoxGeometry(0.18, 0.03, 0.14);
    merlonCap.rotateY(angle);
    merlonCap.translate(Math.cos(angle) * 0.30, 1.24, Math.sin(angle) * 0.30);
    goldGeoms.push(merlonCap);
  }

  // Gold cornice ring below battlements
  const cornice = new THREE.TorusGeometry(0.36, 0.025, 12, 32);
  cornice.rotateX(Math.PI / 2);
  cornice.translate(0, 0.94, 0);
  goldGeoms.push(cornice);

  // Gothic slit arrow loop windows (recessed dark/gold trims)
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI * 2) / 4;
    const windowTrim = new THREE.BoxGeometry(0.04, 0.22, 0.03);
    windowTrim.rotateY(angle);
    windowTrim.translate(Math.cos(angle) * 0.28, 0.62, Math.sin(angle) * 0.28);
    goldGeoms.push(windowTrim);
  }

  return { bodyGeoms, goldGeoms };
}

// 3. KNIGHT: Armored warhorse with sculpted mane, gold barding plates, and rider lance/shield
export function buildWarriorKnight(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Pedestal base
  const baseProfile: [number, number][] = [
    [0.0, 0.0],
    [0.36, 0.0],
    [0.36, 0.07],
    [0.31, 0.12],
    [0.26, 0.18],
    [0.23, 0.28],
    [0.25, 0.32],
    [0.0, 0.32],
  ];
  bodyGeoms.push(createLathe(baseProfile, 32));

  // Gold base ring
  const goldRing = new THREE.TorusGeometry(0.34, 0.02, 12, 32);
  goldRing.rotateX(Math.PI / 2);
  goldRing.translate(0, 0.07, 0);
  goldGeoms.push(goldRing);

  // Muscular arched warhorse neck
  const neck = new THREE.CylinderGeometry(0.18, 0.25, 0.52, 20);
  neck.rotateZ(0.24);
  neck.translate(-0.06, 0.54, 0);
  bodyGeoms.push(neck);

  // Gold barding neck armor plate (crinet)
  const neckArmor = new THREE.CylinderGeometry(0.20, 0.27, 0.28, 16, 1, false, -Math.PI / 2, Math.PI);
  neckArmor.rotateZ(0.24);
  neckArmor.translate(-0.06, 0.58, 0);
  goldGeoms.push(neckArmor);

  // Horse head & muzzle
  const head = new THREE.BoxGeometry(0.28, 0.25, 0.38);
  head.rotateX(0.35);
  head.translate(0.10, 0.85, 0);
  bodyGeoms.push(head);

  const snout = new THREE.CylinderGeometry(0.11, 0.15, 0.30, 16);
  snout.rotateZ(-0.65);
  snout.translate(0.22, 0.72, 0);
  bodyGeoms.push(snout);

  // Gold chanfron (face armor plate with spike)
  const chanfron = new THREE.BoxGeometry(0.14, 0.32, 0.04);
  chanfron.rotateZ(-0.65);
  chanfron.translate(0.18, 0.84, 0);
  goldGeoms.push(chanfron);

  const unicornSpike = new THREE.ConeGeometry(0.035, 0.22, 12);
  unicornSpike.rotateZ(-0.65);
  unicornSpike.translate(0.28, 0.98, 0);
  goldGeoms.push(unicornSpike);

  // Sculpted armored ears
  const earL = new THREE.ConeGeometry(0.05, 0.18, 10);
  earL.rotateZ(-0.25);
  earL.rotateX(0.2);
  earL.translate(0.03, 1.04, 0.10);
  bodyGeoms.push(earL);

  const earR = new THREE.ConeGeometry(0.05, 0.18, 10);
  earR.rotateZ(-0.25);
  earR.rotateX(-0.2);
  earR.translate(0.03, 1.04, -0.10);
  bodyGeoms.push(earR);

  // Cascading gold mane ridges
  for (let i = 0; i < 5; i++) {
    const mane = new THREE.BoxGeometry(0.08, 0.13, 0.14 - i * 0.015);
    mane.rotateZ(0.38);
    mane.translate(-0.16 - i * 0.035, 0.84 - i * 0.10, 0);
    goldGeoms.push(mane);
  }

  // Rider's lance / pennon silhouette along flank
  const lanceShaft = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8);
  lanceShaft.rotateZ(-0.25);
  lanceShaft.translate(-0.08, 0.75, 0.22);
  goldGeoms.push(lanceShaft);

  const lanceTip = new THREE.ConeGeometry(0.04, 0.18, 8);
  lanceTip.rotateZ(-0.25);
  lanceTip.translate(0.04, 1.28, 0.22);
  goldGeoms.push(lanceTip);

  return { bodyGeoms, goldGeoms };
}

// 4. BISHOP: Robed high cleric with gold-trimmed mitre and illuminated crosier staff
export function buildWarriorBishop(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Stepped fluted base
  const baseProfile: [number, number][] = [
    [0.0, 0.0],
    [0.36, 0.0],
    [0.36, 0.07],
    [0.31, 0.12],
    [0.24, 0.18],
    [0.17, 0.40],
    [0.15, 0.70],
    [0.22, 0.78],
    [0.18, 0.84],
    [0.0, 0.84],
  ];
  bodyGeoms.push(createLathe(baseProfile, 32));

  // Gold base collar and waist belt
  const baseRing = new THREE.TorusGeometry(0.34, 0.02, 12, 32);
  baseRing.rotateX(Math.PI / 2);
  baseRing.translate(0, 0.07, 0);
  goldGeoms.push(baseRing);

  const waistCincture = new THREE.TorusGeometry(0.18, 0.025, 12, 32);
  waistCincture.rotateX(Math.PI / 2);
  waistCincture.translate(0, 0.52, 0);
  goldGeoms.push(waistCincture);

  // Liturgical Chasuble / Cleric Robe trim running down center
  const stoleTrim = new THREE.BoxGeometry(0.06, 0.45, 0.03);
  stoleTrim.translate(0, 0.50, 0.16);
  goldGeoms.push(stoleTrim);

  // Mitre head (pointed bishop's headdress)
  const mitreProfile: [number, number][] = [
    [0.0, 0.84],
    [0.20, 0.88],
    [0.22, 1.05],
    [0.18, 1.22],
    [0.0, 1.34],
  ];
  bodyGeoms.push(createLathe(mitreProfile, 28));

  // Gold cross emblem on mitre front
  const mitreCrossV = new THREE.BoxGeometry(0.03, 0.18, 0.04);
  mitreCrossV.translate(0, 1.08, 0.20);
  goldGeoms.push(mitreCrossV);
  const mitreCrossH = new THREE.BoxGeometry(0.12, 0.03, 0.04);
  mitreCrossH.translate(0, 1.12, 0.20);
  goldGeoms.push(mitreCrossH);

  // Gold spherical apex finial bead
  const finial = new THREE.SphereGeometry(0.05, 16, 16);
  finial.translate(0, 1.38, 0);
  goldGeoms.push(finial);

  // Illuminated Crosier (pastoral shepherd's staff) on side
  const staffShaft = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 12);
  staffShaft.translate(0.24, 0.65, 0);
  goldGeoms.push(staffShaft);

  // Curved gold shepherd's crook head
  const crookSpiral = new THREE.TorusGeometry(0.09, 0.02, 12, 24, Math.PI * 1.5);
  crookSpiral.translate(0.24, 1.28, 0);
  goldGeoms.push(crookSpiral);

  return { bodyGeoms, goldGeoms };
}

// 5. QUEEN: Crowned warrior monarch with flared royal robes, gold shoulder pauldrons, and raised scepter
export function buildWarriorQueen(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Elegant flowing flared royal gown
  const gownProfile: [number, number][] = [
    [0.0, 0.0],
    [0.38, 0.0],
    [0.38, 0.08],
    [0.32, 0.14],
    [0.26, 0.24],
    [0.19, 0.50],
    [0.16, 0.85],
    [0.24, 0.96],
    [0.20, 1.04],
    [0.0, 1.04],
  ];
  bodyGeoms.push(createLathe(gownProfile, 32));

  // Gold gown hem trim
  const gownHem = new THREE.TorusGeometry(0.36, 0.025, 12, 32);
  gownHem.rotateX(Math.PI / 2);
  gownHem.translate(0, 0.08, 0);
  goldGeoms.push(gownHem);

  // Royal corset & gold belt girdle
  const royalBelt = new THREE.TorusGeometry(0.20, 0.03, 12, 32);
  royalBelt.rotateX(Math.PI / 2);
  royalBelt.translate(0, 0.65, 0);
  goldGeoms.push(royalBelt);

  // Sculpted gold shoulder pauldrons
  const pauldronL = new THREE.SphereGeometry(0.09, 14, 14);
  pauldronL.translate(-0.25, 0.98, 0);
  goldGeoms.push(pauldronL);
  const pauldronR = new THREE.SphereGeometry(0.09, 14, 14);
  pauldronR.translate(0.25, 0.98, 0);
  goldGeoms.push(pauldronR);

  // Queen's Torso & neck
  const chest = new THREE.CylinderGeometry(0.18, 0.16, 0.28, 16);
  chest.translate(0, 1.10, 0);
  bodyGeoms.push(chest);

  // Regal Coronet Crown with 8 gold-tipped spikes and jewel beads
  const crownBase = new THREE.CylinderGeometry(0.23, 0.20, 0.18, 24, 1, true);
  crownBase.translate(0, 1.28, 0);
  goldGeoms.push(crownBase);

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const spike = new THREE.ConeGeometry(0.035, 0.14, 8);
    spike.translate(Math.cos(angle) * 0.22, 1.42, Math.sin(angle) * 0.22);
    goldGeoms.push(spike);

    const pearl = new THREE.SphereGeometry(0.025, 8, 8);
    pearl.translate(Math.cos(angle) * 0.22, 1.50, Math.sin(angle) * 0.22);
    goldGeoms.push(pearl);
  }

  // Raised Sovereign's Scepter in right hand
  const scepterRod = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8);
  scepterRod.rotateZ(-0.2);
  scepterRod.translate(0.28, 0.92, 0.12);
  goldGeoms.push(scepterRod);

  const scepterOrb = new THREE.SphereGeometry(0.06, 14, 14);
  scepterOrb.translate(0.36, 1.34, 0.12);
  goldGeoms.push(scepterOrb);

  return { bodyGeoms, goldGeoms };
}

// 6. KING: Towering armored sovereign with high cross-peaked gold crown, layered cape, and great-sword
export function buildWarriorKing(): { bodyGeoms: THREE.BufferGeometry[]; goldGeoms: THREE.BufferGeometry[] } {
  const bodyGeoms: THREE.BufferGeometry[] = [];
  const goldGeoms: THREE.BufferGeometry[] = [];

  // Massive stepped royal dais pedestal
  const baseProfile: [number, number][] = [
    [0.0, 0.0],
    [0.40, 0.0],
    [0.40, 0.08],
    [0.34, 0.14],
    [0.28, 0.25],
    [0.22, 0.55],
    [0.18, 0.95],
    [0.26, 1.08],
    [0.22, 1.16],
    [0.0, 1.16],
  ];
  bodyGeoms.push(createLathe(baseProfile, 36));

  // Gold base tier rim
  const baseRim = new THREE.TorusGeometry(0.38, 0.03, 12, 36);
  baseRim.rotateX(Math.PI / 2);
  baseRim.translate(0, 0.08, 0);
  goldGeoms.push(baseRim);

  // Armored chestplate & waist belt
  const breastplate = new THREE.CylinderGeometry(0.24, 0.20, 0.38, 16);
  breastplate.translate(0, 1.12, 0);
  bodyGeoms.push(breastplate);

  const royalBelt = new THREE.BoxGeometry(0.44, 0.06, 0.38);
  royalBelt.translate(0, 0.88, 0);
  goldGeoms.push(royalBelt);

  // Heavy gold lion-crest shoulder pauldrons
  const pauldronL = new THREE.BoxGeometry(0.18, 0.14, 0.22);
  pauldronL.translate(-0.30, 1.24, 0);
  goldGeoms.push(pauldronL);
  const pauldronR = new THREE.BoxGeometry(0.18, 0.14, 0.22);
  pauldronR.translate(0.30, 1.24, 0);
  goldGeoms.push(pauldronR);

  // Royal flowing cape on back
  const cape = new THREE.BoxGeometry(0.48, 1.0, 0.06);
  cape.rotateX(-0.1);
  cape.translate(0, 0.72, -0.22);
  bodyGeoms.push(cape);

  const capeTrim = new THREE.BoxGeometry(0.50, 0.04, 0.08);
  capeTrim.translate(0, 1.22, -0.20);
  goldGeoms.push(capeTrim);

  // Grand Imperial Arched Crown with Fleur-de-lis peaks
  const crownCylinder = new THREE.CylinderGeometry(0.24, 0.22, 0.22, 24, 1, true);
  crownCylinder.translate(0, 1.38, 0);
  goldGeoms.push(crownCylinder);

  // Cross arches meeting at peak
  const arch1 = new THREE.TorusGeometry(0.22, 0.025, 12, 24, Math.PI);
  arch1.translate(0, 1.48, 0);
  goldGeoms.push(arch1);

  const arch2 = new THREE.TorusGeometry(0.22, 0.025, 12, 24, Math.PI);
  arch2.rotateY(Math.PI / 2);
  arch2.translate(0, 1.48, 0);
  goldGeoms.push(arch2);

  // Imperial Latin Cross at Crown Apex
  const crossVert = new THREE.BoxGeometry(0.045, 0.22, 0.045);
  crossVert.translate(0, 1.76, 0);
  goldGeoms.push(crossVert);

  const crossHoriz = new THREE.BoxGeometry(0.16, 0.045, 0.045);
  crossHoriz.translate(0, 1.80, 0);
  goldGeoms.push(crossHoriz);

  // Two-Handed Great-sword held point-down in front
  const greatswordBlade = new THREE.BoxGeometry(0.05, 1.05, 0.025);
  greatswordBlade.translate(0, 0.62, 0.22);
  goldGeoms.push(greatswordBlade);

  const crossguard = new THREE.BoxGeometry(0.32, 0.04, 0.04);
  crossguard.translate(0, 1.15, 0.22);
  goldGeoms.push(crossguard);

  const hiltGrip = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8);
  hiltGrip.translate(0, 1.26, 0.22);
  bodyGeoms.push(hiltGrip);

  const pommel = new THREE.SphereGeometry(0.045, 12, 12);
  pommel.translate(0, 1.36, 0.22);
  goldGeoms.push(pommel);

  return { bodyGeoms, goldGeoms };
}
