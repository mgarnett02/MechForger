/**
 * Battle Value (BV 2.0) and C-bill cost.
 *
 * BattleMech BV and cost follow the TechManual formulas and reproduce the
 * published values of canon designs (see tests). Combat vehicle BV and cost
 * follow the same structure with vehicle modifiers but are flagged as
 * approximate.
 */
import type { Location, MechDesign } from './types';
import { LOCATIONS, isQuad, legLocations } from './types';
import type { Equipment } from './equipment';
import { getEquipment, isDirectFire, itemWeight } from './equipment';
import { computeMech } from './construction';
import { runMP } from './tables';
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
  const weapon = eq.ammoFor ?? '';
  const scale = eq.tons; // 1 or 0.5
  if (MML_AMMO_BV[weapon]) {
    const srm = eq.id.endsWith('-srm');
    return { bv: MML_AMMO_BV[weapon][srm ? 1 : 0] * scale, cost: (srm ? 27000 : 30000) * scale };
  }
  const w = value(weapon);
  let bv = (w?.ammoBV ?? 0) * scale;
  if (eq.artemisAmmo) bv *= 1.2;
  return { bv, cost: (w?.ammoCost ?? 0) * scale };
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
}

/** Weapon BV with targeting-computer and Artemis IV bonuses. */
function weaponEntries(
  items: { equipmentId: string; location: string | null; rear?: boolean }[],
): WeaponEntry[] {
  const ids = items.map((i) => i.equipmentId);
  const hasTC = ids.some((id) => getEquipment(id)?.variableWeight === 'targetingComputer');
  // Artemis IV pairs with launchers in the same location (vehicles: anywhere).
  const artemisLeft = new Map<string, number>();
  for (const i of items) {
    if (i.equipmentId === 'artemis-iv' || i.equipmentId === 'clan-artemis-iv') {
      const k = i.location ?? '';
      artemisLeft.set(k, (artemisLeft.get(k) ?? 0) + 1);
    }
  }
  const out: WeaponEntry[] = [];
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || !eq.isWeapon || DEFENSIVE_IDS.has(eq.id)) continue;
    let bv = value(eq.id)?.bv ?? 0;
    if (hasTC && isDirectFire(eq)) bv *= 1.25;
    const k = i.location ?? '';
    if (eq.artemisCapable && (artemisLeft.get(k) ?? 0) > 0) {
      artemisLeft.set(k, artemisLeft.get(k)! - 1);
      bv *= 1.2;
    }
    out.push({ bv, heat: bvHeat(eq), rear: !!i.rear, id: eq.id });
  }
  return out;
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

// ---------------------------------------------------------------------------
// BattleMechs
// ---------------------------------------------------------------------------

export function mechBV(d: MechDesign): BVBreakdown {
  const s = computeMech(d);
  const lines: [string, number][] = [];
  const isClan = d.techBase === 'Clan';

  // --- Defensive battle rating
  const armor = s.armorTotal * 2.5;
  const isPoints = s.structure ? LOCATIONS.reduce((a, l) => a + s.structure![l], 0) : 0;
  const engineMod = d.engineType === 'xl' ? (isClan ? 0.75 : 0.5) : d.engineType === 'light' ? 0.75 : 1;
  const structure = isPoints * 1.5 * engineMod;
  const gyro = d.tonnage * (d.gyroType === 'heavy-duty' ? 1 : 0.5);
  const defEquip = defensiveEquipmentBV(d.equipment);

  // Explosive ammo (−15 per slot) and Gauss weapons (−1 per slot) where CASE does not protect.
  const caseIn = new Set(d.equipment.filter((e) => e.equipmentId === 'case').map((e) => e.location));
  const isXL = d.engineType === 'xl' && !isClan;
  const protectedLoc = (loc: Location): boolean => {
    if (loc === 'CT' || loc === 'HD' || legLocations(d).includes(loc)) return false;
    if (isClan) return true; // Clan CASE is built into every location
    if (isXL) return false; // losing the side torso destroys an IS XL engine anyway
    if (loc === 'LT' || loc === 'RT') return caseIn.has(loc);
    const torso: Location = loc === 'LA' ? 'LT' : 'RT';
    return caseIn.has(loc) || caseIn.has(torso);
  };
  let explosive = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq || !item.location || protectedLoc(item.location)) continue;
    if (eq.category === 'Ammo' && eq.ammoFor && !isGaussType(eq.ammoFor) && !/plasma/.test(eq.ammoFor)) explosive += 15;
    else if (eq.isWeapon && isGaussType(eq.id)) explosive += eq.slots;
  }

  const walk = d.walkMP;
  const run = s.mascRunMP ?? (s.tsmMP ? runMP(walk + 1) : s.runMP);
  const jump = s.jumpMP;
  const tmm = Math.max(targetMovementModifier(run), jump > 0 ? targetMovementModifier(jump) + 1 : 0);
  const defensive = Math.max(1, armor + structure + gyro + defEquip - explosive) * (1 + tmm / 10);
  lines.push(['Armor', armor], ['Internal structure', structure], ['Gyro', gyro]);
  if (defEquip) lines.push(['Defensive equipment', defEquip]);
  if (explosive) lines.push(['Explosive ammo / components', -explosive]);
  lines.push([`Defensive factor (TMM ${tmm})`, 1 + tmm / 10]);

  // --- Offensive battle rating
  const weapons = weaponEntries(d.equipment);
  const frontBV = weapons.filter((w) => !w.rear).reduce((a, w) => a + w.bv, 0);
  const rearBV = weapons.filter((w) => w.rear).reduce((a, w) => a + w.bv, 0);
  for (const w of weapons) {
    if (rearBV > frontBV ? !w.rear : w.rear) w.bv /= 2;
  }
  const moveHeat = Math.max(2, jump > 0 ? Math.max(3, jump) : 0);
  const heatEfficiency = 6 + s.heatSinks.dissipation - moveHeat;
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
  const tonnage = d.tonnage * (d.myomer === 'tsm' ? 1.5 : 1);
  const sf = speedFactor(run + Math.ceil(jump / 2));
  const offensive = (weaponBV + ammo + offEquip + tonnage) * sf;
  lines.push(['Weapons (heat-adjusted)', weaponBV], ['Ammunition', ammo]);
  if (offEquip) lines.push(['Offensive equipment', offEquip]);
  lines.push(['Tonnage', tonnage], ['Speed factor', sf]);

  return { total: round(defensive + offensive), defensive, offensive, lines, approximate: false };
}

const ENGINE_COST: Record<string, number> = { standard: 5000, xl: 20000, light: 15000, compact: 10000, ice: 1250 };
const GYRO_COST: Record<string, number> = { standard: 300000, xl: 750000, compact: 400000, 'heavy-duty': 500000 };
const ARMOR_COST: Record<string, number> = { standard: 10000, 'ferro-fibrous': 20000, 'light-ferro': 15000, 'heavy-ferro': 25000 };

/** Cost of mounted weapons, ammo and equipment. */
function equipmentCost<T extends { equipmentId: string }>(
  items: T[], weight: (eq: Equipment) => number, rating: number,
): number {
  let total = 0;
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq || eq.managed) continue;
    if (eq.category === 'Ammo') total += ammoValue(eq).cost;
    else if (eq.variableWeight === 'masc') total += rating * weight(eq) * 1000;
    else if (eq.variableWeight === 'targetingComputer') total += weight(eq) * 10000;
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
  const hsCost = (d.heatSinkType === 'double' ? 6000 : 2000) * Math.max(0, s.heatSinks.total - 10);
  const lines: [string, number][] = [
    ['Cockpit', d.cockpitType === 'small' ? 175000 : 200000],
    ['Life support', 50000],
    ['Sensors', 2000 * t],
    ['Musculature', (d.myomer === 'tsm' ? 16000 : 2000) * t],
    ['Internal structure', (d.structureType === 'endo-steel' ? 1600 : 400) * t],
    ...(quad ? [] : [['Arm actuators', arms] as [string, number]]),
    ['Leg actuators', (quad ? 4 : 2) * (150 + 80 + 120) * t],
    ['Engine', (ENGINE_COST[d.engineType] * s.rating * t) / 75],
    ['Gyro', GYRO_COST[d.gyroType] * s.weights.gyro],
    ['Jump jets', jumpCost],
    ['Heat sinks', hsCost],
    ['Armor', ARMOR_COST[d.armorType] * s.weights.armor],
    ['Weapons & equipment', equipmentCost(d.equipment, (eq) => itemWeight(eq, d), s.rating)],
  ];
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  const multiplier = (1 + t / 100) * (d.omni ? 1.25 : 1);
  lines.push([d.omni ? `× (1 + tonnage/100) × 1.25 OmniMech` : '× (1 + tonnage/100)', multiplier]);
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
