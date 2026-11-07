import type { ArmorAllocation, ArmorFacing, Location } from './types';
import { LOCATIONS, REAR_FACING } from './types';
import { ARMOR_POINTS_PER_TON, HEAD_ARMOR_MAX, internalStructure } from './tables';

/** Maximum armor per location (torso values cover front + rear combined). */
export function maxArmorByLocation(tonnage: number): Record<Location, number> {
  const is = internalStructure(tonnage);
  const out = {} as Record<Location, number>;
  for (const loc of LOCATIONS) {
    out[loc] = !is ? 0 : loc === 'HD' ? HEAD_ARMOR_MAX : is[loc] * 2;
  }
  return out;
}

export function maxTotalArmor(tonnage: number): number {
  return Object.values(maxArmorByLocation(tonnage)).reduce((a, b) => a + b, 0);
}

export function emptyArmor(): ArmorAllocation {
  return { HD: 0, CT: 0, CTR: 0, LT: 0, LTR: 0, RT: 0, RTR: 0, LA: 0, RA: 0, LL: 0, RL: 0 };
}

export function totalArmorPoints(armor: ArmorAllocation): number {
  return Object.values(armor).reduce((a, b) => a + b, 0);
}

/** Armor points on a location, counting rear armor for torsos. */
export function locationArmor(armor: ArmorAllocation, loc: Location): number {
  const rear = REAR_FACING[loc];
  return armor[loc] + (rear ? armor[rear] : 0);
}

/** Standard armor is bought in half-ton increments of 8 points. */
export function armorTonnage(points: number): number {
  return Math.ceil((points / ARMOR_POINTS_PER_TON) * 2) / 2;
}

const FILL_ORDER: Location[] = ['CT', 'LT', 'RT', 'LL', 'RL', 'LA', 'RA', 'HD'];

/**
 * Spread `points` of armor across the mech in proportion to each location's
 * maximum. Torso armor is split roughly 3:1 front/rear.
 */
export function distributeArmor(tonnage: number, points: number): ArmorAllocation {
  const max = maxArmorByLocation(tonnage);
  const maxTotal = maxTotalArmor(tonnage);
  const target = Math.max(0, Math.min(Math.floor(points), maxTotal));
  const perLoc = {} as Record<Location, number>;
  let used = 0;
  for (const loc of LOCATIONS) {
    perLoc[loc] = maxTotal ? Math.floor((max[loc] * target) / maxTotal) : 0;
    used += perLoc[loc];
  }
  let remaining = target - used;
  while (remaining > 0) {
    let placed = false;
    for (const loc of FILL_ORDER) {
      if (remaining === 0) break;
      if (perLoc[loc] < max[loc]) {
        perLoc[loc]++;
        remaining--;
        placed = true;
      }
    }
    if (!placed) break;
  }
  const out = emptyArmor();
  for (const loc of LOCATIONS) {
    const rear = REAR_FACING[loc];
    if (rear) {
      const rearPts = Math.floor(perLoc[loc] / 4);
      out[rear as ArmorFacing] = rearPts;
      out[loc] = perLoc[loc] - rearPts;
    } else {
      out[loc] = perLoc[loc];
    }
  }
  return out;
}
