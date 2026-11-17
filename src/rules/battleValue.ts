/**
 * Battle Value (BV 2.0) and C-bill cost.
 *
 * BattleMech BV and cost follow the TechManual formulas and reproduce the
 * published values of canon designs (see tests). Combat vehicle BV and cost
 * follow the same structure with vehicle modifiers but are flagged as
 * approximate.
 */
import type { EffectiveCockpit, Location, MechDesign } from './types';
import { LOCATIONS, REAR_FACING, armorTypeAt, effectiveCockpit, isIndustrial, isPatchwork, isQuad, isQuadVee, isSuperheavy, isTripod, legLocations, mechLocations, techOf } from './types';
import type { Equipment } from './equipment';
import { canArmor, getEquipment, isArtemisVCapable, isDirectFire, isPPC, itemSlots, itemWeight } from './equipment';
import { armoredSystemSlots, computeMech, fixedSlots } from './construction';
import { armorPointsPerTon, engineSideTorsoSlots, isLargeEngine } from './tables';
import { meleeBV, meleeCost } from './melee';
import { svClipExtras } from './svWeapons';
import type { FighterDesign } from './fighter';
import { computeFighter, fighterItemWeight } from './fighter';
import type { VesselDesign, VesselItem } from './vessel';
import { BAY_INFO, VESSEL_ARMOR_COST, bayWeight, isPrimitiveVessel, vesselFormulaCost, VESSEL_TYPE_NAMES, computeVessel, isLargeCraft, kfIntegrity, shotsPerBin, vesselItemWeight } from './vessel';
import type { VehicleDesign } from './vehicle';
import { computeVehicle, vehicleCargoCost, vehicleItemWeight } from './vehicle';
import type { SupportVehicleDesign } from './support';
import { SV_TYPES, computeSupport, svCruiseMP, svItemWeight, svStructureForCost, svTransportCost } from './support';
import { DEFENSIVE_IDS, ITEM_VALUES, MML_AMMO_BV, isGaussType } from './values';

export interface BVBreakdown {
  total: number;
  defensive: number;
  offensive: number;
  /** Named contributions, for showing the working. */
  lines: [string, number][];
  approximate: boolean;
}

export interface CostBreakdown {
  total: number;
  lines: [string, number][];
  approximate: boolean;
}

/** Target movement modifier for a number of hexes moved. */
export function targetMovementModifier(mp: number): number {
  if (mp <= 2) return 0;
  if (mp <= 4) return 1;
  if (mp <= 6) return 2;
  if (mp <= 9) return 3;
  if (mp <= 17) return 4;
  if (mp <= 24) return 5;
  return 6;
}

/** Speed factor: (1 + (MP − 5) / 10) ^ 1.2, rounded to two decimals. */
export function speedFactor(mp: number): number {
  return Math.round(Math.pow(1 + (mp - 5) / 10, 1.2) * 100) / 100;
}

export function value(id: string) {
  return ITEM_VALUES[id];
}

/** BV and cost of one ammo bin (half-ton bins count half). */
export function ammoValue(eq: Equipment): { bv: number; cost: number } {
  if (eq.shotBV !== undefined) return { bv: eq.shotBV, cost: eq.shotCost ?? 0 }; // capital ammo: per shot
  const weapon = eq.ammoFor ?? '';
  // Half-ton bins count half; heavier bins (cruise missiles) are one load each (MegaMek).
  const scale = Math.min(1, eq.tons);
  if (MML_AMMO_BV[weapon]) {
    const srm = /-srm(-|$)/.test(eq.id);
    return { bv: MML_AMMO_BV[weapon][srm ? 1 : 0] * scale, cost: (srm ? 27000 : 30000) * scale * (eq.munitionCost ?? 1) };
  }
  const w = value(weapon);
  let bv = (w?.ammoBV ?? 0) * scale * (eq.munitionBV ?? 1);
  if (eq.munitionCostPerTon !== undefined) return { bv, cost: eq.munitionCostPerTon * scale };
  if (eq.munitionCost !== undefined) return { bv, cost: (w?.ammoCost ?? 0) * scale * eq.munitionCost };
  // MegaMek gives Artemis-capable ammunition the same BV as standard ammunition.
  // Artemis IV- and V-capable ammunition costs twice as much (MegaMek).
  // Flak autocannon ammunition costs 1.5 times as much.
  return { bv, cost: (w?.ammoCost ?? 0) * scale * (eq.artemisVAmmo || eq.artemisAmmo ? 2 : eq.flakAmmo ? 1.5 : 1) };
}

/** Heat a weapon counts for in the BV heat calculation. */
/**
 * Ammunition that can explode: not Gauss slugs, plasma, fluid gun loads, nails and rivets or C3 remote sensors
 * (as MegaMek).
 */
function isExplosiveAmmo(eq: Equipment): boolean {
  return eq.category === 'Ammo' && !!eq.ammoFor && !isGaussType(eq.ammoFor) && !/plasma|fluid-gun|nail-rivet-gun|c3-remote-sensor/.test(eq.ammoFor);
}

function bvHeat(eq: Equipment): number {
  // One-shot launchers, rocket launchers included, count a quarter of their heat (MegaMek).
  if (eq.oneShot || /(^|-)rl-\d+/.test(eq.id)) return eq.heat / 4;
  if (/(^|-)uac-/.test(eq.id)) return eq.heat * 2;
  if (/(^|-)rac-/.test(eq.id)) return eq.heat * 6;
  // Streak launchers and improved ATMs (which fire like Streaks) count half their heat (MegaMek).
  if (/streak|(^|-)iatm-/.test(eq.id)) return eq.heat / 2;
  // Prototype lasers with 1d6 extra heat count half of it (+3) for BV (MegaMek).
  if (eq.id === 'er-large-laser-prototype' || eq.id === 'medium-pulse-laser-prototype') return eq.heat + 3;
  return eq.heat;
}

interface WeaponEntry {
  bv: number;
  heat: number;
  rear: boolean;
  id: string;
  loc?: string | null;
  turret?: boolean;
}

/** Weapon BV with targeting-computer and Artemis IV bonuses. */
export function weaponEntries(
  items: { equipmentId: string; location: string | null; rear?: boolean; turret?: boolean }[],
  /** Vehicles: Artemis links to a launcher in any location. */
  artemisAnywhere = false,
): WeaponEntry[] {
  const ids = items.map((i) => i.equipmentId);
  const hasTC = ids.some((id) => getEquipment(id)?.variableWeight === 'targetingComputer');
  // A Drone Operating System rates every weapon at 80% (MegaMek).
  const drone = ids.includes('drone-os') ? 0.8 : 1;
  // Artemis IV pairs with launchers in the same location (vehicles: anywhere).
  // Artemis V links first (to Clan LRM/SRM launchers), then Artemis IV.
  const artemisLeft = new Map<string, number>();
  const artemisVLeft = new Map<string, number>();
  for (const i of items) {
    const ak = artemisAnywhere ? '' : i.location ?? '';
    if (i.equipmentId === 'clan-artemis-v') artemisVLeft.set(ak, (artemisVLeft.get(ak) ?? 0) + 1);
    if (i.equipmentId === 'artemis-iv' || i.equipmentId === 'clan-artemis-iv') {
      const k = ak;
      artemisLeft.set(k, (artemisLeft.get(k) ?? 0) + 1);
    }
  }
  const capacitorsLeft = capacitorCounts(artemisAnywhere ? items.map((i) => ({ ...i, location: null })) : items);
  // Apollo FCS: ×1.15 for an MRM launcher in the same location.
  const insulatorsLeft = new Map<string, number>();
  for (const i of items) if (i.equipmentId === 'laser-insulator') insulatorsLeft.set(i.location ?? '', (insulatorsLeft.get(i.location ?? '') ?? 0) + 1);
  const pulseModulesLeft = new Map<string, number>();
  // Where Artemis links anywhere (vehicles), so do Apollo and laser pulse modules.
  const linkKey = (i: { location?: string | null }) => (artemisAnywhere ? '' : i.location ?? '');
  for (const i of items) if (i.equipmentId === 'risc-laser-pulse-module') pulseModulesLeft.set(linkKey(i), (pulseModulesLeft.get(linkKey(i)) ?? 0) + 1);
  const apolloLeft = new Map<string, number>();
  for (const i of items) if (i.equipmentId === 'apollo-fcs') apolloLeft.set(linkKey(i), (apolloLeft.get(linkKey(i)) ?? 0) + 1);
  const out: WeaponEntry[] = [];
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || !eq.isWeapon || DEFENSIVE_IDS.has(eq.id)) continue;
    let bv = value(eq.id)?.bv ?? 0;
    let heat = bvHeat(eq);
    // A RISC laser pulse module in the same location: the laser counts ×1.15 and +2 heat (as MegaMek).
    if (/laser/.test(eq.id) && !/pulse/.test(eq.id) && !eq.ammoPerTon && (pulseModulesLeft.get(linkKey(i)) ?? 0) > 0) {
      pulseModulesLeft.set(linkKey(i), pulseModulesLeft.get(linkKey(i))! - 1);
      bv *= 1.15;
      heat += 2;
    }
    // A laser insulator in the same location takes 1 heat off a laser (to a minimum of 1).
    if (/laser/.test(eq.id) && !eq.ammoPerTon && (insulatorsLeft.get(i.location ?? '') ?? 0) > 0) {
      insulatorsLeft.set(i.location ?? '', insulatorsLeft.get(i.location ?? '')! - 1);
      heat = Math.max(1, heat - 1);
    }
    // Machine gun arrays: 0.67 × the BV of up to four machine guns of their type in the same location (as MegaMek).
    const mga = /^(clan-)?(light-|heavy-)?mga$/.exec(eq.id);
    if (mga) {
      const mgId = `${mga[1] ?? ''}${mga[2] ?? ''}machine-gun`;
      const linked = items.filter((x) => x.equipmentId === mgId && x.location === i.location).length;
      bv = 0.67 * Math.min(4, linked) * (value(mgId)?.bv ?? 0);
    }
    if (/^mrm-/.test(eq.id) && (apolloLeft.get(linkKey(i)) ?? 0) > 0) {
      apolloLeft.set(linkKey(i), apolloLeft.get(linkKey(i))! - 1);
      bv *= 1.15;
    }
    // A PPC Capacitor adds its BV to the linked PPC (as MegaMek) and 5 heat.
    if (takeCapacitor(capacitorsLeft, artemisAnywhere ? { ...i, location: null } : i)) {
      bv += CAPACITOR_BV[eq.id] ?? 0;
      heat += 5;
    }
    if (hasTC && isDirectFire(eq)) bv *= 1.25;
    const k = artemisAnywhere ? '' : i.location ?? '';
    if (isArtemisVCapable(eq.id) && (artemisVLeft.get(k) ?? 0) > 0) {
      artemisVLeft.set(k, artemisVLeft.get(k)! - 1);
      bv *= 1.3;
    } else if (eq.artemisCapable && (artemisLeft.get(k) ?? 0) > 0) {
      artemisLeft.set(k, artemisLeft.get(k)! - 1);
      bv *= 1.2;
    }
    // Prototype weapons that share a standard weapon's ammunition are capped together with it.
    out.push({ bv: bv * drone, heat, rear: !!i.rear, id: eq.ammoOf ?? eq.id, loc: i.location, ...(i.turret ? { turret: true } : {}) });
  }
  return out;
}

/** BV a PPC Capacitor adds to each kind of PPC (MegaMek). */
const CAPACITOR_BV: Record<string, number> = {
  'light-ppc': 44, ppc: 88, 'heavy-ppc': 53, 'snub-nose-ppc': 87, 'er-ppc': 114, 'clan-er-ppc': 136,
};

/** PPC Capacitors per location, to be linked to that location's PPCs in turn. */
function capacitorCounts(items: { equipmentId: string; location: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) {
    if (/ppc-capacitor$/.test(i.equipmentId)) m.set(i.location ?? '', (m.get(i.location ?? '') ?? 0) + 1);
  }
  return m;
}

/** Link a capacitor to this PPC if one is left in its location. */
function takeCapacitor(left: Map<string, number>, i: { equipmentId: string; location: string | null }): boolean {
  if (!isPPC(i.equipmentId)) return false;
  const k = i.location ?? '';
  if ((left.get(k) ?? 0) <= 0) return false;
  left.set(k, left.get(k)! - 1);
  return true;
}

/** Ammo BV, capped per weapon type at the BV of the weapons that use it. */
/**
 * Ammunition counts up to the BV of the weapons that fire it: their listed BV, before Artemis, targeting
 * computer or arc adjustments (as MegaMek).
 */
function ammoCap(weapons: WeaponEntry[], weaponId: string): number {
  return weapons.filter((w) => w.id === weaponId).reduce((a, w) => a + (value(w.id)?.bv ?? w.bv), 0);
}

export function ammoBV(items: { equipmentId: string }[], weapons: WeaponEntry[]): number {
  const perWeapon = new Map<string, number>();
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq?.ammoFor || DEFENSIVE_IDS.has(eq.ammoFor)) continue;
    perWeapon.set(eq.ammoFor, (perWeapon.get(eq.ammoFor) ?? 0) + ammoValue(eq).bv);
  }
  let total = 0;
  for (const [weaponId, bv] of perWeapon) {
    total += Math.min(bv, ammoCap(weapons, weaponId));
  }
  return total;
}

/** BV of defensive equipment (AMS, ECM, active probes) and AMS ammo. */
const SHIELDS = new Set(['small-shield', 'medium-shield', 'large-shield']);

export function defensiveEquipmentBV(items: { equipmentId: string; shots?: number }[]): number {
  let equipment = 0;
  let amsAmmo = 0;
  let screenAmmo = 0;
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq) continue;
    if (DEFENSIVE_IDS.has(eq.id)) equipment += value(eq.id)?.bv ?? 0;
    // Spacecraft store ammunition as shots: count every full bin (as offensive ammunition does).
    else if (eq.ammoFor && DEFENSIVE_IDS.has(eq.ammoFor)) {
      const bv = ammoValue(eq).bv * (i.shots ? Math.max(1, Math.floor(i.shots / shotsPerBin(eq))) : 1);
      amsAmmo += bv;
      if (eq.ammoFor === 'screen-launcher') screenAmmo += bv;
    }
  }
  const amsBV = items
    .filter((i) => i.equipmentId === 'ams' || i.equipmentId === 'clan-ams' || i.equipmentId === 'apds')
    .reduce((a, i) => a + (value(i.equipmentId)?.bv ?? 0), 0);
  // Screen launchers are defensive, their ammunition capped at the launchers' BV (MegaMek).
  const screenBV = items.filter((i) => i.equipmentId === 'screen-launcher').reduce((a) => a + (value('screen-launcher')?.bv ?? 0), 0);
  return equipment + Math.min(amsAmmo - screenAmmo, amsBV) + Math.min(screenAmmo, screenBV);
}

const round = (n: number) => Math.round(n);

/** Armored slots: [system slots, item slots] (for cost). */
function armoredSlotCounts(d: MechDesign): [number, number] {
  const sys = LOCATIONS.reduce((a, l) => a + armoredSystemSlots(d, l).length, 0);
  const items = d.equipment.reduce((a, i) => {
    const eq = i.armored && getEquipment(i.equipmentId);
    return eq && canArmor(eq) ? a + itemSlots(eq, d) : a;
  }, 0);
  return [sys, items];
}

/**
 * Armored component BV (as MegaMek): 5% of an item's BV per slot (a PPC with a capacitor counts both,
 * over one more slot), or 5 per slot for items without BV; an armored gyro slot adds 5% of the gyro's
 * BV (tonnage × 0.5, or × 1 heavy-duty), any other armored system slot 5.
 */
function armoredComponentBV(d: MechDesign): number {
  let bv = 0;
  const caps = capacitorCounts(d.equipment);
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    const linked = takeCapacitor(caps, item);
    if (!eq || !item.armored || !canArmor(eq) || /ppc-capacitor$/.test(eq.id)) continue;
    const slots = itemSlots(eq, d);
    const base = eq.melee ? meleeBV(eq.melee, d) : eq.category === 'Ammo' ? ammoValue(eq).bv : value(eq.id)?.bv ?? 0;
    if (linked) bv += (base + (CAPACITOR_BV[eq.id] ?? 0)) * 0.05 * (slots + 1);
    else bv += base > 0 ? base * 0.05 * slots : 5 * slots;
  }
  for (const loc of LOCATIONS) {
    const fixed = fixedSlots(d, loc);
    for (const i of armoredSystemSlots(d, loc)) {
      bv += /Gyro/.test(fixed[i]!) ? d.tonnage * (d.gyroType === 'heavy-duty' ? 1 : 0.5) * 0.05 : 5;
    }
  }
  return bv;
}

// ---------------------------------------------------------------------------
// BattleMechs
// ---------------------------------------------------------------------------

export function mechBV(d: MechDesign): BVBreakdown {
  const s = computeMech(d);
  const lines: [string, number][] = [];
  const isClan = d.techBase === 'Clan';

  // --- Defensive battle rating
  // A torso-mounted cockpit counts the center torso armor twice.
  const cockpitArmor = d.cockpitType === 'torso-mounted' || d.cockpitType === 'vrrp' ? d.armor.CT + d.armor.CTR : 0;
  // Commercial armor has a barrier armor rating of 5 (half value).
  // A Blue Shield adds 0.2 to the armor and structure multipliers (Tactical Operations, as MegaMek).
  const blueShield = d.equipment.some((e) => e.equipmentId === 'blue-shield') ? 0.2 : 0;
  const bar = 1;
  // Modular armor: 10 extra armor points each.
  const modular = 10 * d.equipment.filter((e) => e.equipmentId === 'modular-armor').length;
  const armorMult = (t: MechDesign['armorType']) => (ARMOR_BV_MULTIPLIER[t] ?? 1) * (t === 'commercial' ? 0.5 : 1) + blueShield;
  // Patchwork armor: each location's points at its own armor's multiplier.
  const armor = isPatchwork(d)
    ? (LOCATIONS.reduce((a, l) => a + locPoints(d, l) * armorMult(armorTypeAt(d, l)), 0) + (cockpitArmor + modular) * armorMult(d.armorType)) * 2.5 * bar
    : (s.armorTotal + cockpitArmor + modular) * 2.5 * armorMult(d.armorType) * bar;
  // HarJel II / III: the armor in their location counts ×1.1 / ×1.2 (MegaMek).
  const harjel = d.equipment.reduce((a, e) => {
    const m = e.equipmentId === 'harjel-ii' ? 0.1 : e.equipmentId === 'harjel-iii' ? 0.2 : 0;
    return m && e.location ? a + locPoints(d, e.location as Location) * 2.5 * armorMult(d.armorType) * bar * m : a;
  }, 0);
  const isPoints = s.structure ? LOCATIONS.reduce((a, l) => a + s.structure![l], 0) : 0;
  // Engine multiplier from the side-torso engine slots (as MegaMek; superheavies have half as many):
  // 6+ → 0.25, 3+ → 0.5, 2 → 0.75, 1 → 0.825.
  const sideSlots = engineSideTorsoSlots(d.engineType, techOf(d, 'engine'), isSuperheavy(d));
  const engineMod = sideSlots >= 6 ? 0.25 : sideSlots >= 3 ? 0.5 : sideSlots === 2 ? 0.75 : sideSlots === 1 ? 0.825 : 1;
  const structureMod = (d.structureType === 'composite' || d.structureType === 'industrial' ? 0.5 : d.structureType === 'reinforced' ? 2 : 1) + blueShield;
  const structure = isPoints * 1.5 * structureMod * engineMod;
  const gyro = d.tonnage * (d.gyroType === 'heavy-duty' ? 1 : 0.5);
  // Spikes (4 each) and shields (small 50, medium 135, large 263) are defensive equipment (Tactical Operations, MegaMek).
  const defEquip = defensiveEquipmentBV(d.equipment) + d.equipment.reduce((a, e) => {
    const m = getEquipment(e.equipmentId)?.melee;
    return a + (m === 'spikes' || (m && SHIELDS.has(m)) ? meleeBV(m, d) : 0);
  }, 0);
  const armoredBV = armoredComponentBV(d);

  // Explosive ammo (−15 per slot) and Gauss weapons (−1 per slot) where CASE does not protect.
  // As MegaMek: CASE II protects any location; CASE protects arms and side torsos unless the side torso
  // holds 3+ engine slots (IS XL, any XXL); arms are protected by CASE in the arm or its side torso.
  const at = (ids: string[]) => new Set(d.equipment.filter((e) => ids.includes(e.equipmentId)).map((e) => e.location));
  const caseII = at(['case-ii', 'clan-case-ii']);
  const caseIn = at(['case', 'clan-case']);
  const hasCase = (loc: Location) => isClan || caseIn.has(loc) || caseII.has(loc);
  const protectedLoc = (loc: Location): boolean => {
    if (caseII.has(loc)) return true;
    if (loc === 'CT' || loc === 'HD' || legLocations(d).includes(loc)) return false;
    if (loc === 'LT' || loc === 'RT') return hasCase(loc) && sideSlots < 3;
    return hasCase(loc) || protectedLoc(loc === 'LA' ? 'LT' : 'RT');
  };
  let explosive = 0;
  // A Blue Shield is explosive: −1 for each location it fills (all but the head) that CASE does not protect
  // (as MegaMek: CASE II anywhere; with an engine of at most 2 side-torso slots, CASE in a side torso and CASE in
  // an arm or its side torso; Clan arms always).
  if (blueShield) {
    const bsSafe = (loc: Location): boolean => {
      if (caseII.has(loc)) return true;
      const arm = loc === 'LA' || loc === 'RA';
      const torso = loc === 'LT' || loc === 'RT';
      if (isClan) return arm || (torso && sideSlots <= 2);
      if (sideSlots > 2) return false;
      if (torso) return caseIn.has(loc);
      return arm && (caseIn.has(loc) || caseIn.has(loc === 'LA' ? 'LT' : 'RT'));
    };
    explosive += mechLocations(d).filter((l: Location) => l !== 'HD' && l !== 'CL' && !bsSafe(l)).length;
  }
  const capsLeft = capacitorCounts(d.equipment);
  // Superheavies: penalties count the slots actually filled (half as many; two tons of ammo share one).
  const pairedAmmo = new Set(Object.values(s.slots).flatMap((l) => l.slots.map((x) => x.uid2).filter((u): u is string => !!u)));
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    // A split weapon is a hazard if either of its locations is unprotected.
    if (!eq || !item.location || (protectedLoc(item.location) && (!item.split || protectedLoc(item.split.location)))) continue;
    const slots = itemSlots(eq, d);
    if (isExplosiveAmmo(eq)) explosive += pairedAmmo.has(item.uid) ? 0 : 15;
    // HVACs: −1 in all, whatever their slots (MegaMek).
    else if (/^hvac-\d+$/.test(eq.id)) explosive += 1;
    else if (eq.explosiveLow) explosive += slots;
    else if (eq.explosive) explosive += 15 * slots;
    // A PPC with a capacitor is explosive too (−1 per slot).
    else if (takeCapacitor(capsLeft, item)) explosive += slots;
    else if (eq.isWeapon && isGaussType(eq.id)) explosive += slots;
  }

  // MASC / supercharger running MP doubles the walking MP including TSM's +1 when both are fitted (as MegaMek).
  const fitted = (id: string) => d.equipment.some((e) => e.equipmentId === id);
  const boostFactor = (fitted('masc') || fitted('clan-masc')) && fitted('supercharger') ? 2.5 : 2;
  const run = s.mascRunMP !== null && s.tsmMP
    ? s.mascRunMP + Math.ceil(s.tsmMP.walk * boostFactor) - Math.ceil((s.tsmMP.walk - 1) * boostFactor)
    : s.mascRunMP ?? s.tsmMP?.run ?? s.runMP;
  // Jumping MP includes a partial wing's bonus (as MegaMek's BV calculation); mechanical jump boosters count
  // when they jump further (less a medium shield each, none with a large shield). BV ignores modular armor's
  // movement penalty (as MegaMek: the armor can be shed), so its lost jump MP is added back.
  const modularJump = s.jumpMP > 0 && !d.equipment.some((e) => e.equipmentId === 'large-shield') && d.equipment.some((e) => e.equipmentId === 'modular-armor') ? 1 : 0;
  const boosterMP = d.jumpBoosterMP && !d.equipment.some((e) => e.equipmentId === 'large-shield')
    ? Math.max(0, d.jumpBoosterMP - d.equipment.filter((e) => e.equipmentId === 'medium-shield').length) : 0;
  const jump = Math.max(s.totalJumpMP + modularJump, boosterMP);
  // Standard LAMs are rated on AirMech flank speed, with +1 for being airborne (IO p. 192, as in MegaMek).
  const airMechFlank = d.lam === 'standard' ? s.lam?.airMech?.flank ?? 0 : null;
  const runTMM = airMechFlank !== null ? (airMechFlank ? targetMovementModifier(airMechFlank) + 1 : 0) : targetMovementModifier(run);
  // Stealth armor or a null-signature system: +2 TMM; a chameleon shield: +2; a void-signature system
  // raises the modifier to at least 3 (+1 if it is exactly 3), as MegaMek.
  const has = (id: string) => d.equipment.some((e) => e.equipmentId === id);
  const nullSig = has('null-signature-system');
  const voidSig = has('void-signature-system');
  const chameleon = has('chameleon-lps');
  // Patchwork stealth armor only counts when it covers every location but the head and center torso.
  const stealth = (isPatchwork(d) ? STEALTH_LOCS.every((l) => armorTypeAt(d, l) === 'stealth') : d.armorType === 'stealth') ? 2 : 0;
  // UMUs give their own (non-jump) modifier.
  let tmm = Math.max(runTMM, jump > 0 ? targetMovementModifier(jump) + 1 : 0, s.umuMP > 0 ? targetMovementModifier(s.umuMP) : 0)
    + (stealth || nullSig ? 2 : 0) + (chameleon ? 2 : 0);
  if (voidSig) tmm = tmm < 3 ? 3 : tmm === 3 ? 4 : tmm;
  const defensive = Math.max(1, armor + harjel + structure + gyro + defEquip + armoredBV - explosive) * (1 + tmm / 10);
  lines.push(['Armor', armor], ['Internal structure', structure], ['Gyro', gyro]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (armoredBV) lines.push(['Armored components', armoredBV]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  lines.push([`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);

  // --- Offensive battle rating (melee weapons count as heat-free, forward-facing weapons)
  const weapons = weaponEntries(d.equipment);
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    // Spikes and shields count as defensive equipment instead.
    // Vibroblades generate heat when active (small 3, medium 5, large 7), counted against heat efficiency (MegaMek).
    const meleeHeat = eq?.melee === 'small-vibroblade' ? 3 : eq?.melee === 'medium-vibroblade' ? 5 : eq?.melee === 'large-vibroblade' ? 7 : 0;
    if (eq?.melee && eq.melee !== 'spikes' && !SHIELDS.has(eq.melee)) weapons.push({ bv: meleeBV(eq.melee, d), heat: meleeHeat, rear: false, id: eq.id, loc: item.location });
  }
  // Ram plate: offensive equipment worth half the charge damage, +1 per torso spike, × 1.1 (MegaMek).
  const ramSpikes = d.equipment.filter((e) => e.equipmentId === 'spikes' && /T$/.test(e.location ?? '')).length;
  const ramPlate = d.equipment.some((e) => e.equipmentId === 'ram-plate')
    ? (Math.floor(Math.floor(d.tonnage * (s.mascRunMP ?? s.runMP) * 0.1) / 2) + ramSpikes) * 1.1 : 0; // running MP with MASC
  // Weapons (and melee weapons) in an arm with an Actuator Enhancement System: ×1.25.
  const aesArms = isQuad(d) ? new Set<string>() : new Set(d.equipment.filter((e) => e.equipmentId === 'aes' && (e.location === 'LA' || e.location === 'RA')).map((e) => e.location as string));
  for (const w of weapons) if (w.loc && aesArms.has(w.loc)) w.bv *= 1.25;
  // Turret and arm weapons (arms can flip) sit outside the front/rear comparison (MegaMek).
  const armLocs = isQuad(d) ? [] : ['LA', 'RA'];
  const arced = weapons.filter((w) => !w.turret && !armLocs.includes(w.loc ?? ''));
  const frontBV = arced.filter((w) => !w.rear).reduce((a, w) => a + w.bv, 0);
  const rearBV = arced.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  for (const w of arced) {
    if (rearBV > frontBV ? !w.rear : w.rear) w.bv /= 2;
  }
  const moveHeat = airMechFlank !== null ? Math.round(airMechFlank / 3) : Math.max(s.heat.running, s.heat.jumping);
  // Coolant pods: + ⌈heat sinks × pods / 5⌉ heat efficiency (as MegaMek).
  const coolantPods = d.equipment.filter((e) => e.equipmentId === 'coolant-pod').length;
  const coolant = coolantPods ? Math.ceil((s.heatSinks.total * coolantPods) / 5) : 0;
  // Radical heat sink system: + ⌈heat sinks × 0.4⌉ heat capacity (as MegaMek).
  const radical = has('radical-heat-sink') ? Math.ceil(s.heatSinks.total * 0.4) : 0;
  const heatEfficiency = 6 + s.heatSinks.dissipation + coolant + radical + (s.partialWing?.heatBonus ?? 0) + (airMechFlank !== null ? 3 : 0) - moveHeat
    - (stealth ? 10 : 0) - (nullSig ? 10 : 0) - (voidSig ? 10 : 0) - (chameleon ? 6 : 0);
  weapons.sort((a, b) => b.bv - a.bv || a.heat - b.heat);
  let heat = 0;
  let weaponBV = 0;
  for (const w of weapons) {
    // Weapons count in full until the running heat total reaches the mech's heat efficiency;
    // weapons that generate no heat always count in full.
    weaponBV += heat < heatEfficiency || w.heat === 0 ? w.bv : w.bv / 2;
    heat += w.heat;
  }
  const ammo = ammoBV(d.equipment, weapons);
  const offEquip = d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    return eq && !eq.isWeapon && eq.category !== 'Ammo' && !DEFENSIVE_IDS.has(eq.id) ? a + (value(eq.id)?.bv ?? 0) : a;
  }, 0) + ramPlate;
  // AES: +0.1 per arm, +0.2 (biped) / +0.4 (quad) when every leg has one (tripods get no leg bonus, as MegaMek).
  const legAES = !isTripod(d) && legLocations(d).every((l) => d.equipment.some((e) => e.equipmentId === 'aes' && e.location === l));
  const aesMod = 1 + 0.1 * aesArms.size + (legAES ? (isQuad(d) ? 0.4 : 0.2) : 0);
  const tonnage = d.tonnage * aesMod * (d.myomer === 'tsm' ? 1.5 : d.myomer === 'industrial-tsm' ? 1.15 : 1);
  const sf = speedFactor(run + Math.round((airMechFlank ?? Math.max(jump, s.umuMP)) / 2));
  // IndustrialMechs without advanced fire control: offensive rating × 0.9.
  const afcMod = d.cockpitType === 'industrial' || d.cockpitType === 'primitive-industrial' ? 0.9 : 1;
  const offensive = (weaponBV + ammo + offEquip + tonnage) * sf * afcMod;
  lines.push(['Weapons (heat-adjusted)', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push(['Tonnage', tonnage], ['Speed factor', sf]);
  if (afcMod !== 1) lines.push(['× 0.9 no advanced fire control', afcMod]);
  // Small and torso-mounted cockpits cost 5% of the total.
  // (A Drone Operating System also costs 5%; MegaMek applies one 0.95 modifier, not both.)
  const droneOS = d.equipment.some((e) => e.equipmentId === 'drone-os');
  // A virtual-reality piloting pod multiplies BV by 1.4 (IO:AE p.183); a RISC heat sink override kit by 1.01 (MegaMek).
  // An interface cockpit multiplies BV by 1.3 (MegaMek).
  const cockpitMod = d.cockpitType === 'vrrp' ? 1.4 : d.cockpitType === 'small' || d.cockpitType === 'torso-mounted' || droneOS ? 0.95
    : d.cockpitType === 'interface' ? 1.3 : 1;
  if (cockpitMod !== 1) lines.push([`× ${cockpitMod} ${d.cockpitType === 'vrrp' ? 'virtual-reality piloting pod' : d.cockpitType === 'small' ? 'small cockpit' : d.cockpitType === 'torso-mounted' ? 'torso-mounted cockpit' : d.cockpitType === 'interface' ? 'interface cockpit' : 'drone operating system'}`, cockpitMod]);
  const riscKit = d.heatSinkOverrideKit ? 1.01 : 1;
  if (riscKit !== 1) lines.push(['× 1.01 RISC heat sink override kit', riscKit]);

  return { total: round((defensive + offensive) * cockpitMod * riscKit), defensive, offensive, lines, approximate: false };
}

const ENGINE_COST: Record<string, number> = {
  standard: 5000, xl: 20000, xxl: 100000, light: 15000, compact: 10000, ice: 1250, 'fuel-cell': 3500, fission: 7500,
};
const GYRO_COST: Record<string, number> = { standard: 300000, xl: 750000, compact: 400000, 'heavy-duty': 500000, none: 0, superheavy: 500000 };
const ARMOR_COST: Record<string, number> = {
  standard: 10000, 'ferro-fibrous': 20000, 'ferro-prototype': 60000, 'light-ferro': 15000, 'heavy-ferro': 25000, stealth: 50000, reactive: 30000,
  reflective: 30000, hardened: 15000, 'ferro-lamellor': 35000, 'ballistic-reinforced': 25000, 'anti-penetrative': 15000,
  'heat-dissipating': 25000, 'impact-resistant': 20000, commercial: 3000, industrial: 5000, 'heavy-industrial': 10000, primitive: 5000,
};
/** Structure cost per ton of 'Mech (MegaMek). */
const STRUCTURE_COST: Record<string, number> = {
  standard: 400, 'endo-steel': 1600, 'endo-prototype': 4800, 'endo-composite': 3200, composite: 1600, reinforced: 6400, industrial: 300,
};
/** Superheavy structure cost per ton (MegaMek). */
const SUPERHEAVY_STRUCTURE_COST: Record<string, number> = {
  standard: 4000, industrial: 3000, 'endo-steel': 16000, composite: 1600, 'endo-composite': 6400,
};
/** Cockpit costs, including the superheavy, tripod and QuadVee cockpits (MegaMek). */
const COCKPIT_COST: Record<EffectiveCockpit, number> = {
  standard: 200000, small: 175000, 'torso-mounted': 750000, vrrp: 1250000, 'command-console': 700000, industrial: 100000, primitive: 200000,
  'primitive-industrial': 100000, interface: 200000, superheavy: 300000, 'superheavy-industrial': 200000,
  'superheavy-command-console': 800000, tripod: 400000, 'tripod-industrial': 300000, 'superheavy-tripod': 500000,
  'superheavy-tripod-industrial': 400000, quadvee: 375000,
};
/** Armor BV multipliers (MegaMek). */
const STEALTH_LOCS = ['LT', 'RT', 'LA', 'RA', 'LL', 'RL'] as const;
/** Front and rear armor points in a location. */
function locPoints(d: MechDesign, l: Location): number {
  const rear = REAR_FACING[l];
  return (d.armor[l] ?? 0) + (rear ? d.armor[rear] ?? 0 : 0);
}

const ARMOR_BV_MULTIPLIER: Partial<Record<MechDesign['armorType'], number>> = {
  hardened: 2, reactive: 1.5, reflective: 1.5, 'ballistic-reinforced': 1.5, 'ferro-lamellor': 1.2, 'anti-penetrative': 1.2,
  'heat-dissipating': 1.1,
};

/** Cost of mounted weapons, ammo and equipment. */
export function equipmentCost<T extends { equipmentId: string; location?: string | null }>(
  items: T[], weight: (eq: Equipment) => number, rating: number, mech?: MechDesign,
): number {
  let total = 0;
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || eq.managed) continue;
    if (eq.melee && mech) total += meleeCost(eq.melee, mech);
    // A vehicle's Blue Shield is a single piece costing the full 1,000,000 C-bills (MegaMek); a 'Mech's is spread over seven.
    else if (eq.id === 'blue-shield' && !mech) total += 1000000;
    else if (eq.category === 'Ammo') total += ammoValue(eq).cost;
    // Rocket launchers come with one load of rockets: 1,000 / 1,500 / 2,000 C-bills (TechManual p.229, MegaMek).
    else if (/(^|-)rl-(10|15|20)(-prototype)?$/.test(eq.id)) total += (value(eq.id)?.cost ?? 0) + { 10: 1000, 15: 1500, 20: 2000 }[Number(/rl-(\d+)/.exec(eq.id)![1]) as 10 | 15 | 20];
    else if (eq.variableWeight === 'masc') total += rating * weight(eq) * 1000;
    else if (eq.variableWeight === 'supercharger') total += rating * 10000;
    else if (eq.variableWeight === 'targetingComputer') total += weight(eq) * 10000;
    // AES: tonnage × 500 per arm, × 700 per leg; partial wing: 50,000 per ton.
    else if (eq.variableWeight === 'aes' && mech) total += mech.tonnage * (legLocations(mech).includes(i.location as Location) ? 700 : 500);
    else if (eq.variableWeight === 'partialWing') total += weight(eq) * 50000;
    else if (eq.variableWeight === 'droneOS') total += weight(eq) * 10000 + 5000;
    else if (eq.variableWeight === 'mechTurret') total += weight(eq) * 10000;
    else if (eq.variableWeight === 'pintleTurret') total += weight(eq) * 1000;
    else if (eq.variableWeight === 'ramPlate') total += weight(eq) * 10000;
    // SRCS: 10,000 per ton + 5,000 (shielded aerospace: 12,500 per ton + 6,250).
    else if (eq.variableWeight === 'srcs') total += eq.id.includes('shielded') ? weight(eq) * 12500 + 6250 : weight(eq) * 10000 + 5000;
    else if (eq.vehicleChassisMod) total += weight(eq) * (/armored-motive/.test(eq.id) ? 100000 : /amphibious/.test(eq.id) ? 10000 : 0);
    else if ((eq.variableWeight === 'tracks' || eq.variableWeight === 'wheels') && mech) {
      total += Math.ceil(((eq.variableWeight === 'wheels' ? 750 : 500) * rating * mech.tonnage) / 75) / legLocations(mech).length;
    }
    else total += value(eq.id)?.cost ?? 0;
  }
  return total;
}

/** Clan units pay for the CASE built into each location holding explosive items that has no CASE mounted (MegaMek). */
function implicitClanCase(d: { techBase: string; equipment: { equipmentId: string; location?: string | null; split?: { location: string } }[] }, perLocation = true): number {
  if (d.techBase !== 'Clan') return 0;
  const cased = new Set<string>();
  const locs = new Set<string>();
  for (const i of d.equipment) {
    const eq = getEquipment(i.equipmentId);
    if (!eq) continue;
    if (eq.id === 'case' || eq.id === 'clan-case') cased.add(i.location ?? '');
    else if ((isExplosiveAmmo(eq)) || (eq.isWeapon && isGaussType(eq.id)) || eq.explosive || eq.explosiveLow) {
      // A split weapon is explosive in both of its locations (MegaMek).
      locs.add(i.location ?? '');
      if (i.split) locs.add(i.split.location);
    }
  }
  // Vehicles keep ammunition and CASE in the body, not their real locations: count CASE against the total.
  return perLocation ? [...locs].filter((l) => !cased.has(l)).length : Math.max(0, locs.size - d.equipment.filter((i) => ['case', 'clan-case'].includes(i.equipmentId)).length);
}

export function mechCost(d: MechDesign): CostBreakdown {
  const s = computeMech(d);
  const t = d.tonnage;
  const quad = isQuad(d);
  const sh = isSuperheavy(d);
  const tripod = isTripod(d);
  const arms = quad ? 0 : (['LA', 'RA'] as const).reduce((a, arm) => {
    const act = d.actuators[arm];
    return a + 100 * t + (act.lowerArm ? 50 * t : 0) + (act.lowerArm && act.hand ? 80 * t : 0);
  }, 0);
  const jumpCost = (d.jumpJetType === 'improved' ? 500 : 200) * t * s.jumpMP ** 2 // prototype improved: 200 (MegaMek)
    // Mechanical jump boosters: MP² × tonnage × 150 (MegaMek).
    + (d.jumpBoosterMP ? d.jumpBoosterMP ** 2 * t * 150 : 0)
    // UMUs cost as jump jets: 200 × tonnage × MP² (TechManual, MegaMek).
    + 200 * t * s.umuMP ** 2;
  // MegaMek: every double heat sink is paid for; single heat sinks have 10 free (whatever the engine).
  // Compact heat sinks (MegaMek): 3,000 each for the sinks themselves, and the heat sink line is charged as
  // double heat sinks (6,000 each, none free) once a two-sink item is fitted.
  const compactHS = d.heatSinkType === 'single' && !!d.compactHeatSinks;
  const compactPair = compactHS && d.equipment.some((e) => e.equipmentId === 'compact-heat-sink-pair');
  const hsCost = (d.heatSinkType === 'double' || compactPair ? 6000 * s.heatSinks.total : 2000 * Math.max(0, s.heatSinks.total - 10))
    + (compactHS ? 3000 * s.heatSinks.total : 0);
  const lines: [string, number][] = [
    ['Cockpit', COCKPIT_COST[effectiveCockpit(d)]],
    ['Life support', 50000],
    ['Sensors', 2000 * t],
    ['Musculature', (d.myomer === 'super-cooled' ? 10000 : d.myomer === 'tsm' ? 16000 : d.myomer === 'industrial-tsm' ? 12000 : sh ? 12000 : 2000) * t],
    // Superheavy structure has its own costs; a tripod's costs 20% more.
    ['Internal structure', ((sh ? SUPERHEAVY_STRUCTURE_COST : STRUCTURE_COST)[d.structureType] ?? 0) * t * (tripod ? 1.2 : 1)],
    // Superheavy actuators cost double.
    ...(quad ? [] : [['Arm actuators', arms * (sh ? 2 : 1)] as [string, number]]),
    ['Leg actuators', legLocations(d).length * (150 + 80 + 120) * t * (sh ? 2 : 1)],
    // Large engines cost double.
    ['Engine', (ENGINE_COST[d.engineType] * s.rating * t) / 75 * (isLargeEngine(s.rating) ? 2 : 1)],
    ['Gyro', GYRO_COST[d.gyroType] * s.weights.gyro],
    ['Jump jets', jumpCost],
    ['Heat sinks', hsCost],
    ['Armor', isPatchwork(d)
      ? LOCATIONS.reduce((a, l) => a + ARMOR_COST[armorTypeAt(d, l)] * locPoints(d, l) / armorPointsPerTon(armorTypeAt(d, l), techOf(d, 'armor')), 0)
      : ARMOR_COST[d.armorType] * s.weights.armor],
    ['Weapons & equipment', equipmentCost(d.equipment, (eq) => itemWeight(eq, d), s.rating, d) + 50000 * implicitClanCase(d)],
  ];
  if (d.fullHeadEjection) lines.push(['Full Head Ejection System', 1725000]);
  // Armored components: 150,000 C-bills per armored slot.
  const armoredSlots = armoredSlotCounts(d);
  if (armoredSlots[0] + armoredSlots[1]) lines.push(['Armored components', 150000 * (armoredSlots[0] + armoredSlots[1])]);
  if (d.environmentalSealing) lines.push(['Environmental sealing', 225 * t]);
  if (d.lam || isQuadVee(d)) {
    // Conversion equipment: 75% (65% bimodal LAM, 50% QuadVee) of internal structure plus weapons and equipment cost.
    const base = lines.find(([l]) => l === 'Internal structure')![1] + lines.find(([l]) => l === 'Weapons & equipment')![1];
    if (d.lam) lines.push([`LAM conversion (${d.lam})`, base * (d.lam === 'bimodal' ? 0.65 : 0.75)]);
    else lines.push(['QuadVee conversion', base * 0.5]);
  }
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  // IndustrialMechs: × (1 + tonnage/400).
  const divisor = isIndustrial(d) ? 400 : 100;
  // Good Reputation quirk: ×1.1 (level 1) or ×1.25 (level 2), as MegaMek.
  const reputation = d.goodReputation === 2 ? 1.25 : d.goodReputation === 1 ? 1.1 : 1;
  const multiplier = (1 + t / divisor) * (d.omni ? 1.25 : 1) * reputation;
  lines.push([`× (1 + tonnage/${divisor})${d.omni ? ' × 1.25 OmniMech' : ''}${reputation !== 1 ? ` × ${reputation} Good Reputation` : ''}`, multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: false };
}

// ---------------------------------------------------------------------------
// Combat vehicles (approximate)
// ---------------------------------------------------------------------------

const BODY_MODIFIER: Record<string, number> = {
  tracked: 0.9, wheeled: 0.8, hover: 0.7, vtol: 0.7, wige: 0.7, naval: 0.6, hydrofoil: 0.6, submarine: 0.6,
};
const VEHICLE_COST_DIVISOR: Record<string, number> = {
  tracked: 100, wheeled: 200, hover: 50, vtol: 30, wige: 25, naval: 200, hydrofoil: 75, submarine: 50,
};
const LIFT_COST: Record<string, number> = { hover: 20000, vtol: 40000, hydrofoil: 20000, submarine: 20000, wige: 20000 };

export function vehicleBV(d: VehicleDesign): BVBreakdown {
  const s = computeVehicle(d);
  const lines: [string, number][] = [];
  // A Blue Shield adds 0.2 to the armor and structure multipliers (as MegaMek).
  const blueShield = d.equipment.some((e) => e.equipmentId === 'blue-shield') ? 0.2 : 0;
  const armor = s.armorTotal * 2.5 * ((ARMOR_BV_MULTIPLIER[d.armorType] ?? 1) + blueShield);
  const structure = s.structurePoints * s.armorLocations.length * 1.5 * (1 + blueShield);
  // A VTOL mast mount: +10 BV for each ECM suite or active probe on the mast (Tactical Operations, MegaMek).
  const mast = d.motive === 'vtol' && d.equipment.some((e) => e.equipmentId === 'mast-mount' && e.location === 'RO')
    ? 10 * d.equipment.filter((e) => e.location === 'RO' && /ecm|probe/.test(e.equipmentId)).length : 0;
  const defEquip = defensiveEquipmentBV(d.equipment) + mast;
  // VTOLs and WiGEs +1; stealth armor +2.
  // Running TMM (VTOLs and WiGEs +1; a supercharger or VTOL jet booster doubles cruise MP, as MegaMek), or jumping
  // TMM (+1); stealth armor +2.
  const runMP = s.boostedFlankMP ?? (d.equipment.some((e) => e.equipmentId === 'supercharger') ? d.cruiseMP * 2 : s.flankMP);
  const runTMM = targetMovementModifier(runMP) + (d.motive === 'vtol' || d.motive === 'wige' ? 1 : 0);
  const jumpTMM = s.jumpMP ? targetMovementModifier(s.jumpMP) + 1 : 0;
  const tmm = Math.max(runTMM, jumpTMM) + (d.armorType === 'stealth' ? 2 : 0);
  // Chassis modifications add to the body type modifier (MegaMek): fully amphibious +0.2; limited amphibious,
  // dune buggy, flotation hull, environmental sealing and armored motive system +0.1 each.
  let body = BODY_MODIFIER[d.motive];
  for (const e of d.equipment) {
    if (e.equipmentId === 'vehicle-fully-amphibious') body += 0.2;
    else if (/^(vehicle-limited-amphibious|vehicle-env-sealing|dune-buggy|flotation-hull|environmental-sealing|(clan-)?armored-motive-system)$/.test(e.equipmentId)) body += 0.1;
  }
  const defensive = (armor + structure + defEquip) * body * (1 + tmm / 10);
  lines.push(['Armor', armor], ['Internal structure', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  lines.push([`Body type modifier`, body], [`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);

  const weapons = weaponEntries(d.equipment.map((e) => ({ ...e, rear: e.location === 'RR' })), true);
  const ammo = ammoBV(d.equipment, weapons);
  // Rear-facing weapons count half, unless they outweigh the front-facing ones (then the front counts half).
  const frontBV = weapons.filter((w) => w.loc === 'FR').reduce((a, w) => a + w.bv, 0);
  const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  // When the rear outguns the front, every weapon except rear and turret ones counts half (MegaMek).
  for (const w of weapons) if (rearBV > frontBV ? !w.rear && w.loc !== 'TU' && w.loc !== 'TU2' : w.rear) w.bv /= 2;
  const weaponBV = weapons.reduce((a, w) => a + w.bv, 0);
  const offEquip = d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    return eq && !eq.isWeapon && eq.category !== 'Ammo' && !DEFENSIVE_IDS.has(eq.id) ? a + (value(eq.id)?.bv ?? 0) : a;
  }, 0);
  const tonnage = d.tonnage / 2;
  // Trailers (no MP of their own) count 1 MP for the speed factor (as MegaMek; they move with a tractor).
  const sf = speedFactor((d.trailer && d.cruiseMP === 0 ? 1 : runMP) + Math.round(s.jumpMP / 2));
  const offensive = (weaponBV + ammo + offEquip + tonnage) * sf;
  lines.push(['Weapons', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push(['Tonnage ÷ 2', tonnage], ['Speed factor', sf]);
  const droneMod = d.equipment.some((e) => e.equipmentId === 'drone-os') ? 0.95 : 1;
  if (droneMod !== 1) lines.push(['× 0.95 drone operating system', droneMod]);
  return { total: round((defensive + offensive) * droneMod), defensive, offensive, lines, approximate: true };
}

export function vehicleCost(d: VehicleDesign): CostBreakdown {
  const s = computeVehicle(d);
  const w = s.weights;
  const lines: [string, number][] = [
    ['Internal structure', (d.structureType === 'endo-steel' ? 50000 : 10000) * w.structure],
    ['Engine', (ENGINE_COST[d.engineType] * s.rating * d.tonnage) / 75],
    ['Control equipment', 10000 * w.controls],
    ['Lift / rotor / dive equipment', (LIFT_COST[d.motive] ?? 0) * w.lift],
    ['Turret', 5000 * w.turret],
    ['Sponson turrets', 4000 * w.sponsons],
    ['Power amplifiers', 20000 * w.powerAmplifiers],
    ['Heat sinks', 2000 * Math.max(0, d.heatSinks - s.freeHeatSinks)],
    ['Armor', ARMOR_COST[d.armorType] * w.armor],
    // Clan vehicles buy CASE (50,000) for each location holding explosives, as Clan 'Mechs do (MegaMek).
    ['Weapons & equipment', equipmentCost(d.equipment, (eq) => vehicleItemWeight(eq, d), s.rating) + 50000 * implicitClanCase(d, false)],
    ['Troop / cargo space', vehicleCargoCost(d)],
  ].filter(([, v]) => v !== 0) as [string, number][];
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  // A flotation hull or environmental sealing costs ×1.25 (MegaMek).
  const sealed = d.equipment.some((e) => e.equipmentId === 'flotation-hull' || e.equipmentId === 'vehicle-env-sealing') ? 1.25 : 1;
  const multiplier = (1 + d.tonnage / VEHICLE_COST_DIVISOR[d.motive]) * (d.omni ? 1.25 : 1) * sealed;
  lines.push([`× (1 + tonnage/${VEHICLE_COST_DIVISOR[d.motive]})${d.omni ? ' × 1.25 OmniVehicle' : ''}${sealed !== 1 ? ' × 1.25 flotation hull / sealing' : ''}`, multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: true };
}

export function formatCBills(n: number): string {
  return `${n.toLocaleString('en-US')} C-bills`;
}

// ---------------------------------------------------------------------------
// Aerospace and conventional fighters (MegaMek's AeroBVCalculator / AeroCostCalculator)
// ---------------------------------------------------------------------------

export function fighterBV(d: FighterDesign): BVBreakdown {
  const s = computeFighter(d);
  const lines: [string, number][] = [];
  const conventional = d.fighterType === 'conventional';

  // Defensive: armor, structural integrity, defensive equipment, unprotected explosives, type modifier.
  // Reflective armor ×1.5, ferro-lamellor ×1.2 (as 'Mechs, MegaMek).
  // Modular armor: 10 extra armor points each (as 'Mechs, MegaMek).
  const modularArmor = 10 * d.equipment.filter((e) => e.equipmentId === 'modular-armor').length;
  const armor = (s.armorTotal + modularArmor) * 2.5 * (ARMOR_BV_MULTIPLIER[d.armorType as MechDesign['armorType']] ?? 1);
  const structure = s.si * 2;
  const defEquip = defensiveEquipmentBV(d.equipment);
  // Clan fighters and fighters with CASE ignore explosives; otherwise −15 per ammo type, −1 per Gauss weapon.
  const protectedAll = d.techBase === 'Clan' || d.equipment.some((e) => ['case', 'clan-case', 'case-ii', 'clan-case-ii'].includes(e.equipmentId));
  let explosive = 0;
  if (!protectedAll) {
    const ammoTypes = new Set<string>();
    for (const item of d.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (!eq) continue;
      if (isExplosiveAmmo(eq)) ammoTypes.add(eq.id);
      else if (eq.isWeapon && isGaussType(eq.id)) explosive += 1;
      // Low-explosive weapons and equipment (improved heavy lasers, TSEMPs, …): −1 each (MegaMek).
      else if (eq.explosive || eq.explosiveLow) explosive += 1;
      // A PPC with a capacitor is explosive too: −1 for the PPC as well as the capacitor (MegaMek).
      if (eq.id === 'ppc-capacitor') explosive += 1;
    }
    explosive += 15 * ammoTypes.size;
  }
  // Stealth armor adds 0.3 to the type modifier (MegaMek).
  const typeModifier = (conventional ? 1.1 : 1.2) + (d.armorType === 'stealth' ? 0.3 : 0);
  const defensive = Math.max(1, armor + structure + defEquip - explosive) * typeModifier;
  lines.push(['Armor', armor], ['Structural integrity', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  lines.push([`Type modifier (${conventional ? 'conventional' : 'aerospace'} fighter${d.armorType === 'stealth' ? ', stealth' : ''})`, typeModifier]);

  // Offensive: aft and rear-facing weapons are the rear arc; the weaker arc counts half.
  const weapons = weaponEntries(d.equipment.map((e) => ({ ...e, rear: e.rear || e.location === 'AFT' })));
  const frontBV = weapons.filter((w) => !w.rear).reduce((a, w) => a + w.bv, 0);
  const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  for (const w of weapons) if (rearBV > frontBV ? !w.rear : w.rear) w.bv /= 2;
  // Aerospace fighters track heat against 6 + dissipation (no movement heat); conventional fighters don't.
  const heatEfficiency = 6 + s.heatSinks.dissipation;
  weapons.sort((a, b) => ((a.heat === 0) !== (b.heat === 0) ? (a.heat === 0 ? -1 : 1) : b.bv - a.bv || a.heat - b.heat));
  let heat = 0;
  let weaponBV = 0;
  for (const w of weapons) {
    weaponBV += conventional || heat < heatEfficiency || w.heat === 0 ? w.bv : w.bv / 2;
    heat += w.heat;
  }
  const ammo = ammoBV(d.equipment, weapons);
  const offEquip = d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    return eq && !eq.isWeapon && eq.category !== 'Ammo' && !DEFENSIVE_IDS.has(eq.id) ? a + (value(eq.id)?.bv ?? 0) : a;
  }, 0);
  const sf = speedFactor(s.maxThrust);
  const offensive = (weaponBV + ammo + offEquip) * sf;
  lines.push(['Weapons (heat-adjusted)', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push([`Speed factor (max thrust ${s.maxThrust})`, sf]);

  let total = defensive + offensive;
  // A small cockpit or a drone operating system: ×0.95 (once; MegaMek applies the drone's twice).
  if (d.cockpitType === 'small' || d.equipment.some((e) => e.equipmentId === 'drone-os')) {
    total *= 0.95;
    lines.push([d.cockpitType === 'small' ? '× 0.95 small cockpit' : '× 0.95 drone operating system', 0.95]);
  }
  return { total: round(total), defensive, offensive, lines, approximate: false };
}

export function fighterCost(d: FighterDesign): CostBreakdown {
  const s = computeFighter(d);
  const t = d.tonnage;
  const engine = (ENGINE_COST[d.engineType] * s.rating * t) / 75;
  const armor = ARMOR_COST[d.armorType] * s.weights.armor;
  const sinkCost = d.heatSinkType === 'double' ? 6000 : 2000;
  const equipment = equipmentCost(d.equipment, (eq) => fighterItemWeight(eq, d), s.rating) + 50000 * implicitClanCase(d, false);
  const lines: [string, number][] = d.fighterType === 'conventional'
    ? [
        ['Avionics', 4000 * (Math.ceil(t / 5) / 2)],
        ...(d.vstol ? [['VSTOL gear', 5000 * (Math.ceil(t / 10) / 2)] as [string, number]] : []),
        ['Structure', 4000 * s.si],
        ['Flight systems', 25000 + 10 * t],
        ['Engine', engine],
        ['Fuel tanks', (200 * s.fuelPoints) / 160],
        ['Armor', armor],
        ['Heat sinks', sinkCost * s.heatSinks.required],
        ['Weapons & equipment', equipment],
        ...(d.cargoDoors ? [['Cargo bay doors', 1000 * d.cargoDoors] as [string, number]] : []),
        ...(s.weights.powerAmplifiers ? [['Power amplifiers', 20000 * s.weights.powerAmplifiers] as [string, number]] : []),
      ]
    : [
        ['Cockpit', 200000],
        ['Life support', 50000],
        ['Sensors', 2000 * t],
        ['Structure', 50000 * s.si],
        ['Flight systems', 25000 + 10 * t],
        ['Engine', engine],
        ['Fuel tanks', (200 * s.fuelPoints) / 80],
        ['Armor', armor],
        ['Heat sinks', sinkCost * s.heatSinks.total],
        ['Weapons & equipment', equipment],
        ...(d.cargoDoors ? [['Cargo bay doors', 1000 * d.cargoDoors] as [string, number]] : []),
      ];
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  const multiplier = (1 + t / 200) * (d.omni ? 1.25 : 1);
  lines.push([d.omni ? '× (1 + tonnage/200) × 1.25 OmniFighter' : '× (1 + tonnage/200)', multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: false };
}

// ---------------------------------------------------------------------------
// Small craft and DropShips (MegaMek's AeroBVCalculator / DropShipBVCalculator and cost calculators)
// ---------------------------------------------------------------------------

/** BV arcs: nose, left, left-rear, aft, right-rear, right, then WarShip broadsides (MegaMek's order). */
function bvArc(item: VesselItem): number {
  switch (item.location) {
    case 'NOS': return 0;
    case 'LS': return item.rear ? 2 : 1;
    case 'FLS': return 1;
    case 'ALS': return 2;
    case 'AFT': return 3;
    case 'ARS': return 4;
    case 'RS': return item.rear ? 4 : 5;
    case 'FRS': return 5;
    case 'LBS': return 6;
    case 'RBS': return 7;
    default: return -1;
  }
}

/** WarShip arc neighbours (MegaMek's WarShipBVCalculator tables). */
const WS_CW = [5, 0, 6, 2, 3, 7, 1, 4];
const WS_CCW = [1, 6, 3, 4, 7, 0, 2, 5];
const WS_OPPOSITE = [3, 4, 5, 0, 1, 2, 7, 6];

export function vesselBV(d: VesselDesign): BVBreakdown {
  const s = computeVessel(d);
  const lines: [string, number][] = [];
  const dropship = d.vesselType !== 'small-craft';
  const large = isLargeCraft(d);
  const warship = d.vesselType === 'warship';
  const station = d.vesselType === 'space-station';

  // Defensive: armor, SI, defensive equipment; small craft lose BV for unprotected explosives.
  // Large craft armor and SI are capital scale: ×25 and ×20.
  const armor = s.armorTotal * (large ? 25 : 2.5);
  const structure = d.si * (large ? 20 : 2);
  const defEquip = defensiveEquipmentBV(d.equipment);
  let explosive = 0;
  if (!dropship && d.techBase !== 'Clan' && !d.equipment.some((e) => e.equipmentId === 'case' || e.equipmentId === 'clan-case')) {
    const ammoTypes = new Set<string>();
    for (const item of d.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (!eq) continue;
      if (isExplosiveAmmo(eq)) ammoTypes.add(eq.id);
      else if ((eq.isWeapon && isGaussType(eq.id)) || eq.explosive) explosive += 1;
    }
    explosive += 15 * ammoTypes.size;
  }
  // MegaMek: WarShips 0.8, JumpShips 0.75, space stations 0.7.
  const typeModifier = large ? (station ? 0.7 : warship ? 0.8 : 0.75) : 1;
  const defensive = Math.max(1, armor + structure + defEquip - explosive) * typeModifier;
  lines.push(['Armor', armor], ['Structural integrity', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  if (large) lines.push([`Type modifier (${VESSEL_TYPE_NAMES[d.vesselType]})`, typeModifier]);

  const ammoBin = (item: VesselItem, eq: Equipment) => ammoValue(eq).bv * Math.max(1, Math.floor((item.shots ?? shotsPerBin(eq)) / shotsPerBin(eq)));
  const tc = d.equipment.filter((e) => getEquipment(e.equipmentId)?.variableWeight === 'targetingComputer');
  const offEquip = d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    return eq && !eq.isWeapon && eq.category !== 'Ammo' && !DEFENSIVE_IDS.has(eq.id) ? a + (value(eq.id)?.bv ?? 0) : a;
  }, 0);
  let weaponBV = 0;
  let ammo = 0;

  if (!dropship) {
    // Small craft are rated like fighters: aft and rear-facing weapons are the rear arc,
    // and weapons are heat-tracked against 6 + dissipation.
    const items = d.equipment.map((e) => ({ ...e, rear: e.rear || e.location === 'AFT' }));
    const weapons = weaponEntries(items);
    const frontBV = weapons.filter((w) => !w.rear).reduce((a, w) => a + w.bv, 0);
    const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
    for (const w of weapons) if (rearBV > frontBV ? !w.rear : w.rear) w.bv /= 2;
    const heatEfficiency = 6 + s.heatSinks.dissipation;
    weapons.sort((a, b) => ((a.heat === 0) !== (b.heat === 0) ? (a.heat === 0 ? -1 : 1) : b.bv - a.bv || a.heat - b.heat));
    let heat = 0;
    for (const w of weapons) { weaponBV += heat < heatEfficiency || w.heat === 0 ? w.bv : w.bv / 2; heat += w.heat; }
    const perWeapon = new Map<string, number>();
    for (const item of d.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (eq?.ammoFor && !DEFENSIVE_IDS.has(eq.ammoFor)) perWeapon.set(eq.ammoFor, (perWeapon.get(eq.ammoFor) ?? 0) + ammoBin(item, eq));
    }
    for (const [id, bv] of perWeapon) ammo += Math.min(bv, ammoCap(weapons, id));
  } else {
    // DropShips: six arcs. The strongest arc counts in full; its neighbours count full and half
    // (dropping to half and quarter once heat efficiency is exceeded); the rest count a quarter.
    const nArcs = warship ? 8 : 6;
    const arcItems: VesselItem[][] = Array.from({ length: nArcs }, () => []);
    for (const item of d.equipment) { const a = bvArc(item); if (a >= 0 && a < nArcs) arcItems[a].push(item); }
    const arcWeapons = arcItems.map((items) => weaponEntries([...items, ...tc]));
    const arcBV = arcWeapons.map((ws) => ws.reduce((a, w) => a + w.bv, 0));
    const arcHeat = arcWeapons.map((ws) => ws.reduce((a, w) => a + w.heat, 0));
    // WarShips take their primary arc from the nose, aft or a broadside; the "right" arc is then the opposite one.
    const candidates = warship ? [0, 3, 6, 7] : [0, 1, 2, 3, 4, 5];
    const max = Math.max(...candidates.map((a) => arcBV[a]));
    const nose = candidates.find((a) => arcBV[a] === max)!;
    const ccw = warship ? WS_CCW[nose] : (nose + 1) % 6;
    const cw = warship ? WS_CW[nose] : (nose + 5) % 6;
    const [left, other] = arcBV[ccw] > arcBV[cw] ? [ccw, cw] : [cw, ccw];
    const right = warship ? WS_OPPOSITE[nose] : other;
    const heatEfficiency = s.heatSinks.dissipation;
    const factor: number[] = Array(nArcs).fill(0.25);
    factor[nose] = 1;
    let heat = arcHeat[nose];
    factor[left] = heat > heatEfficiency ? 0.5 : 1;
    heat += arcHeat[left];
    factor[right] = heat > heatEfficiency ? 0.25 : 0.5;
    for (let a = 0; a < nArcs; a++) {
      weaponBV += arcBV[a] * factor[a];
      // Ammo counts in the arc it feeds, up to the BV of that arc's weapons of the type.
      const perWeapon = new Map<string, number>();
      for (const item of arcItems[a]) {
        const eq = getEquipment(item.equipmentId);
        if (eq?.ammoFor && !DEFENSIVE_IDS.has(eq.ammoFor)) perWeapon.set(eq.ammoFor, (perWeapon.get(eq.ammoFor) ?? 0) + ammoBin(item, eq));
      }
      for (const [id, bv] of perWeapon) {
        const cap = ammoCap(arcWeapons[a], id);
        ammo += Math.min(bv, cap) * factor[a];
      }
    }
    const names = ['nose', 'left', 'left rear', 'aft', 'right rear', 'right', 'left broadside', 'right broadside'];
    lines.push([`Primary arc: ${names[nose]}`, arcBV[nose]]);
  }
  // JumpShips use a fixed 1 MP (stations 0); WarShips, like smaller craft, their maximum thrust.
  const sfMP = large && !warship ? (station ? 0 : 1) : s.maxThrust;
  const sf = speedFactor(sfMP);
  const offensive = (weaponBV + ammo + offEquip) * sf;
  lines.push(['Weapons', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push([large && !warship ? `Speed factor (${sfMP} MP)` : `Speed factor (max thrust ${s.maxThrust})`, sf]);
  return { total: round(defensive + offensive), defensive, offensive, lines, approximate: false };
}

/** Primitive craft carry Primitive Aerospace armor, 5,000 C-bills a ton (MegaMek). */
function vesselArmorCostPerTon(d: VesselDesign): number {
  return d.armorType === 'standard' && isPrimitiveVessel(d) ? 5000 : VESSEL_ARMOR_COST[d.armorType];
}

export function vesselCost(d: VesselDesign): CostBreakdown {
  const s = computeVessel(d);
  const t = d.tonnage;
  const arcsWithGuns = new Set(d.equipment.filter((e) => getEquipment(e.equipmentId)?.isWeapon && e.location && e.location !== 'HULL').map((e) => `${e.location}${e.rear ? ':R' : ''}`)).size; // rear-facing side weapons are a separate arc (MegaMek)
  const people = d.crew.crew + d.crew.passengers;
  const equipment = d.equipment.reduce((a, item) => {
    const eq = getEquipment(item.equipmentId);
    if (!eq) return a;
    // As MegaMek, an ammunition bin costs one ton's price whatever its size (the TechManual prices it per ton).
    if (eq.category === 'Ammo') return a + ammoValue(eq).cost;
    const formula = vesselFormulaCost(eq.id, vesselItemWeight(eq, d, item));
    if (formula !== null) return a + formula;
    return a + equipmentCost([item], (e) => vesselItemWeight(e, d, item), 0);
  }, 0);
  const lines: [string, number][] = [
    ['Bridge', 200000 + 10 * t],
    ['Computer', 200000],
    ['Life support', 5000 * people],
    ['Sensors', 80000],
    ['Fire control computer', 100000],
    ['Gunnery control systems', 10000 * arcsWithGuns],
    ['Structural integrity', 100000 * d.si],
    ['Attitude thrusters', 25000],
    ['Landing gear', 10 * t],
    ['Engine', s.weights.engine * 1000],
    ['Drive unit', (500 * d.safeThrust * t) / 100],
    ['Fuel tanks', 200 * s.weights.fuel],
    ['Armor', vesselArmorCostPerTon(d) * s.weights.armor],
    ['Heat sinks', (d.heatSinkType === 'double' ? 6000 : 2000) * d.heatSinks],
    ['Weapons & equipment', equipment],
  ];
  if (isLargeCraft(d)) return largeCraftCost(d, s, lines.slice(0, 7), equipment);
  let multiplier = 1 + t / 50;
  // Infantry and battle armor bays: 15,000 per (whole) ton on small craft, part of the structure on DropShips (MegaMek).
  const sc = d.vesselType === 'small-craft';
  const bays = d.bays.reduce((a, b) => a + ((b.kind.startsWith('infantry') || b.kind === 'battle-armor') ? (sc ? 15000 * Math.ceil(bayWeight(b) - 1e-9) : 0)
    : BAY_INFO[b.kind].cost * Math.ceil(BAY_INFO[b.kind].cargo ? BAY_INFO[b.kind].tons * b.size : b.size)) + (b.arts ? 1000000 : 0), 0);
  // Small craft quarters, per person: first class 30,000, second class and crew 15,000, steerage 5,000 (MegaMek;
  // DropShip quarters are not priced).
  const q = d.quarters;
  const quarters = 30000 * (q['first-class'] ?? 0) + 15000 * ((q['second-class'] ?? 0) + (q.crew ?? 0)) + 5000 * (q.steerage ?? 0);
  if (d.vesselType === 'dropship') {
    lines.push(['Docking collar', 10000], ['Bays and doors', bays + 1000 * s.bayDoors], ['Life boats / escape pods', 5000 * (d.lifeboats + d.escapePods)]);
    multiplier = d.shape === 'spheroid' ? 28 : 36;
  } else {
    lines.push(['Bays and doors', bays + 1000 * s.bayDoors], ['Quarters', quarters]);
  }
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  lines.push([d.vesselType === 'dropship' ? `× ${multiplier} (${d.shape} DropShip)` : '× (1 + tonnage/50)', multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: false };
}

/** JumpShip, WarShip and space station cost (MegaMek's JumpShip / WarShip / SpaceStation cost calculators). */
function largeCraftCost(d: VesselDesign, s: ReturnType<typeof computeVessel>, common: [string, number][], equipment: number): CostBreakdown {
  const t = d.tonnage;
  const warship = d.vesselType === 'warship';
  const station = d.vesselType === 'space-station';
  const docks = d.dockingCollars;
  // MegaMek's K-F drive cost counts each DropShuttle bay as two docking hardpoints.
  const kfDocks = docks + 2 * d.bays.filter((b) => b.kind === 'drop-shuttle').reduce((a, b) => a + b.size, 0);
  const lines: [string, number][] = [...common];
  if (warship) {
    lines.push(['Drive unit', 500 * d.safeThrust * (t / 100)], ['Engine', 1000 * d.safeThrust * t * 0.06]);
  } else {
    lines.push(['Engine (station-keeping)', 1000 * t * 0.012]);
  }
  lines.push(['Engine control unit', 1000]);
  if (!station) {
    let drive = 60000000 + 75000000 * kfDocks + 25000000 + 5000000 * kfDocks + 50000000 + 50000 * kfIntegrity(d)
      + 50000 * (30 + t / (warship ? 20000 : 7500)) + 500000 + 200000 * kfDocks;
    if (warship) drive *= 5;
    if (d.lfBattery) drive *= 3;
    lines.push(['K-F drive', drive]);
    lines.push([warship ? 'K-F drive support systems' : 'K-F field initiator', warship ? 20000000 * (50 + t / 10000) : 10000000 * (t / 10000)]);
  }
  const bays = d.bays.reduce((a, b) => {
    const info = BAY_INFO[b.kind];
    const units = info.cargo ? info.tons * b.size : b.size;
    return a + info.cost * Math.ceil(units) + (b.arts ? 1000000 : 0);
  }, 0);
  const decks = d.gravDecks.reduce((a, g) => a + (g < 100 ? 5000000 : g <= 250 ? 10000000 : 40000000), 0);
  lines.push(
    ['Attitude thrusters', 25000],
    ['Docking collars', 100000 * docks],
    ['Fuel tanks', 200 * d.fuelTons * 1.02],
    ['Armor', vesselArmorCostPerTon(d) * s.weights.armor],
    ['Heat sinks', (d.heatSinkType === 'double' ? 6000 : 2000) * d.heatSinks],
    ['Life boats / escape pods', 5000 * (d.lifeboats + d.escapePods)],
    ['Grav decks', decks],
    ['Bays and doors', bays + 1000 * s.bayDoors],
    ['HPG', d.hpg ? 1000000000 : 0],
    ['Weapons & equipment', equipment],
  );
  const multiplier = warship ? 2 : station ? 5 : 1.25;
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  lines.push([`× ${multiplier} (${VESSEL_TYPE_NAMES[d.vesselType]})`, multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: false };
}

// ---------------------------------------------------------------------------
// Support vehicles (MegaMek CombatVehicleBVCalculator / AeroBVCalculator, CombatVehicleCostCalculator /
// FixedWingSupportCostCalculator)
// ---------------------------------------------------------------------------

/** Weapon BV multiplier for a support vehicle's fire control: none 0.8, basic 0.9, advanced 1. */
export const SV_FIRE_CONTROL_BV = { none: 0.8, basic: 0.9, advanced: 1 } as const;

export function supportBV(d: SupportVehicleDesign): BVBreakdown {
  const s = computeSupport(d);
  const aero = SV_TYPES[d.svType].aero;
  const lines: [string, number][] = [];
  // Non-BAR armor rates BAR 10, at its armor type's multiplier (reflective ×1.5, …).
  const bar = d.armorType ? ARMOR_BV_MULTIPLIER[d.armorType as MechDesign['armorType']] ?? 1 : d.bar / 10;
  const armor = s.armorTotal * 2.5 * bar;
  const defEquip = defensiveEquipmentBV(d.equipment);
  const fc = SV_FIRE_CONTROL_BV[d.fireControl];
  const rearLoc = aero ? 'AF' : 'RR';
  const weapons = weaponEntries(d.equipment.map((e) => ({ ...e, rear: e.location === rearLoc })), true);
  // MegaMek applies the fire-control modifier to weapons and to ammunition.
  const ammo = ammoBV(d.equipment, weapons) * fc;
  // Infantry weapons ignore fire control (MegaMek).
  for (const w of weapons) if (!getEquipment(w.id)?.infantryWeapon) w.bv *= fc;
  // Ground craft compare the rear with the front facing only; aircraft with everything not aft (MegaMek).
  const isFront = (w: { rear: boolean; loc?: string | null }) => (aero ? !w.rear : w.loc === 'FR');
  const frontBV = weapons.filter(isFront).reduce((a, w) => a + w.bv, 0);
  const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  for (const w of weapons) if (rearBV > frontBV ? (aero ? isFront(w) : !w.rear && w.loc !== 'TU') : w.rear) w.bv /= 2;
  const offEquip = d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    return eq && !eq.isWeapon && eq.category !== 'Ammo' && !DEFENSIVE_IDS.has(eq.id) ? a + (value(eq.id)?.bv ?? 0) : a;
  }, 0);

  if (aero) {
    // Fixed-wing support vehicles and airships: structural integrity = safe thrust; no TMM; type modifier 1;
    // speed factor from maximum thrust.
    const si = d.cruiseMP * 2;
    let explosive = 0;
    if (d.techBase !== 'Clan' && !d.equipment.some((e) => /(^|-)case(-ii)?$/.test(e.equipmentId))) {
      const ammoTypes = new Set<string>();
      for (const item of d.equipment) {
        const eq = getEquipment(item.equipmentId);
        if (!eq) continue;
        if (isExplosiveAmmo(eq)) ammoTypes.add(eq.id);
        else if ((eq.isWeapon && isGaussType(eq.id)) || eq.explosive) explosive += 1;
      }
      explosive += 15 * ammoTypes.size;
    }
    const defensive = Math.max(1, armor + si + defEquip - explosive);
    // Support aircraft, like conventional fighters, do not track heat (MegaMek's FixedWingSupport).
    const weaponBV = weapons.reduce((a, w) => a + w.bv, 0);
    const sf = speedFactor(s.flankMP);
    const offensive = (weaponBV + ammo + offEquip) * sf;
    lines.push([`Armor (× 2.5 × BAR ${d.bar}/10)`, armor], ['Structural integrity (× 2)', si]);
    if (defEquip) lines.push(['Defensive equipment', defEquip]);
    if (explosive) lines.push(['Explosive ammo / components', -explosive]);
    lines.push([`Weapons (× ${fc} fire control)`, weaponBV], ['Ammunition', ammo]);
    if (offEquip) lines.push(['Offensive equipment', offEquip]);
    lines.push([`Speed factor (max thrust ${s.flankMP})`, sf]);
    return { total: round(defensive + offensive), defensive, offensive, lines, approximate: false };
  }

  // Ground and naval support vehicles: as combat vehicles.
  const structure = Math.ceil(d.tonnage / 10) * s.armorLocations.length * 1.5;
  const naval = d.svType === 'naval' || d.svType === 'rail';
  const body = d.svType === 'tracked' ? 0.9 : d.svType === 'wheeled' ? 0.8 : naval ? 0.6 : 0.7;
  // A supercharger doubles cruise MP for the running TMM and speed factor (as combat vehicles, MegaMek).
  const runMP = d.equipment.some((e) => e.equipmentId === 'supercharger') ? svCruiseMP(d) * 2 : s.flankMP;
  // Vehicle jump jets: jumping TMM (+1), and half the jump MP adds to the speed factor (as combat vehicles).
  const jumpMP = d.equipment.filter((e) => e.equipmentId === 'vehicle-jump-jet').length;
  const tmm = Math.max(targetMovementModifier(runMP) + (d.svType === 'vtol' || d.svType === 'wige' ? 1 : 0), jumpMP ? targetMovementModifier(jumpMP) + 1 : 0);
  const defensive = (armor + structure + defEquip) * body * (1 + tmm / 10);
  const weaponBV = weapons.reduce((a, w) => a + w.bv, 0);
  const trailer = d.chassisMods.includes('trailer') && d.cruiseMP === 0;
  const speedMP = (trailer ? 1 : d.svType === 'rail' ? d.cruiseMP : runMP) + Math.round(jumpMP / 2);
  const sf = speedFactor(speedMP);
  const offensive = (weaponBV + ammo + offEquip + d.tonnage / 2) * sf;
  lines.push([`Armor (× 2.5 × BAR ${d.bar}/10)`, armor], ['Internal structure', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  lines.push(['Body type modifier', body], [`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);
  lines.push([`Weapons (× ${fc} fire control)`, weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push(['Tonnage ÷ 2', d.tonnage / 2], [`Speed factor (${speedMP} MP)`, sf]);
  return { total: round(defensive + offensive), defensive, offensive, lines, approximate: false };
}

/** BAR armor cost per point. */
const BAR_COST: Record<number, number> = { 2: 50, 3: 100, 4: 150, 5: 200, 6: 250, 7: 300, 8: 400, 9: 500, 10: 625 };
/** Support vehicle engine cost multipliers (cost = 5,000 × engine tons × multiplier). */
const SV_ENGINE_COST: Record<string, number> = { steam: 0.8, battery: 1.2, 'fuel-cell': 1.4, solar: 1.6, maglev: 2.5, fission: 3, fusion: 2 };
/** Chassis cost multipliers for chassis modifications (MegaMek). */
const SV_CHASSIS_COST: Record<string, number> = {
  amphibious: 1.25, armored: 2, bicycle: 0.75, convertible: 1.1, 'dune-buggy': 1.25, 'environmental-sealing': 1.75,
  'external-power-pickup': 1.1, hydrofoil: 1.1, monocycle: 1.3, 'off-road': 1.2, prop: 0.75, snowmobile: 1.3, stol: 1.5,
  submersible: 3.5, tractor: 1.1, trailer: 0.75, 'ultra-light': 1.5, vstol: 2,
};
const TECH_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

export function supportCost(d: SupportVehicleDesign): CostBreakdown {
  const s = computeSupport(d);
  const w = s.weights;
  const aero = SV_TYPES[d.svType].aero;
  // MegaMek gives unpowered rail cars no chassis cost (their base chassis value is 0 without an engine).
  let chassis = d.svType === 'rail' && d.engineType === 'none' ? 0 : 2500 * svStructureForCost(d);
  for (const m of d.chassisMods) chassis *= SV_CHASSIS_COST[m] ?? 1;
  const engine = d.engineType === 'none' ? 0 : 5000 * w.engine * (SV_ENGINE_COST[d.engineType] ?? 1);
  // Non-BAR armor: its weight × the armor's price per ton (MegaMek).
  const armor = d.armorType ? w.armor * ARMOR_COST[d.armorType] : s.armorTotal * (BAR_COST[d.bar] ?? 0);
  const techMultiplier = 0.5 + TECH_INDEX[d.structureTech] * 0.25;
  const structural = (chassis + engine + armor) * techMultiplier;
  // Heat sinks: the heat of energy weapons that need them (fixed-wing: lasers and PPCs); SV engines give none free.
  let sinks = 0;
  let turret = 0;
  let weaponCost = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq?.isWeapon) continue;
    weaponCost += value(eq.id)?.cost ?? 0;
    if (aero ? /laser|ppc/.test(eq.id) && !eq.ammoPerTon : (eq.category === 'Energy' && !eq.ammoPerTon) || /plasma/.test(eq.id)) sinks += eq.heat;
    if (item.location === 'TU') turret += svItemWeight(eq, d) / 10;
  }
  const transport = svTransportCost(d.transport);
  const fireControl = d.fireControl === 'basic' ? weaponCost * 0.05 : d.fireControl === 'advanced' ? weaponCost * 0.1 : 0;
  const clips = d.equipment.reduce((a, i) => a + svClipExtras(i.equipmentId, i.clips).cost, 0);
  // A support vehicle supercharger costs 10,000 per ton of engine (MegaMek).
  const supercharger = d.equipment.filter((e) => e.equipmentId === 'supercharger').length * 10000 * w.engine;
  const equipment = equipmentCost(d.equipment, (eq) => svItemWeight(eq, d), 0) + clips + supercharger + fireControl;
  const lines: [string, number][] = [
    ['Chassis', chassis], ['Engine', engine], ['Armor', armor],
    [`Final structural cost (× ${techMultiplier} for tech rating ${d.structureTech})`, structural],
    ['Power amplifiers', 20000 * w.powerAmplifiers], ['Heat sinks', 2000 * sinks],
    ...(aero ? [] : [['Turret', 5000 * (s.size === 'small' ? Math.ceil(turret * 1000) / 1000 : Math.ceil(turret * 2) / 2)] as [string, number]]),
    [`Weapons & equipment${fireControl ? ' (incl. fire control)' : ''}`, equipment],
    ['Seating', transport.seats], ['Quarters', transport.quarters], ['Transport bays', transport.bays],
  ];
  const subtotal = lines.slice(3).reduce((a, [, v]) => a + v, 0);
  const omni = d.chassisMods.includes('omni') ? 1.25 : 1;
  const t = d.tonnage;
  const naval = d.svType === 'naval';
  const multiplier = aero
    ? (d.svType === 'airship' ? 1 + t / 10000 : 1 + t / 50)
    : naval ? 1 + t / 100000
      : 1 + t / ({ hover: 50, wheeled: 200, tracked: 100, vtol: 30, wige: 25, rail: 250 } as Record<string, number>)[d.svType];
  if (omni !== 1) lines.push(['× 1.25 OmniVehicle', omni]);
  lines.push(['× tonnage multiplier', multiplier]);
  return { total: round(subtotal * omni * multiplier), lines: lines.filter(([, v]) => v !== 0), approximate: false };
}
