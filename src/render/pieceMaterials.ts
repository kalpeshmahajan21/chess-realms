import * as THREE from 'three';
import type { PieceColor } from '../engine/chess.ts';

export type PieceMaterialType = 'silver' | 'gold' | 'diamond' | 'ruby' | 'obsidian' | 'jade' | 'marble';

export interface MaterialOption {
  id: PieceMaterialType;
  name: string;
  description: string;
  swatch: string; // CSS colour for UI chips
  swatchEdge: string;
}

export const PIECE_MATERIALS_LIST: MaterialOption[] = [
  { id: 'marble', name: 'Marble', description: 'Carrara stone, satin polish', swatch: '#efebe4', swatchEdge: '#bdb6aa' },
  { id: 'obsidian', name: 'Obsidian', description: 'Black volcanic glass', swatch: '#1a1a1f', swatchEdge: '#4a4a55' },
  { id: 'silver', name: 'Silver', description: 'Brushed sterling silver', swatch: '#d9dde2', swatchEdge: '#8d949c' },
  { id: 'gold', name: 'Gold', description: 'Polished 18k gold', swatch: '#e2b64f', swatchEdge: '#9b7420' },
  { id: 'diamond', name: 'Sapphire', description: 'Sky blue to deep navy sapphire', swatch: '#3f7fd8', swatchEdge: '#14306e' },
  { id: 'ruby', name: 'Ruby', description: 'Deep translucent red gem', swatch: '#b3122f', swatchEdge: '#5e0718' },
  { id: 'jade', name: 'Jade', description: 'Imperial green nephrite', swatch: '#3b9a72', swatchEdge: '#1d5a40' },
];

let marbleTex: THREE.Texture | null = null;
let brushedTex: THREE.Texture | null = null;

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Soft multi-octave marble veining painted on a canvas. */
function marbleTexture(): THREE.Texture {
  if (marbleTex) return marbleTex;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const r = rand(7);
  ctx.fillStyle = '#f4f1ec';
  ctx.fillRect(0, 0, size, size);
  // Cloudy tonal variation
  for (let i = 0; i < 60; i++) {
    const g = ctx.createRadialGradient(r() * size, r() * size, 0, r() * size, r() * size, 40 + r() * 140);
    const tone = 225 + Math.floor(r() * 25);
    g.addColorStop(0, `rgba(${tone},${tone - 3},${tone - 8},0.35)`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Veins: wandering polylines, wide+faint then thin+darker
  const vein = (width: number, alpha: number, count: number) => {
    for (let v = 0; v < count; v++) {
      let x = r() * size;
      let y = -10;
      let dir = (r() - 0.5) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < size + 10) {
        dir += (r() - 0.5) * 0.35;
        dir = Math.max(-1.1, Math.min(1.1, dir));
        x += Math.sin(dir) * 9;
        y += Math.cos(dir) * 9;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(120,118,125,${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  };
  vein(6, 0.06, 7);
  vein(1.6, 0.28, 9);
  vein(0.8, 0.35, 6);
  marbleTex = new THREE.CanvasTexture(c);
  marbleTex.colorSpace = THREE.SRGBColorSpace;
  marbleTex.wrapS = marbleTex.wrapT = THREE.RepeatWrapping;
  marbleTex.anisotropy = 4;
  return marbleTex;
}

/** Fine horizontal brushing used as a roughness map on metals. */
function brushedTexture(): THREE.Texture {
  if (brushedTex) return brushedTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const r = rand(3);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y++) {
    const v = 110 + Math.floor(r() * 40);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 64, 1);
  }
  brushedTex = new THREE.CanvasTexture(c);
  brushedTex.wrapS = brushedTex.wrapT = THREE.RepeatWrapping;
  return brushedTex;
}

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/**
 * Shared material per (type, side, duplicate, transmission) combination.
 * When both players choose the same material, the black side gets a deeper tone so armies stay distinct.
 */
export function getPieceMaterial(type: PieceMaterialType, side: PieceColor, duplicate: boolean, allowTransmission: boolean): THREE.MeshPhysicalMaterial {
  const dark = duplicate && side === 'b';
  const key = `${type}|${dark}|${allowTransmission}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let m: THREE.MeshPhysicalMaterial;
  switch (type) {
    case 'marble':
      m = new THREE.MeshPhysicalMaterial({
        color: dark ? 0x77736e : 0xe8e3db,
        map: marbleTexture(),
        roughness: 0.34,
        metalness: 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      });
      break;
    case 'obsidian':
      m = new THREE.MeshPhysicalMaterial({
        color: dark ? 0x3a3542 : 0x0e0e12,
        roughness: 0.16,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        specularIntensity: 1,
        ior: 1.5,
      });
      break;
    case 'silver':
      m = new THREE.MeshPhysicalMaterial({
        color: dark ? 0x6f757d : 0xdfe3e8,
        metalness: 1,
        roughness: 0.24,
        roughnessMap: brushedTexture(),
        clearcoat: 0.25,
        clearcoatRoughness: 0.1,
      });
      break;
    case 'gold':
      m = new THREE.MeshPhysicalMaterial({
        color: dark ? 0xa66f22 : 0xf0c35c,
        metalness: 1,
        roughness: 0.22,
        roughnessMap: brushedTexture(),
        clearcoat: 0.3,
        clearcoatRoughness: 0.08,
      });
      break;
    case 'diamond':
      // Sapphire (id kept as 'diamond' so saved choices carry over): light sky blue for one side, deep navy for the other.
      m = allowTransmission
        ? new THREE.MeshPhysicalMaterial({
            color: dark ? 0x1d3f9a : 0x6ab8ff,
            metalness: 0,
            roughness: 0.05,
            transmission: dark ? 0.82 : 0.4,
            thickness: 0.9,
            ior: 1.77,
            dispersion: 0.6,
            attenuationColor: new THREE.Color(dark ? 0x0a1c5a : 0x4aa6ff),
            attenuationDistance: dark ? 0.5 : 0.9,
            specularIntensity: 1,
            clearcoat: 1,
          })
        : new THREE.MeshPhysicalMaterial({
            color: dark ? 0x142f78 : 0x6fb6f5,
            metalness: 0,
            roughness: 0.08,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            sheen: 0.4,
            sheenColor: new THREE.Color(dark ? 0x4a74e0 : 0xbfe0ff),
          });
      break;
    case 'ruby':
      m = allowTransmission
        ? new THREE.MeshPhysicalMaterial({
            color: dark ? 0x7a0a22 : 0xe0284a,
            metalness: 0,
            roughness: 0.06,
            transmission: 0.85,
            thickness: 0.9,
            ior: 1.77,
            attenuationColor: new THREE.Color(dark ? 0x4a0010 : 0x9a0020),
            attenuationDistance: 0.6,
            clearcoat: 1,
          })
        : new THREE.MeshPhysicalMaterial({
            color: dark ? 0x5c0718 : 0xa8102e,
            metalness: 0,
            roughness: 0.1,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            sheen: 0.4,
            sheenColor: new THREE.Color(0xff5070),
          });
      break;
    case 'jade':
      m = new THREE.MeshPhysicalMaterial({
        color: dark ? 0x1e5a42 : 0x3fa47a,
        metalness: 0,
        roughness: 0.3,
        transmission: allowTransmission ? 0.3 : 0,
        thickness: 1.2,
        attenuationColor: new THREE.Color(0x0f4d33),
        attenuationDistance: 0.8,
        clearcoat: 0.8,
        clearcoatRoughness: 0.12,
        sheen: 0.3,
        sheenColor: new THREE.Color(0x9cf0c8),
      });
      break;
  }
  m.name = `piece-${key}`;
  m.envMapIntensity = 1;
  cache.set(key, m);
  return m;
}

/** Trim material used by the Warrior set (gold accents). */
let trimMat: THREE.MeshPhysicalMaterial | null = null;
export function getTrimMaterial(): THREE.MeshPhysicalMaterial {
  if (!trimMat) {
    trimMat = new THREE.MeshPhysicalMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.25, clearcoat: 0.4 });
  }
  return trimMat;
}

/** Team accent for the felt ring when both players chose the same material. */
const accentCache = new Map<PieceColor, THREE.MeshStandardMaterial>();
export function getAccentMaterial(side: PieceColor): THREE.MeshStandardMaterial {
  let m = accentCache.get(side);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: side === 'w' ? 0xf2f2f2 : 0x1b1b1f,
      emissive: side === 'w' ? 0x6ab7ff : 0xff5a6e,
      emissiveIntensity: 0.6,
      roughness: 0.6,
    });
    accentCache.set(side, m);
  }
  return m;
}

/** Felt pad under every piece (dark green baize, like real tournament sets). */
let feltMat: THREE.MeshStandardMaterial | null = null;
export function getFeltMaterial(): THREE.MeshStandardMaterial {
  if (!feltMat) feltMat = new THREE.MeshStandardMaterial({ color: 0x1d3b2c, roughness: 1, metalness: 0 });
  return feltMat;
}
