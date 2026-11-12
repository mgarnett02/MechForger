/**
 * Battle Value (BV 2.0) and C-bill cost.
 *
 * BattleMech BV and cost follow the TechManual formulas and reproduce the
 * published values of canon designs (see tests). Combat vehicle BV and cost
 * follow the same structure with vehicle modifiers but are flagged as
 * approximate.
 */
import type { Location, MechDesign } from './types';
import { LOCATIONS, isIndustrial, isQuad, legLocations, techOf } from './types';
import type { Equipment } from './equipment';
import { canArmor, getEquipment, isArtemisVCapable, isDirectFire, isPPC, itemSlots, itemWeight } from './equipment';
import { armoredSystemSlots, computeMech, fixedSlots } from './construction';
import { engineSideTorsoSlots, freeHeatSinks } from './tables';
import { meleeBV, meleeCost } from './melee';
import type { FighterDesign } from './fighter';
import { computeFighter, fighterItemWeight } from './fighter';
import type { VesselDesign, VesselItem } from './vessel';
import { BAY_INFO, VESSEL_ARMOR_COST, VESSEL_TYPE_NAMES, computeVessel, isLargeCraft, kfIntegrity, shotsPerBin, vesselItemWeight } from './vessel';
import type { VehicleDesign } from './vehicle';
import { computeVehicle, vehicleItemWeight } from './vehicle';
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

function value(id: string) {
  return ITEM_VALUES[id];
}

/** BV and cost of one ammo bin (half-ton bins count half). */
function ammoValue(eq: Equipment): { bv: number; cost: number } {
  if (eq.shotBV !== undefined) return { bv: eq.shotBV, cost: eq.shotCost ?? 0 }; // capital ammo: per shot
  const weapon = eq.ammoFor ?? '';
  const scale = eq.tons; // 1 or 0.5
  if (MML_AMMO_BV[weapon]) {
    const srm = eq.id.endsWith('-srm');
    return { bv: MML_AMMO_BV[weapon][srm ? 1 : 0] * scale, cost: (srm ? 27000 : 30000) * scale };
  }
  const w = value(weapon);
  let bv = (w?.ammoBV ?? 0) * scale;
  if (eq.artemisAmmo) bv *= 1.2;
  if (eq.artemisVAmmo) bv *= 1.3;
  // Artemis V ammunition costs twice as much (MegaMek).
  return { bv, cost: (w?.ammoCost ?? 0) * scale * (eq.artemisVAmmo ? 2 : 1) };
}

/** Heat a weapon counts for in the BV heat calculation. */
function bvHeat(eq: Equipment): number {
  if (/(^|-)uac-/.test(eq.id)) return eq.heat * 2;
  if (/(^|-)rac-/.test(eq.id)) return eq.heat * 6;
  if (/streak/.test(eq.id)) return eq.heat / 2;
  return eq.heat;
}

interface WeaponEntry {
  bv: number;
  heat: number;
  rear: boolean;
  id: string;
  loc?: string | null;
}

/** Weapon BV with targeting-computer and Artemis IV bonuses. */
function weaponEntries(
  items: { equipmentId: string; location: string | null; rear?: boolean }[],
): WeaponEntry[] {
  const ids = items.map((i) => i.equipmentId);
  const hasTC = ids.some((id) => getEquipment(id)?.variableWeight === 'targetingComputer');
  // Artemis IV pairs with launchers in the same location (vehicles: anywhere).
  // Artemis V links first (to Clan LRM/SRM launchers), then Artemis IV.
  const artemisLeft = new Map<string, number>();
  const artemisVLeft = new Map<string, number>();
  for (const i of items) {
    if (i.equipmentId === 'clan-artemis-v') artemisVLeft.set(i.location ?? '', (artemisVLeft.get(i.location ?? '') ?? 0) + 1);
    if (i.equipmentId === 'artemis-iv' || i.equipmentId === 'clan-artemis-iv') {
      const k = i.location ?? '';
      artemisLeft.set(k, (artemisLeft.get(k) ?? 0) + 1);
    }
  }
  const capacitorsLeft = capacitorCounts(items);
  // Apollo FCS: ×1.15 for an MRM launcher in the same location.
  const apolloLeft = new Map<string, number>();
  for (const i of items) if (i.equipmentId === 'apollo-fcs') apolloLeft.set(i.location ?? '', (apolloLeft.get(i.location ?? '') ?? 0) + 1);
  const out: WeaponEntry[] = [];
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || !eq.isWeapon || DEFENSIVE_IDS.has(eq.id)) continue;
    let bv = value(eq.id)?.bv ?? 0;
    let heat = bvHeat(eq);
    // Machine gun arrays: 0.67 × the BV of up to four machine guns of their type in the same location (as MegaMek).
    const mga = /^(clan-)?(light-|heavy-)?mga$/.exec(eq.id);
    if (mga) {
      const mgId = `${mga[1] ?? ''}${mga[2] ?? ''}machine-gun`;
      const linked = items.filter((x) => x.equipmentId === mgId && x.location === i.location).length;
      bv = 0.67 * Math.min(4, linked) * (value(mgId)?.bv ?? 0);
    }
    if (/^mrm-/.test(eq.id) && (apolloLeft.get(i.location ?? '') ?? 0) > 0) {
      apolloLeft.set(i.location ?? '', apolloLeft.get(i.location ?? '')! - 1);
      bv *= 1.15;
    }
    // A PPC Capacitor adds its BV to the linked PPC (as MegaMek) and 5 heat.
    if (takeCapacitor(capacitorsLeft, i)) {
      bv += CAPACITOR_BV[eq.id] ?? 0;
      heat += 5;
    }
    if (hasTC && isDirectFire(eq)) bv *= 1.25;
    const k = i.location ?? '';
    if (isArtemisVCapable(eq.id) && (artemisVLeft.get(k) ?? 0) > 0) {
      artemisVLeft.set(k, artemisVLeft.get(k)! - 1);
      bv *= 1.3;
    } else if (eq.artemisCapable && (artemisLeft.get(k) ?? 0) > 0) {
      artemisLeft.set(k, artemisLeft.get(k)! - 1);
      bv *= 1.2;
    }
    out.push({ bv, heat, rear: !!i.rear, id: eq.id, loc: i.location });
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
function ammoBV(items: { equipmentId: string }[], weapons: WeaponEntry[]): number {
  const perWeapon = new Map<string, number>();
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq?.ammoFor || DEFENSIVE_IDS.has(eq.ammoFor)) continue;
    perWeapon.set(eq.ammoFor, (perWeapon.get(eq.ammoFor) ?? 0) + ammoValue(eq).bv);
  }
  let total = 0;
  for (const [weaponId, bv] of perWeapon) {
    const cap = weapons.filter((w) => w.id === weaponId).reduce((a, w) => a + w.bv, 0);
    total += Math.min(bv, cap);
  }
  return total;
}

/** BV of defensive equipment (AMS, ECM, active probes) and AMS ammo. */
function defensiveEquipmentBV(items: { equipmentId: string }[]): number {
  let equipment = 0;
  let amsAmmo = 0;
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq) continue;
    if (DEFENSIVE_IDS.has(eq.id)) equipment += value(eq.id)?.bv ?? 0;
    else if (eq.ammoFor && DEFENSIVE_IDS.has(eq.ammoFor)) amsAmmo += ammoValue(eq).bv;
  }
  const amsBV = items
    .filter((i) => i.equipmentId === 'ams' || i.equipmentId === 'clan-ams')
    .reduce((a, i) => a + (value(i.equipmentId)?.bv ?? 0), 0);
  return equipment + Math.min(amsAmmo, amsBV);
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
  const cockpitArmor = d.cockpitType === 'torso-mounted' ? d.armor.CT + d.armor.CTR : 0;
  // Commercial armor has a barrier armor rating of 5 (half value).
  const bar = d.armorType === 'commercial' ? 0.5 : 1;
  // Modular armor: 10 extra armor points each.
  const modular = 10 * d.equipment.filter((e) => e.equipmentId === 'modular-armor').length;
  const armor = (s.armorTotal + cockpitArmor + modular) * 2.5 * (ARMOR_BV_MULTIPLIER[d.armorType] ?? 1) * bar;
  const isPoints = s.structure ? LOCATIONS.reduce((a, l) => a + s.structure![l], 0) : 0;
  // Engine multiplier from the side-torso engine slots (as MegaMek): 6+ → 0.25, 3+ → 0.5, 2 → 0.75.
  const sideSlots = engineSideTorsoSlots(d.engineType, techOf(d, 'engine'));
  const engineMod = sideSlots >= 6 ? 0.25 : sideSlots >= 3 ? 0.5 : sideSlots === 2 ? 0.75 : 1;
  const structureMod = d.structureType === 'composite' || d.structureType === 'industrial' ? 0.5 : d.structureType === 'reinforced' ? 2 : 1;
  const structure = isPoints * 1.5 * structureMod * engineMod;
  const gyro = d.tonnage * (d.gyroType === 'heavy-duty' ? 1 : 0.5);
  const defEquip = defensiveEquipmentBV(d.equipment);
  const armoredBV = armoredComponentBV(d);

  // Explosive ammo (−15 per slot) and Gauss weapons (−1 per slot) where CASE does not protect.
  // As MegaMek: CASE II protects any location; CASE protects arms and side torsos unless the side torso
  // holds 3+ engine slots (IS XL, any XXL); arms are protected by CASE in the arm or its side torso.
  const at = (ids: string[]) => new Set(d.equipment.filter((e) => ids.includes(e.equipmentId)).map((e) => e.location));
  const caseII = at(['case-ii', 'clan-case-ii']);
  const caseIn = at(['case']);
  const hasCase = (loc: Location) => isClan || caseIn.has(loc) || caseII.has(loc);
  const protectedLoc = (loc: Location): boolean => {
    if (caseII.has(loc)) return true;
    if (loc === 'CT' || loc === 'HD' || legLocations(d).includes(loc)) return false;
    if (loc === 'LT' || loc === 'RT') return hasCase(loc) && sideSlots < 3;
    return hasCase(loc) || protectedLoc(loc === 'LA' ? 'LT' : 'RT');
  };
  let explosive = 0;
  const capsLeft = capacitorCounts(d.equipment);
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    // A split weapon is a hazard if either of its locations is unprotected.
    if (!eq || !item.location || (protectedLoc(item.location) && (!item.split || protectedLoc(item.split.location)))) continue;
    if (eq.category === 'Ammo' && eq.ammoFor && !isGaussType(eq.ammoFor) && !/plasma/.test(eq.ammoFor)) explosive += 15;
    else if (eq.explosiveLow) explosive += eq.slots;
    else if (eq.explosive) explosive += 15 * eq.slots;
    // A PPC with a capacitor is explosive too (−1 per slot).
    else if (takeCapacitor(capsLeft, item)) explosive += eq.slots;
    else if (eq.isWeapon && isGaussType(eq.id)) explosive += eq.slots;
  }

  const run = s.mascRunMP ?? s.tsmMP?.run ?? s.runMP;
  // Jumping MP includes a partial wing's bonus (as MegaMek's BV calculation).
  const jump = s.totalJumpMP;
  // Standard LAMs are rated on AirMech flank speed, with +1 for being airborne (IO p. 192, as in MegaMek).
  const airMechFlank = d.lam === 'standard' ? s.lam?.airMech?.flank ?? 0 : null;
  const runTMM = airMechFlank !== null ? (airMechFlank ? targetMovementModifier(airMechFlank) + 1 : 0) : targetMovementModifier(run);
  // Stealth armor or a null-signature system: +2 TMM; a chameleon shield: +2; a void-signature system
  // raises the modifier to at least 3 (+1 if it is exactly 3), as MegaMek.
  const has = (id: string) => d.equipment.some((e) => e.equipmentId === id);
  const nullSig = has('null-signature-system');
  const voidSig = has('void-signature-system');
  const chameleon = has('chameleon-lps');
  const stealth = d.armorType === 'stealth' ? 2 : 0;
  // UMUs give their own (non-jump) modifier.
  let tmm = Math.max(runTMM, jump > 0 ? targetMovementModifier(jump) + 1 : 0, s.umuMP > 0 ? targetMovementModifier(s.umuMP) : 0)
    + (stealth || nullSig ? 2 : 0) + (chameleon ? 2 : 0);
  if (voidSig) tmm = tmm < 3 ? 3 : tmm === 3 ? 4 : tmm;
  const defensive = Math.max(1, armor + structure + gyro + defEquip + armoredBV - explosive) * (1 + tmm / 10);
  lines.push(['Armor', armor], ['Internal structure', structure], ['Gyro', gyro]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (armoredBV) lines.push(['Armored components', armoredBV]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  lines.push([`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);

  // --- Offensive battle rating (melee weapons count as heat-free, forward-facing weapons)
  const weapons = weaponEntries(d.equipment);
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (eq?.melee) weapons.push({ bv: meleeBV(eq.melee, d), heat: 0, rear: false, id: eq.id, loc: item.location });
  }
  // Weapons (and melee weapons) in an arm with an Actuator Enhancement System: ×1.25.
  const aesArms = isQuad(d) ? new Set<string>() : new Set(d.equipment.filter((e) => e.equipmentId === 'aes' && (e.location === 'LA' || e.location === 'RA')).map((e) => e.location as string));
  for (const w of weapons) if (w.loc && aesArms.has(w.loc)) w.bv *= 1.25;
  const frontBV = weapons.filter((w) => !w.rear).reduce((a, w) => a + w.bv, 0);
  const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  for (const w of weapons) {
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
  }, 0);
  // AES: +0.1 per arm, +0.2 (biped) / +0.4 (quad) when every leg has one.
  const legAES = legLocations(d).every((l) => d.equipment.some((e) => e.equipmentId === 'aes' && e.location === l));
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
  const cockpitMod = d.cockpitType === 'small' || d.cockpitType === 'torso-mounted' ? 0.95 : 1;
  if (cockpitMod !== 1) lines.push([`× 0.95 ${d.cockpitType === 'small' ? 'small' : 'torso-mounted'} cockpit`, cockpitMod]);

  return { total: round((defensive + offensive) * cockpitMod), defensive, offensive, lines, approximate: false };
}

const ENGINE_COST: Record<string, number> = {
  standard: 5000, xl: 20000, xxl: 100000, light: 15000, compact: 10000, ice: 1250, 'fuel-cell': 3500, fission: 7500,
};
const GYRO_COST: Record<string, number> = { standard: 300000, xl: 750000, compact: 400000, 'heavy-duty': 500000, none: 0 };
const ARMOR_COST: Record<string, number> = {
  standard: 10000, 'ferro-fibrous': 20000, 'light-ferro': 15000, 'heavy-ferro': 25000, stealth: 50000, reactive: 30000,
  reflective: 30000, hardened: 15000, 'ferro-lamellor': 35000, 'ballistic-reinforced': 25000, 'anti-penetrative': 15000,
  'heat-dissipating': 25000, 'impact-resistant': 20000, commercial: 3000, industrial: 5000, 'heavy-industrial': 10000, primitive: 5000,
};
/** Structure cost per ton of 'Mech (MegaMek). */
const STRUCTURE_COST: Record<string, number> = {
  standard: 400, 'endo-steel': 1600, 'endo-prototype': 4800, 'endo-composite': 3200, composite: 1600, reinforced: 6400, industrial: 300,
};
/** Armor BV multipliers (MegaMek). */
const ARMOR_BV_MULTIPLIER: Partial<Record<MechDesign['armorType'], number>> = {
  hardened: 2, reactive: 1.5, reflective: 1.5, 'ballistic-reinforced': 1.5, 'ferro-lamellor': 1.2, 'anti-penetrative': 1.2,
  'heat-dissipating': 1.1,
};

/** Cost of mounted weapons, ammo and equipment. */
function equipmentCost<T extends { equipmentId: string; location?: string | null }>(
  items: T[], weight: (eq: Equipment) => number, rating: number, mech?: MechDesign,
): number {
  let total = 0;
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || eq.managed) continue;
    if (eq.melee && mech) total += meleeCost(eq.melee, mech);
    else if (eq.category === 'Ammo') total += ammoValue(eq).cost;
    else if (eq.variableWeight === 'masc') total += rating * weight(eq) * 1000;
    else if (eq.variableWeight === 'supercharger') total += rating * 10000;
    else if (eq.variableWeight === 'targetingComputer') total += weight(eq) * 10000;
    // AES: tonnage × 500 per arm, × 700 per leg; partial wing: 50,000 per ton.
    else if (eq.variableWeight === 'aes' && mech) total += mech.tonnage * (legLocations(mech).includes(i.location as Location) ? 700 : 500);
    else if (eq.variableWeight === 'partialWing') total += weight(eq) * 50000;
    else if (eq.variableWeight === 'droneOS') total += weight(eq) * 10000 + 5000;
    else if (eq.variableWeight === 'tracks' && mech) total += Math.ceil((500 * rating * mech.tonnage) / 75) / legLocations(mech).length;
    else total += value(eq.id)?.cost ?? 0;
  }
  return total;
}

export function mechCost(d: MechDesign): CostBreakdown {
  const s = computeMech(d);
  const t = d.tonnage;
  const quad = isQuad(d);
  const arms = quad ? 0 : (['LA', 'RA'] as const).reduce((a, arm) => {
    const act = d.actuators[arm];
    return a + 100 * t + (act.lowerArm ? 50 * t : 0) + (act.lowerArm && act.hand ? 80 * t : 0);
  }, 0);
  const jumpCost = (d.jumpJetType === 'improved' ? 500 : 200) * t * s.jumpMP ** 2;
  const hsCost = (d.heatSinkType === 'double' ? 6000 : 2000) * Math.max(0, s.heatSinks.total - freeHeatSinks(d.engineType));
  const lines: [string, number][] = [
    ['Cockpit', { standard: 200000, small: 175000, 'torso-mounted': 750000, 'command-console': 700000, industrial: 100000, primitive: 200000, 'primitive-industrial': 100000, interface: 200000 }[d.cockpitType]],
    ['Life support', 50000],
    ['Sensors', 2000 * t],
    ['Musculature', (d.myomer === 'tsm' ? 16000 : d.myomer === 'industrial-tsm' ? 12000 : 2000) * t],
    ['Internal structure', STRUCTURE_COST[d.structureType] * t],
    ...(quad ? [] : [['Arm actuators', arms] as [string, number]]),
    ['Leg actuators', (quad ? 4 : 2) * (150 + 80 + 120) * t],
    ['Engine', (ENGINE_COST[d.engineType] * s.rating * t) / 75],
    ['Gyro', GYRO_COST[d.gyroType] * s.weights.gyro],
    ['Jump jets', jumpCost],
    ['Heat sinks', hsCost],
    ['Armor', ARMOR_COST[d.armorType] * s.weights.armor],
    ['Weapons & equipment', equipmentCost(d.equipment, (eq) => itemWeight(eq, d), s.rating, d)],
  ];
  if (d.fullHeadEjection) lines.push(['Full Head Ejection System', 1725000]);
  // Armored components: 150,000 C-bills per armored slot.
  const armoredSlots = armoredSlotCounts(d);
  if (armoredSlots[0] + armoredSlots[1]) lines.push(['Armored components', 150000 * (armoredSlots[0] + armoredSlots[1])]);
  if (d.environmentalSealing) lines.push(['Environmental sealing', 225 * t]);
  if (d.lam) {
    // Conversion equipment: 75% (65% bimodal) of internal structure plus weapons and equipment cost.
    const base = lines.find(([l]) => l === 'Internal structure')![1] + lines.find(([l]) => l === 'Weapons & equipment')![1];
    lines.push([`LAM conversion (${d.lam})`, base * (d.lam === 'bimodal' ? 0.65 : 0.75)]);
  }
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  // IndustrialMechs: × (1 + tonnage/400).
  const divisor = isIndustrial(d) ? 400 : 100;
  const multiplier = (1 + t / divisor) * (d.omni ? 1.25 : 1);
  lines.push([`× (1 + tonnage/${divisor})${d.omni ? ' × 1.25 OmniMech' : ''}`, multiplier]);
  return { total: round(subtotal * multiplier), lines, approximate: false };
}

// ---------------------------------------------------------------------------
// Combat vehicles (approximate)
// ---------------------------------------------------------------------------

const BODY_MODIFIER: Record<string, number> = {
  tracked: 0.9, wheeled: 0.8, hover: 0.7, vtol: 0.7, naval: 0.6, hydrofoil: 0.6, submarine: 0.6,
};
const VEHICLE_COST_DIVISOR: Record<string, number> = {
  tracked: 100, wheeled: 200, hover: 50, vtol: 30, naval: 200, hydrofoil: 100, submarine: 50,
};
const LIFT_COST: Record<string, number> = { hover: 20000, vtol: 40000, hydrofoil: 20000, submarine: 20000 };

export function vehicleBV(d: VehicleDesign): BVBreakdown {
  const s = computeVehicle(d);
  const lines: [string, number][] = [];
  const armor = s.armorTotal * 2.5;
  const structure = s.structurePoints * s.armorLocations.length * 1.5;
  const defEquip = defensiveEquipmentBV(d.equipment);
  const tmm = targetMovementModifier(s.flankMP) + (d.motive === 'vtol' ? 1 : 0);
  const body = BODY_MODIFIER[d.motive];
  const defensive = (armor + structure + defEquip) * body * (1 + tmm / 10);
  lines.push(['Armor', armor], ['Internal structure', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  lines.push([`Body type modifier`, body], [`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);

  const weapons = weaponEntries(d.equipment);
  const weaponBV = weapons.reduce((a, w) => a + w.bv, 0);
  const ammo = ammoBV(d.equipment, weapons);
  const tonnage = d.tonnage / 2;
  const sf = speedFactor(s.flankMP);
  const offensive = (weaponBV + ammo + tonnage) * sf;
  lines.push(['Weapons', weaponBV], ['Ammunition', ammo], ['Tonnage ÷ 2', tonnage], ['Speed factor', sf]);
  return { total: round(defensive + offensive), defensive, offensive, lines, approximate: true };
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
    ['Power amplifiers', 20000 * w.powerAmplifiers],
    ['Heat sinks', 2000 * Math.max(0, d.heatSinks - s.freeHeatSinks)],
    ['Armor', ARMOR_COST[d.armorType] * w.armor],
    ['Weapons & equipment', equipmentCost(d.equipment, (eq) => vehicleItemWeight(eq, d), s.rating)],
    ['Troop / cargo space', 5000 * w.cargo],
  ].filter(([, v]) => v !== 0) as [string, number][];
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  const multiplier = 1 + d.tonnage / VEHICLE_COST_DIVISOR[d.motive];
  lines.push([`× (1 + tonnage/${VEHICLE_COST_DIVISOR[d.motive]})`, multiplier]);
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
  const armor = s.armorTotal * 2.5;
  const structure = s.si * 2;
  const defEquip = defensiveEquipmentBV(d.equipment);
  // Clan fighters and fighters with CASE ignore explosives; otherwise −15 per ammo type, −1 per Gauss weapon.
  const protectedAll = d.techBase === 'Clan' || d.equipment.some((e) => e.equipmentId === 'case');
  let explosive = 0;
  if (!protectedAll) {
    const ammoTypes = new Set<string>();
    for (const item of d.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (!eq) continue;
      if (eq.category === 'Ammo' && eq.ammoFor && !isGaussType(eq.ammoFor) && !/plasma/.test(eq.ammoFor)) ammoTypes.add(eq.id);
      else if (eq.isWeapon && isGaussType(eq.id)) explosive += 1;
      else if (eq.explosive) explosive += 1;
    }
    explosive += 15 * ammoTypes.size;
  }
  const typeModifier = conventional ? 1.1 : 1.2;
  const defensive = Math.max(1, armor + structure + defEquip - explosive) * typeModifier;
  lines.push(['Armor', armor], ['Structural integrity', structure]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  lines.push([`Type modifier (${conventional ? 'conventional' : 'aerospace'} fighter)`, typeModifier]);

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
  if (d.cockpitType === 'small') {
    total *= 0.95;
    lines.push(['× 0.95 small cockpit', 0.95]);
  }
  return { total: round(total), defensive, offensive, lines, approximate: false };
}

export function fighterCost(d: FighterDesign): CostBreakdown {
  const s = computeFighter(d);
  const t = d.tonnage;
  const engine = (ENGINE_COST[d.engineType] * s.rating * t) / 75;
  const armor = ARMOR_COST[d.armorType] * s.weights.armor;
  const sinkCost = d.heatSinkType === 'double' ? 6000 : 2000;
  const equipment = equipmentCost(d.equipment, (eq) => fighterItemWeight(eq, d), s.rating);
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
  if (!dropship && d.techBase !== 'Clan' && !d.equipment.some((e) => e.equipmentId === 'case')) {
    const ammoTypes = new Set<string>();
    for (const item of d.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (!eq) continue;
      if (eq.category === 'Ammo' && eq.ammoFor && !isGaussType(eq.ammoFor) && !/plasma/.test(eq.ammoFor)) ammoTypes.add(eq.id);
      else if ((eq.isWeapon && isGaussType(eq.id)) || eq.explosive) explosive += 1;
    }
    explosive += 15 * ammoTypes.size;
  }
  const typeModifier = large ? (station ? 0.7 : 0.75) : 1;
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
    for (const [id, bv] of perWeapon) ammo += Math.min(bv, weapons.filter((w) => w.id === id).reduce((a, w) => a + w.bv, 0));
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
        const cap = arcWeapons[a].filter((w) => w.id === id).reduce((x, w) => x + w.bv, 0);
        ammo += Math.min(bv, cap) * factor[a];
      }
    }
    const names = ['nose', 'left', 'left rear', 'aft', 'right rear', 'right', 'left broadside', 'right broadside'];
    lines.push([`Primary arc: ${names[nose]}`, arcBV[nose]]);
  }
  // Large craft use a fixed speed factor: 1 MP (stations 0).
  const sfMP = large ? (station ? 0 : 1) : s.maxThrust;
  const sf = speedFactor(sfMP);
  const offensive = (weaponBV + ammo + offEquip) * sf;
  lines.push(['Weapons', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push([large ? `Speed factor (${sfMP} MP)` : `Speed factor (max thrust ${s.maxThrust})`, sf]);
  return { total: round(defensive + offensive), defensive, offensive, lines, approximate: false };
}

export function vesselCost(d: VesselDesign): CostBreakdown {
  const s = computeVessel(d);
  const t = d.tonnage;
  const arcsWithGuns = new Set(d.equipment.filter((e) => getEquipment(e.equipmentId)?.isWeapon && e.location && e.location !== 'HULL').map((e) => e.location)).size;
  const people = d.crew.crew + d.crew.passengers;
  const equipment = d.equipment.reduce((a, item) => {
    const eq = getEquipment(item.equipmentId);
    if (!eq) return a;
    if (eq.category === 'Ammo') return a + ammoValue(eq).cost * Math.ceil((item.shots ?? shotsPerBin(eq)) / shotsPerBin(eq));
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
    ['Armor', VESSEL_ARMOR_COST[d.armorType] * s.weights.armor],
    ['Heat sinks', (d.heatSinkType === 'double' ? 6000 : 2000) * d.heatSinks],
    ['Weapons & equipment', equipment],
  ];
  if (isLargeCraft(d)) return largeCraftCost(d, s, lines.slice(0, 7), equipment);
  let multiplier = 1 + t / 50;
  if (d.vesselType === 'dropship') {
    const bays = d.bays.reduce((a, b) => a + BAY_INFO[b.kind].cost * Math.ceil(BAY_INFO[b.kind].cargo ? BAY_INFO[b.kind].tons * b.size : b.size), 0);
    lines.push(['Docking collar', 10000], ['Bays and doors', bays + 1000 * s.bayDoors], ['Life boats / escape pods', 5000 * (d.lifeboats + d.escapePods)]);
    multiplier = d.shape === 'spheroid' ? 28 : 36;
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
  const lines: [string, number][] = [...common];
  if (warship) {
    lines.push(['Drive unit', 500 * d.safeThrust * (t / 100)], ['Engine', 1000 * d.safeThrust * t * 0.06]);
  } else {
    lines.push(['Engine (station-keeping)', 1000 * t * 0.012]);
  }
  lines.push(['Engine control unit', 1000]);
  if (!station) {
    let drive = 60000000 + 75000000 * docks + 25000000 + 5000000 * docks + 50000000 + 50000 * kfIntegrity(d)
      + 50000 * (30 + t / (warship ? 20000 : 7500)) + 500000 + 200000 * docks;
    if (warship) drive *= 5;
    if (d.lfBattery) drive *= 3;
    lines.push(['K-F drive', drive]);
    lines.push([warship ? 'K-F drive support systems' : 'K-F field initiator', warship ? 20000000 * (50 + t / 10000) : 10000000 * (t / 10000)]);
  }
  const bays = d.bays.reduce((a, b) => {
    const info = BAY_INFO[b.kind];
    const units = info.cargo ? info.tons * b.size : b.size;
    return a + info.cost * Math.ceil(units);
  }, 0);
  const decks = d.gravDecks.reduce((a, g) => a + (g < 100 ? 5000000 : g <= 250 ? 10000000 : 40000000), 0);
  lines.push(
    ['Attitude thrusters', 25000],
    ['Docking collars', 100000 * docks],
    ['Fuel tanks', 200 * d.fuelTons * 1.02],
    ['Armor', VESSEL_ARMOR_COST[d.armorType] * s.weights.armor],
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
