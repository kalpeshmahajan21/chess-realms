import type { ArenaId } from '../../audio/soundEngine.ts';
import { ASSET_ROOT, assetPath } from './assets.ts';

/*
 * Background prefetch of arena files into the browser cache, so switching arenas doesn't wait on the network.
 * The lists were recorded from the game itself (every file each arena requests); assetPath() swaps in the
 * lite versions on phones. Files go one at a time at low priority and stop on Data Saver or 2G connections.
 */
const ARENA_FILES: Record<ArenaId, string[]> = {
  traditional: [
    'hdri/old_hall_1k.hdr',
    'models/ArmChair_01.glb',
    'models/Chandelier_01.glb',
    'models/antique_ceramic_vase_01.glb',
    'models/book_encyclopedia_set_01.glb',
    'models/marble_bust_01.glb',
    'models/potted_plant_02.glb',
    'models/side_table_tall_01.glb',
    'models/vintage_grandfather_clock_01.glb',
    'models/vintage_oil_lamp.glb',
    'tex/ash_veneer/diff.jpg',
    'tex/ash_veneer/nor.jpg',
    'tex/black_walnut_veneer_01/diff.jpg',
    'tex/black_walnut_veneer_01/nor.jpg',
    'tex/brown_leather/diff.jpg',
    'tex/brown_leather/nor.jpg',
    'tex/brown_leather/rough.jpg',
    'tex/dark_wood/diff.jpg',
    'tex/dark_wood/nor.jpg',
    'tex/dark_wood/rough.jpg',
    'tex/european_walnut_veneer_04/diff.jpg',
    'tex/european_walnut_veneer_04/nor.jpg',
    'tex/european_walnut_veneer_04/rough.jpg',
    'tex/herringbone_parquet/diff.jpg',
    'tex/herringbone_parquet/nor.jpg',
    'tex/herringbone_parquet/rough.jpg',
    'tex/plastered_wall_04/diff.jpg',
    'tex/plastered_wall_04/nor.jpg',
    'tex/plastered_wall_04/rough.jpg',
    'tex/poly_wool_herringbone/diff.jpg',
    'tex/poly_wool_herringbone/nor.jpg',
    'tex/poly_wool_herringbone/rough.jpg',
  ],
  india: [
    'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    'models/brass_diya_lantern.glb',
    'models/brass_pot_01.glb',
    'models/brass_vase_03.glb',
    'models/carved_wooden_elephant.glb',
    'models/potted_plant_02.glb',
    'photo/kloofendal_48d_partly_cloudy_puresky_4k.jpg',
    'tex/european_walnut_veneer_04/diff.jpg',
    'tex/european_walnut_veneer_04/nor.jpg',
    'tex/european_walnut_veneer_04/rough.jpg',
    'tex/marble_01/diff.jpg',
    'tex/marble_01/nor.jpg',
    'tex/marble_01/rough.jpg',
    'tex/marble_mosaic_tiles/diff.jpg',
    'tex/marble_mosaic_tiles/nor.jpg',
    'tex/marble_mosaic_tiles/rough.jpg',
    'tex/red_sandstone_pavement/diff.jpg',
    'tex/red_sandstone_pavement/nor.jpg',
    'tex/red_sandstone_pavement/rough.jpg',
    'tex/red_sandstone_wall/diff.jpg',
    'tex/red_sandstone_wall/nor.jpg',
    'tex/red_sandstone_wall/rough.jpg',
  ],
  chess_arena: [
    'hdri/stadium_01_1k.hdr',
    'models/football.glb',
    'photo/stadium_01_4k.jpg',
    'tex/ash_veneer/diff.jpg',
    'tex/ash_veneer/nor.jpg',
    'tex/black_walnut_veneer_01/diff.jpg',
    'tex/black_walnut_veneer_01/nor.jpg',
  ],
  shadow_dungeon: [
    'space/earth_clouds_2k.jpg',
    'space/earth_day_4k.jpg',
    'space/earth_night_2k.jpg',
    'space/milkyway_4k.jpg',
    'space/moon_1k.jpg',
  ],
  japan: [
    'hdri/kloofendal_38d_partly_cloudy_puresky_1k.hdr',
    'models/antique_katana_01.glb',
    'models/fern_02.glb',
    'models/katana_stand_01.glb',
    'models/rock_moss_set_01.glb',
    'models/rock_moss_set_02.glb',
    'models/shrub_02.glb',
    'models/tea_set_01.glb',
    'photo/kloofendal_38d_partly_cloudy_puresky_4k.jpg',
    'tex/ash_veneer/diff.jpg',
    'tex/ash_veneer/nor.jpg',
    'tex/bamboo_wall/diff.jpg',
    'tex/bamboo_wall/nor.jpg',
    'tex/bamboo_wall/rough.jpg',
    'tex/black_walnut_veneer_01/diff.jpg',
    'tex/black_walnut_veneer_01/nor.jpg',
    'tex/gravel_floor_03/diff.jpg',
    'tex/gravel_floor_03/nor.jpg',
    'tex/gravel_floor_03/rough.jpg',
    'tex/grey_roof_tiles/diff.jpg',
    'tex/grey_roof_tiles/nor.jpg',
    'tex/grey_roof_tiles/rough.jpg',
    'tex/hinoki_planks/diff.jpg',
    'tex/hinoki_planks/nor.jpg',
    'tex/hinoki_planks/rough.jpg',
    'tex/japanese_cedar_planks/diff.jpg',
    'tex/japanese_cedar_planks/nor.jpg',
    'tex/japanese_cedar_planks/rough.jpg',
    'tex/japanese_stone_wall/diff.jpg',
    'tex/japanese_stone_wall/nor.jpg',
    'tex/japanese_stone_wall/rough.jpg',
    'tex/leafy_grass/diff.jpg',
    'tex/leafy_grass/nor.jpg',
    'tex/leafy_grass/rough.jpg',
    'tex/tatami_mat/diff.jpg',
    'tex/tatami_mat/nor.jpg',
    'tex/tatami_mat/rough.jpg',
    'tex/white_plaster_rough_01/diff.jpg',
    'tex/white_plaster_rough_01/nor.jpg',
    'tex/white_plaster_rough_01/rough.jpg',
  ],
  usa: [
    'hdri/rooftop_night_1k.hdr',
    'models/exterior_aircon_unit.glb',
    'models/security_light.glb',
    'tex/anti_slip_concrete/diff.jpg',
    'tex/anti_slip_concrete/nor.jpg',
    'tex/anti_slip_concrete/rough.jpg',
    'tex/concrete_wall_008/diff.jpg',
    'tex/concrete_wall_008/nor.jpg',
    'tex/concrete_wall_008/rough.jpg',
    'tex/granite_tile/diff.jpg',
    'tex/granite_tile/nor.jpg',
    'tex/granite_tile/rough.jpg',
    'tex/marble_01/diff.jpg',
    'tex/marble_01/nor.jpg',
    'tex/rectangular_facade_tiles/diff.jpg',
    'tex/rectangular_facade_tiles/nor.jpg',
    'tex/rectangular_facade_tiles/rough.jpg',
  ],
  egypt: [
    'hdri/qwantani_sunset_puresky_1k.hdr',
    'models/brass_goblets.glb',
    'models/brass_vase_02.glb',
    'models/namaqualand_boulder_02.glb',
    'models/treasure_chest.glb',
    'photo/qwantani_sunset_puresky_4k.jpg',
    'tex/old_sandstone_02/diff.jpg',
    'tex/old_sandstone_02/nor.jpg',
    'tex/old_sandstone_02/rough.jpg',
    'tex/sand_02/diff.jpg',
    'tex/sand_02/nor.jpg',
    'tex/sand_02/rough.jpg',
    'tex/sandstone_blocks_08/diff.jpg',
    'tex/sandstone_blocks_08/nor.jpg',
    'tex/sandstone_blocks_08/rough.jpg',
  ],
  royal_kingdom: [
    'hdri/warm_restaurant_night_1k.hdr',
    'models/chess_set.glb',
    'models/croissant.glb',
    'models/gallinera_chair.glb',
    'models/gallinera_table.glb',
    'models/jug_01.glb',
    'models/lantern_chandelier_01.glb',
    'models/potted_plant_01.glb',
    'models/round_wooden_table_01.glb',
    'models/standing_chalkboard_01.glb',
    'models/wine_barrel_01.glb',
    'models/wine_bottles_01.glb',
    'tex/dark_wood/diff.jpg',
    'tex/dark_wood/nor.jpg',
    'tex/dark_wood/rough.jpg',
    'tex/marble_01/diff.jpg',
    'tex/marble_01/nor.jpg',
    'tex/marble_01/rough.jpg',
    'tex/terracotta_floor_tiles/diff.jpg',
    'tex/terracotta_floor_tiles/nor.jpg',
    'tex/terracotta_floor_tiles/rough.jpg',
    'tex/white_plaster_rough_01/diff.jpg',
    'tex/white_plaster_rough_01/nor.jpg',
    'tex/white_plaster_rough_01/rough.jpg',
  ],
};

const done = new Set<string>();
let queue: string[] = [];
let running = false;
/** While > 0 an arena the player picked is loading: background downloads wait so it gets the bandwidth. */
let holds = 0;
let wake: (() => void) | null = null;

/** Pause background downloads until the returned function is called. */
export function holdPrefetch(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (!holds && wake) {
      wake();
      wake = null;
    }
  };
}

type Conn = { saveData?: boolean; effectiveType?: string; type?: string };
const connection = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection;

/** False when downloading extra arenas would be unwelcome (Data Saver, very slow network). */
export function prefetchAllowed(): boolean {
  const c = connection();
  if (!c) return true;
  if (c.saveData) return false;
  return !(c.effectiveType && /(^|-)2g$/.test(c.effectiveType));
}

/**
 * Whether to prefetch every arena unprompted: computers on a normal connection, and phones/tablets only
 * when the browser reports Wi-Fi (on mobile data they prefetch only once the arena picker is opened).
 */
export function idlePrefetchOk(touch: boolean): boolean {
  if (!prefetchAllowed()) return false;
  const t = connection()?.type;
  if (touch) return t === 'wifi' || t === 'ethernet';
  return !t || t === 'wifi' || t === 'ethernet';
}

/** Every arena, in picker order. */
export const ALL_ARENAS = Object.keys(ARENA_FILES) as ArenaId[];

/** Queue the files for these arenas (in order); already fetched or queued files are skipped. */
export function prefetchArenas(ids: ArenaId[]) {
  if (!prefetchAllowed()) return;
  for (const id of ids) {
    for (const f of ARENA_FILES[id] ?? []) {
      const url = ASSET_ROOT + assetPath(f);
      if (!done.has(url) && !queue.includes(url)) queue.push(url);
    }
  }
  void pump();
}

/** Move one arena to the front of the queue (the player is about to pick it). */
export function prefetchFirst(id: ArenaId) {
  const urls = (ARENA_FILES[id] ?? []).map(f => ASSET_ROOT + assetPath(f)).filter(u => !done.has(u));
  queue = [...urls, ...queue.filter(u => !urls.includes(u))];
  void pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      if (holds) await new Promise<void>(r => (wake = r));
      const url = queue.shift()!;
      if (done.has(url)) continue;
      done.add(url);
      try {
        // Same URL and credentials the loaders use, so the real load is served from the HTTP cache.
        await fetch(url, { priority: 'low' } as RequestInit).then(r => r.arrayBuffer());
      } catch {
        done.delete(url); // Network hiccup: the real load will fetch it.
      }
    }
  } finally {
    running = false;
  }
}

/** Mark files the game itself loaded (no need to prefetch them again). */
export function markLoaded(url: string) {
  done.add(url);
}
