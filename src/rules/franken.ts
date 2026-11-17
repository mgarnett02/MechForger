/**
 * FrankenMeks (Campaign Operations, as MegaMek implements them): 'Mechs assembled from locations of
 * different donor 'Mechs. Each location keeps its donor's structure type, tech base and tonnage:
 * - structure points come from the donor tonnage's structure table row;
 * - structure weight is the sum, over locations, of the donor's full structure weight times the
 *   location's share (head 5%, center torso 25%, side torsos 15% each, arms and legs 10% each),
 *   rounded up to the half ton;
 * - Endo Steel / Endo-Composite slots sit in their own location (Inner Sphere Endo Steel: head 1,
 *   center torso 1, side torsos 3, arms 2, legs 1; Clan Endo Steel and Endo-Composite: 1 per location
 *   except the head);
 * - jump jets weigh as on a 'Mech of their location's donor tonnage (at most the center torso's);
 * - armor maximums follow each location's structure points;
 * - the legs must come from donors at least as heavy as the center torso's, no location may exceed
 *   100 tons unless the center torso does, and a FrankenMek cannot be an OmniMech.
 */
import type { FrankenLocation, Location, MechDesign } from './types';
import { legLocations, mechLocations } from './types';
import { HEAD_ARMOR_MAX, internalStructure, internalStructureWeight, jumpJetWeightFor } from './tables';

export type { FrankenLocation };

/** Each location's share of a full 'Mech's structure weight. */
const WEIGHT_SHARE: Partial<Record<Location, number>> = { HD: 0.05, CT: 0.25, LT: 0.15, RT: 0.15, LA: 0.1, RA: 0.1, LL: 0.1, RL: 0.1 };

/** The donor record of a location (the design's own structure and tonnage when none is set). */
export function frankenLocation(d: Pick<MechDesign, 'franken' | 'structureType' | 'tonnage' | 'techBase'>, loc: Location): FrankenLocation {
  return d.franken?.[loc] ?? { type: d.structureType, tech: d.techBase, tonnage: d.tonnage };
}

/** Structure points per location, from each location's donor tonnage. */
export function frankenStructurePoints(d: MechDesign, quad: boolean, tripod: boolean): Record<Location, number> {
  const out = { HD: 0, CT: 0, LT: 0, RT: 0, LA: 0, RA: 0, LL: 0, RL: 0, CL: 0 } as Record<Location, number>;
  for (const loc of mechLocations(d)) {
    const row = internalStructure(nearestTonnage(frankenLocation(d, loc).tonnage), quad, tripod);
    out[loc] = row ? row[loc] : 0;
  }
  return out;
}

/** Donor tonnages off the 5-ton grid use the next row up (as MegaMek). */
const nearestTonnage = (t: number) => Math.max(10, Math.min(200, Math.ceil(t / 5) * 5));

/** Structure weight: each location's share of its donor's full structure weight, rounded up to the half ton. */
export function frankenStructureWeight(d: MechDesign): number {
  let w = 0;
  for (const loc of mechLocations(d)) {
    const share = WEIGHT_SHARE[loc];
    if (!share) continue;
    const f = frankenLocation(d, loc);
    w += internalStructureWeight(f.type, f.tonnage) * share;
  }
  return Math.ceil(Math.round(w * 1e6) / 1e6 * 2 - 1e-9) / 2;
}

/** Endo Steel / Endo-Composite slots each location must hold. */
export function frankenStructureSlots(d: MechDesign, loc: Location): number {
  const f = frankenLocation(d, loc);
  const compact = f.type === 'endo-composite' || (f.type === 'endo-steel' && f.tech === 'Clan');
  if (compact) return loc === 'HD' ? 0 : 1;
  if (f.type !== 'endo-steel') return 0;
  if (loc === 'HD' || loc === 'CT') return 1;
  if (loc === 'LT' || loc === 'RT') return 3;
  return legLocations(d).includes(loc) ? 1 : 2;
}

/** Armor maximum per location: twice the structure points (head 9). */
export function frankenArmorMax(d: MechDesign, structure: Record<Location, number>): Record<Location, number> {
  const out = {} as Record<Location, number>;
  for (const loc of Object.keys(structure) as Location[]) {
    out[loc] = !structure[loc] ? 0 : loc === 'HD' ? (frankenLocation(d, 'HD').tonnage > 100 ? 12 : HEAD_ARMOR_MAX) : structure[loc] * 2;
  }
  return out;
}

/** Weight of one jump jet in a location: by the location's donor tonnage, at most the center torso's. */
export function frankenJumpJetWeight(d: MechDesign, loc: Location | null): number {
  const ct = frankenLocation(d, 'CT').tonnage;
  const t = loc ? Math.min(frankenLocation(d, loc).tonnage, ct) : ct;
  return jumpJetWeightFor(d.jumpJetType, t);
}

/** Construction errors particular to FrankenMeks (as MegaMek's validator). */
export function frankenErrors(d: MechDesign): string[] {
  const errors: string[] = [];
  if (d.omni) errors.push('FrankenMeks cannot be OmniMechs.');
  const ct = frankenLocation(d, 'CT').tonnage;
  for (const loc of mechLocations(d)) {
    if (loc === 'CT') continue;
    const t = frankenLocation(d, loc).tonnage;
    if (ct <= 100 && t > 100) errors.push(`The ${loc} donor (${t} t) exceeds 100 tons while the center torso's is 100 tons or less.`);
    if (legLocations(d).includes(loc) && t < ct) errors.push(`The ${loc} donor (${t} t) is lighter than the center torso's (${ct} t).`);
  }
  for (const loc of mechLocations(d)) {
    const t = frankenLocation(d, loc).tonnage;
    if (!Number.isInteger(t) || t < 10 || t > 200) errors.push(`The ${loc} donor tonnage must be a whole number from 10 to 200.`);
  }
  return errors;
}
