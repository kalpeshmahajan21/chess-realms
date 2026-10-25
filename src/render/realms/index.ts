import type { ArenaId } from '../../audio/soundEngine.ts';
import type { RealmFactory } from './types.ts';
import { createLibrary } from './LibraryRealm.ts';
import { createStadium } from './photoRealms.ts';
import { createSpace } from './SpaceRealm.ts';
import { createPalace } from './PalaceRealm.ts';
import { createKyoto } from './KyotoRealm.ts';
import { createMetropolis } from './MetropolisRealm.ts';
import { createDesert } from './EgyptRealm.ts';
import { createCafe } from './CafeRealm.ts';

/**
 * Realistic arenas, all built in 3D around the board. Arena ids are kept from v1 so saved setups,
 * ambient audio loops and records keep working:
 *   traditional → Grand Library, india → Palace Courtyard (Rajput palace), chess_arena → Football Stadium,
 *   shadow_dungeon → Deep Space, japan → Kyoto Garden, usa → Metropolis Night (rooftop helipad),
 *   egypt → Pharaoh Sands (temple + pyramids), royal_kingdom → Spanish Café.
 */
export const REALM_FACTORIES: Partial<Record<ArenaId, RealmFactory>> = {
  traditional: createLibrary,
  india: createPalace,
  chess_arena: createStadium,
  shadow_dungeon: createSpace,
  japan: createKyoto,
  usa: createMetropolis,
  egypt: createDesert,
  royal_kingdom: createCafe,
};
