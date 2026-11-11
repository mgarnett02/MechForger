/**
 * Aerospace and conventional fighter construction (TechManual), following MegaMek's TestAero,
 * AeroBVCalculator and cost calculators.
 *
 * Fighters share the equipment catalog and era / tech-base availability with the rest of
 * MechForger. They have four armored arcs (nose, wings, aft) that hold weapons — at most five
 * "weapon slots" each, less any taken by advanced armor — and a fuselage for ammunition and
 * other equipment.
 */
import type { BasicArmorType, BasicCockpitType, HeatSinkType, TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra, isAvailableIn } from './eras';
import type { ComponentOption } from './tables';
import {
  ARMOR_OPTIONS, COCKPIT_OPTIONS, ENGINE_OPTIONS, HEAT_SINK_OPTIONS, armorPointsPerTon, componentEraOk,
  componentTechOk, engineWeight, standardFusionEngineWeight,
} from './tables';
import type { Equipment } from './equipment';
import { getEquipment, isEquipmentAvailable, itemWeight, shortEquipmentName } from './equipment';
import { armorPointsForTons, armorTonnage } from './armor';
import type { Issue } from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FighterType = 'aerospace' | 'conventional';
export type FighterEngineType = 'ice' | 'standard' | 'xl' | 'light' | 'compact';

/** Nose, left wing, right wing, aft (armored, weapon arcs) and the fuselage (equipment only). */
export const FIGHTER_LOCATIONS = ['NOS', 'LWG', 'RWG', 'AFT', 'FUS'] as const;
export type FighterLocation = (typeof FIGHTER_LOCATIONS)[number];
export type FighterArc = Exclude<FighterLocation, 'FUS'>;
export const FIGHTER_ARCS: readonly FighterArc[] = ['NOS', 'LWG', 'RWG', 'AFT'];

export const FIGHTER_LOCATION_NAMES: Record<FighterLocation, string> = {
  NOS: 'Nose', LWG: 'Left Wing', RWG: 'Right Wing', AFT: 'Aft', FUS: 'Fuselage',
};

export const FIGHTER_TYPE_NAMES: Record<FighterType, string> = {
  aerospace: 'Aerospace fighter', conventional: 'Conventional fighter',
};

export interface FighterItem {
  uid: string;
  equipmentId: string;
  location: FighterLocation | null;
  /** Rear-firing (wing weapons only). */
  rear?: boolean;
}

export interface FighterDesign {
  schemaVersion: 1;
  unitType: 'fighter';
  fighterType: FighterType;
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  /** OmniFighter (pod-mounted weapons): affects cost. */
  omni: boolean;
  chassis: string;
  model: string;
  tonnage: number;
  safeThrust: number;
  engineType: FighterEngineType;
  cockpitType: BasicCockpitType;
  heatSinkType: HeatSinkType;
  /** Total heat sinks (aerospace fighters; fusion engines carry 10 for free). */
  heatSinks: number;
  fuelTons: number;
  armorType: BasicArmorType;
  armor: Record<FighterArc, number>;
  /** Conventional fighters: vertical / short take-off and landing gear. */
  vstol: boolean;
  equipment: FighterItem[];
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const halfUp = (n: number) => Math.ceil(n * 2 - 1e-9) / 2 || 0;
const halfNearest = (n: number) => Math.round(n * 2) / 2;

export const FIGHTER_MAX_TONNAGE: Record<FighterType, number> = { aerospace: 100, conventional: 50 };
/** Weapon slots per arc before armor takes its share. */
export const SLOTS_PER_ARC = 5;
/** Fuel points per ton. */
export const FUEL_POINTS_PER_TON: Record<FighterType, number> = { aerospace: 80, conventional: 160 };

export const FIGHTER_ENGINE_LABELS: Record<FighterEngineType, string> = {
  ice: 'ICE', standard: 'Fusion', xl: 'XL Fusion', light: 'Light Fusion', compact: 'Compact Fusion',
};

export const FIGHTER_ENGINE_OPTIONS: Record<FighterEngineType, ComponentOption> = {
  ice: { label: 'ICE engines', techBase: 'Both', firstEra: '3025' },
  ...ENGINE_OPTIONS,
};

/** Aerospace armor names (ferro-aluminum is the aerospace counterpart of ferro-fibrous). */
export const FIGHTER_ARMOR_NAMES: Record<BasicArmorType, string> = {
  standard: 'Standard', 'ferro-fibrous': 'Ferro-Aluminum', 'light-ferro': 'Light Ferro-Aluminum',
  'heavy-ferro': 'Heavy Ferro-Aluminum',
};

/** Weapon slots each armor type takes from the arcs. */
export const FIGHTER_ARMOR_SLOTS: Record<BasicArmorType, number> = {
  standard: 0, 'ferro-fibrous': 2, 'light-ferro': 1, 'heavy-ferro': 4,
};

export function fighterEngineRating(d: Pick<FighterDesign, 'fighterType' | 'tonnage' | 'safeThrust'>): number {
  return d.fighterType === 'conventional' ? d.tonnage * d.safeThrust : d.tonnage * (d.safeThrust - 2);
}

/** Engine weight: the 'Mech table; ICE ×2; fusion in a conventional fighter needs 50% extra shielding. */
export function fighterEngineWeight(d: Pick<FighterDesign, 'fighterType' | 'engineType'>, rating: number): number | null {
  if (rating < 10) return null;
  if (d.engineType === 'ice') {
    const std = standardFusionEngineWeight(rating);
    return std === null ? null : std * 2;
  }
  const w = engineWeight(d.engineType, rating);
  if (w === null) return null;
  return d.fighterType === 'conventional' ? halfUp(w * 1.5) : w;
}

export function fighterWeightClass(d: Pick<FighterDesign, 'fighterType' | 'tonnage'>): string {
  if (d.fighterType === 'conventional') return d.tonnage <= 15 ? 'Light' : d.tonnage <= 30 ? 'Medium' : 'Heavy';
  return d.tonnage <= 45 ? 'Light' : d.tonnage <= 70 ? 'Medium' : 'Heavy';
}

/** Structural integrity: the greater of safe thrust and a tenth of the tonnage (round down). */
export function fighterSI(d: Pick<FighterDesign, 'tonnage' | 'safeThrust'>): number {
  return Math.max(Math.floor(d.tonnage / 10), d.safeThrust);
}

/** Maximum armor points: 8 per ton for aerospace fighters, 1 per ton for conventional fighters. */
export function fighterMaxArmor(d: Pick<FighterDesign, 'fighterType' | 'tonnage'>): number {
  return d.tonnage * (d.fighterType === 'conventional' ? 1 : 8);
}

/** Damage needed to roll for a critical hit in an arc: a tenth of its armor, rounded up. */
export function armorThreshold(points: number): number {
  return Math.ceil(points / 10);
}

/** Weapon slots in each arc after advanced armor takes its share (MegaMek's availableSpace). */
export function arcCapacity(d: Pick<FighterDesign, 'armorType'>): Record<FighterArc, number> {
  const cap: Record<FighterArc, number> = { NOS: SLOTS_PER_ARC, LWG: SLOTS_PER_ARC, RWG: SLOTS_PER_ARC, AFT: SLOTS_PER_ARC };
  let used = FIGHTER_ARMOR_SLOTS[d.armorType];
  // Two slots come from the wings; otherwise start at the aft and work forward.
  const order: FighterArc[] = used === 2 ? ['RWG', 'LWG'] : ['AFT', 'RWG', 'LWG', 'NOS'];
  for (let i = 0; used > 0; i = (i + 1) % order.length, used--) cap[order[i]]--;
  return cap;
}

/** Equipment that takes a weapon slot in its arc: weapons, ECM and active probes. */
export function usesWeaponSlot(eq: Equipment): boolean {
  if (eq.isWeapon) return true;
  return /ecm|active-probe|beagle|remote-sensor-dispenser/.test(eq.id);
}

/** Equipment a fighter can carry. */
export function isFighterEquipment(eq: Equipment): boolean {
  if (eq.id === 'remote-sensor-dispenser') return true; // the one utility item fighters carry (TM)
  if (eq.managed || eq.melee || eq.lamOnly || eq.capitalClass || eq.category === 'Utility' || eq.variableWeight === 'masc') return false;
  return true;
}

/** Where an item may be mounted. */
export function fighterItemLocations(eq: Equipment): FighterLocation[] {
  if (eq.category === 'Ammo' || eq.id === 'case') return ['FUS'];
  if (eq.id === 'heavy-gauss-rifle') return ['NOS', 'AFT'];
  if (eq.isWeapon || /artemis/.test(eq.id)) return ['NOS', 'LWG', 'RWG', 'AFT'];
  return [...FIGHTER_LOCATIONS];
}

const isFusion = (e: FighterEngineType) => e !== 'ice';

// ---------------------------------------------------------------------------
// New designs
// ---------------------------------------------------------------------------

let uidCounter = 0;
export function newFighterUid(): string {
  uidCounter++;
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${uidCounter}`;
}

export function emptyFighterArmor(): Record<FighterArc, number> {
  return { NOS: 0, LWG: 0, RWG: 0, AFT: 0 };
}

export function newFighter(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS', fighterType: FighterType = 'aerospace'): FighterDesign {
  const conventional = fighterType === 'conventional';
  return {
    schemaVersion: 1,
    unitType: 'fighter',
    fighterType,
    era,
    techBase,
    mixedTech: false,
    omni: false,
    chassis: conventional ? 'New Fighter' : 'New Aerofighter',
    model: 'NF-1',
    tonnage: conventional ? 20 : 50,
    safeThrust: conventional ? 6 : 6,
    engineType: conventional ? 'ice' : 'standard',
    cockpitType: 'standard',
    heatSinkType: 'single',
    heatSinks: conventional ? 0 : 10,
    fuelTons: conventional ? 2 : 5,
    armorType: 'standard',
    armor: emptyFighterArmor(),
    vstol: false,
    equipment: [],
  };
}

export function isFighter(d: unknown): d is FighterDesign {
  return !!d && typeof d === 'object' && (d as { unitType?: unknown }).unitType === 'fighter';
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export interface FighterWeights {
  engine: number;
  controls: number;
  fuel: number;
  heatSinks: number;
  vstol: number;
  powerAmplifiers: number;
  armor: number;
  equipment: number;
  total: number;
  free: number;
}

export interface FighterSummary {
  rating: number;
  maxThrust: number;
  engineWeight: number | null;
  weightClass: string;
  si: number;
  fuelPoints: number;
  armorTotal: number;
  armorMax: number;
  armorPointsPerTon: number;
  /** Heat sinks: total, weight-free, and the heat-neutral requirement (conventional fighters). */
  heatSinks: { total: number; free: number; required: number; dissipation: number };
  weaponHeat: number;
  slots: Record<FighterArc, { used: number; capacity: number }>;
  weights: FighterWeights;
  unallocated: FighterItem[];
}

export function fighterItemWeight(eq: Equipment, d: FighterDesign): number {
  return itemWeight(eq, { tonnage: d.tonnage, techBase: d.techBase, equipment: d.equipment as never });
}

/** Heat sinks a heat-neutral unit needs: the heat of its energy weapons that use no ammunition. */
export function heatNeutralRequirement(d: FighterDesign): number {
  let heat = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (eq?.isWeapon && eq.category === 'Energy' && (!eq.ammoPerTon || /plasma/.test(eq.id))) heat += eq.heat;
  }
  return heat;
}

export function computeFighter(d: FighterDesign): FighterSummary {
  const conventional = d.fighterType === 'conventional';
  const rating = fighterEngineRating(d);
  const engineWt = fighterEngineWeight(d, rating);
  const ppt = armorPointsPerTon(d.armorType, d.techBase);
  const armorTotal = FIGHTER_ARCS.reduce((a, l) => a + (d.armor[l] ?? 0), 0);
  const free = isFusion(d.engineType) ? 10 : 0;
  const required = heatNeutralRequirement(d);
  const total = conventional ? required : d.heatSinks;

  let equipment = 0;
  let weaponHeat = 0;
  let energyTons = 0;
  const capacity = arcCapacity(d);
  const slots = Object.fromEntries(FIGHTER_ARCS.map((l) => [l, { used: 0, capacity: capacity[l] }])) as FighterSummary['slots'];
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = fighterItemWeight(eq, d);
    equipment += w;
    if (eq.isWeapon) weaponHeat += eq.heat;
    if (eq.isWeapon && eq.category === 'Energy') energyTons += w;
    if (item.location && item.location !== 'FUS' && usesWeaponSlot(eq)) slots[item.location].used++;
  }

  const weights: FighterWeights = {
    engine: engineWt ?? 0,
    controls: conventional ? halfNearest(0.1 * d.tonnage) : d.cockpitType === 'small' ? 2 : 3,
    fuel: d.fuelTons,
    heatSinks: Math.max(0, total - free),
    vstol: conventional && d.vstol ? halfUp(0.05 * d.tonnage) : 0,
    // Conventional fighters with an ICE engine need power amplifiers for energy weapons.
    powerAmplifiers: conventional && d.engineType === 'ice' ? halfUp(0.1 * energyTons) : 0,
    armor: armorTonnage(armorTotal, ppt),
    equipment,
    total: 0,
    free: 0,
  };
  weights.total = weights.engine + weights.controls + weights.fuel + weights.heatSinks + weights.vstol
    + weights.powerAmplifiers + weights.armor + weights.equipment;
  weights.free = d.tonnage - weights.total;

  return {
    rating,
    maxThrust: Math.ceil(d.safeThrust * 1.5),
    engineWeight: engineWt,
    weightClass: fighterWeightClass(d),
    si: fighterSI(d),
    fuelPoints: Math.floor(d.fuelTons * FUEL_POINTS_PER_TON[d.fighterType] + 1e-9),
    armorTotal,
    armorMax: fighterMaxArmor(d),
    armorPointsPerTon: ppt,
    heatSinks: { total, free, required, dissipation: total * (d.heatSinkType === 'double' ? 2 : 1) },
    weaponHeat,
    slots,
    weights,
    unallocated: d.equipment.filter((e) => e.location === null),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function validateFighter(d: FighterDesign, s: FighterSummary = computeFighter(d)): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const conventional = d.fighterType === 'conventional';
  const typeName = FIGHTER_TYPE_NAMES[d.fighterType];
  const era = getEra(d.era);

  // Era / tech base
  if (!era) {
    error(`Unknown era "${d.era}".`);
  } else {
    if (!era.techBases.includes(d.techBase)) error(`${TECH_BASE_NAMES[d.techBase]} fighters cannot be built in the ${era.name} era.`);
    const chosen = [FIGHTER_ENGINE_OPTIONS[d.engineType], HEAT_SINK_OPTIONS[d.heatSinkType], ARMOR_OPTIONS[d.armorType],
      ...(conventional ? [] : [COCKPIT_OPTIONS[d.cockpitType]])];
    for (const o of chosen) {
      if (!componentEraOk(o, d.era, d.techBase)) error(`${o.label} cannot be used in the ${era.name} era.`);
      else if (!componentTechOk(o, d.techBase, d.mixedTech)) {
        error(`${o.label}: ${TECH_BASE_NAMES[o.techBase as TechBase]} technology only (needs mixed tech on a ${TECH_BASE_NAMES[d.techBase]} design).`);
      }
    }
    if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era.name} era.`);
    if (d.omni && !isAvailableIn('3050', d.era)) error(`OmniFighters cannot be built in the ${era.name} era.`);
  }

  // Chassis, engine and movement
  const max = FIGHTER_MAX_TONNAGE[d.fighterType];
  if (!Number.isInteger(d.tonnage) || d.tonnage < 5 || d.tonnage > max || d.tonnage % 5 !== 0) {
    error(`${typeName}s weigh 5–${max} tons in 5-ton steps (got ${d.tonnage}).`);
  }
  if (!Number.isInteger(d.safeThrust) || d.safeThrust < 1) error('Safe thrust must be a whole number of at least 1.');
  if (!conventional && d.engineType === 'ice') error('Aerospace fighters need a fusion engine.');
  if (s.rating < 10) error(`Engine rating ${s.rating} is below the minimum of 10.`);
  else if (s.rating > 400) error(`Engine rating ${s.rating} exceeds the maximum of 400.`);
  else if (s.engineWeight === null) error(`No ${FIGHTER_ENGINE_LABELS[d.engineType]} engine exists with rating ${s.rating}.`);
  if (conventional && d.cockpitType !== 'standard') error('Conventional fighters can only have a standard cockpit.');
  if (!conventional && d.vstol) error('Only conventional fighters fit VSTOL gear.');

  // Weight
  if (s.weights.free < 0) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 0) warn(`${fmt(s.weights.free)} tons unused.`);

  // Heat sinks
  if (!conventional && isFusion(d.engineType) && d.heatSinks < 10) {
    error(`A fusion engine comes with 10 heat sinks; the fighter must carry at least 10 (has ${d.heatSinks}).`);
  }

  // Fuel
  if (d.fuelTons < 0 || Math.round(d.fuelTons * 2) !== d.fuelTons * 2) error('Fuel comes in half-ton steps.');
  if (d.fuelTons === 0) warn('No fuel carried.');

  // Armor
  for (const l of FIGHTER_ARCS) {
    const v = d.armor[l];
    if (!Number.isInteger(v) || v < 0) error(`${FIGHTER_LOCATION_NAMES[l]} armor must be a non-negative whole number.`);
  }
  if (s.armorTotal > s.armorMax) error(`Armor totals ${s.armorTotal} points; the maximum for ${d.tonnage} tons is ${s.armorMax}.`);
  if (s.armorTotal === 0) warn('No armor allocated.');
  else {
    const paid = armorPointsForTons(s.weights.armor, s.armorPointsPerTon);
    if (paid > s.armorTotal && s.armorTotal < s.armorMax) warn(`${paid - s.armorTotal} armor points are paid for but not allocated.`);
  }

  // Weapon slots and locations
  for (const l of FIGHTER_ARCS) {
    const { used, capacity } = s.slots[l];
    if (used > capacity) error(`${FIGHTER_LOCATION_NAMES[l]} has ${used} weapons but room for ${capacity}${FIGHTER_ARMOR_SLOTS[d.armorType] ? ` (armor takes ${FIGHTER_ARMOR_SLOTS[d.armorType]} slot${FIGHTER_ARMOR_SLOTS[d.armorType] > 1 ? 's' : ''})` : ''}.`);
  }
  const unavailable = new Set<string>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) { error(`Unknown equipment "${item.equipmentId}".`); continue; }
    if (!isFighterEquipment(eq)) error(`${eq.name} cannot be mounted on a fighter.`);
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !unavailable.has(eq.id)) {
      unavailable.add(eq.id);
      error(eq.techBase !== 'Both' && eq.techBase !== d.techBase
        ? `${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`
        : `${eq.name} is not available in the ${era?.name ?? d.era} era.`);
    }
    if (item.location && !fighterItemLocations(eq).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${FIGHTER_LOCATION_NAMES[item.location].toLowerCase()}.`);
    }
    if (item.rear && item.location !== 'LWG' && item.location !== 'RWG') error(`${eq.name}: only wing weapons can face the rear.`);
    if (eq.id === 'case' && d.techBase === 'Clan' && !d.mixedTech) warn('Clan fighters have CASE built in; the extra CASE is not needed.');
  }
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not yet mounted in a location.`);

  // The wings must carry matching weapons.
  const wing = (l: FighterLocation) => d.equipment
    .filter((e) => e.location === l && getEquipment(e.equipmentId)?.isWeapon)
    .map((e) => `${e.equipmentId}${e.rear ? ':R' : ''}`).sort().join(',');
  if (wing('LWG') !== wing('RWG')) error('Left and right wing weapons must match.');

  return issues;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setFighterType(d: FighterDesign, fighterType: FighterType): FighterDesign {
  if (d.fighterType === fighterType) return d;
  const conventional = fighterType === 'conventional';
  return {
    ...d,
    fighterType,
    tonnage: Math.min(d.tonnage, FIGHTER_MAX_TONNAGE[fighterType]),
    engineType: conventional ? d.engineType : d.engineType === 'ice' ? 'standard' : d.engineType,
    cockpitType: conventional ? 'standard' : d.cockpitType,
    heatSinks: conventional ? 0 : Math.max(10, d.heatSinks),
    vstol: conventional ? d.vstol : false,
  };
}

/** Place a new item in the first location with a free weapon slot (or the fuselage). */
export function addFighterItem(d: FighterDesign, equipmentId: string): FighterDesign {
  const eq = getEquipment(equipmentId);
  if (!eq) return d;
  const s = computeFighter(d);
  const locs = fighterItemLocations(eq);
  const location = !usesWeaponSlot(eq)
    ? (locs.includes('FUS') ? 'FUS' : locs[0])
    : locs.find((l) => l !== 'FUS' && s.slots[l as FighterArc].used < s.slots[l as FighterArc].capacity) ?? null;
  return { ...d, equipment: [...d.equipment, { uid: newFighterUid(), equipmentId, location }] };
}

export function removeFighterItem(d: FighterDesign, uid: string): FighterDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

export function setFighterItemLocation(d: FighterDesign, uid: string, location: FighterLocation | null): FighterDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => (e.uid === uid
      ? { ...e, location, rear: location === 'LWG' || location === 'RWG' ? e.rear : undefined } : e)),
  };
}

export function setFighterItemRear(d: FighterDesign, uid: string, rear: boolean): FighterDesign {
  return { ...d, equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, rear: rear || undefined } : e)) };
}

/** Spread armor over the arcs: nose 30%, wings 25% each, aft 20%. */
export function distributeFighterArmor(d: FighterDesign, points: number): FighterDesign {
  const target = Math.max(0, Math.min(Math.floor(points), fighterMaxArmor(d)));
  const share: Record<FighterArc, number> = { NOS: 0.3, LWG: 0.25, RWG: 0.25, AFT: 0.2 };
  const armor = emptyFighterArmor();
  let used = 0;
  for (const l of FIGHTER_ARCS) { armor[l] = Math.floor(target * share[l]); used += armor[l]; }
  for (const l of ['NOS', 'LWG', 'RWG', 'AFT'] as FighterArc[]) {
    if (used >= target) break;
    armor[l]++; used++;
  }
  // Keep the wings even where possible.
  return { ...d, armor };
}

export function setFighterArmorTonnage(d: FighterDesign, tons: number): FighterDesign {
  const ppt = armorPointsPerTon(d.armorType, d.techBase);
  return distributeFighterArmor(d, armorPointsForTons(Math.round(tons * 2) / 2, ppt));
}

// ---------------------------------------------------------------------------
// Parsing saved files
// ---------------------------------------------------------------------------

export function parseFighter(raw: unknown): FighterDesign {
  if (!isFighter(raw)) throw new Error('Not a fighter design.');
  const r = raw as unknown as Record<string, unknown>;
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Missing or invalid "${name}".`);
    return v;
  };
  const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
    options.includes(v as T) ? (v as T) : fallback;
  const armorIn = (r.armor ?? {}) as Record<string, unknown>;
  const armor = emptyFighterArmor();
  for (const l of FIGHTER_ARCS) armor[l] = typeof armorIn[l] === 'number' ? (armorIn[l] as number) : 0;
  if (!Array.isArray(r.equipment)) throw new Error('Missing equipment list.');
  const equipment: FighterItem[] = r.equipment.map((x) => {
    const e = x as Record<string, unknown>;
    if (typeof e?.equipmentId !== 'string') throw new Error('Equipment entry without an id.');
    const location = (FIGHTER_LOCATIONS as readonly string[]).includes(e.location as string) ? (e.location as FighterLocation) : null;
    return { uid: newFighterUid(), equipmentId: e.equipmentId, location, ...(e.rear === true ? { rear: true } : {}) };
  });
  const fighterType = pick(r.fighterType, ['aerospace', 'conventional'] as const, 'aerospace');
  return {
    schemaVersion: 1,
    unitType: 'fighter',
    fighterType,
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
    techBase: pick(r.techBase, ['IS', 'Clan'] as const, 'IS'),
    mixedTech: r.mixedTech === true,
    omni: r.omni === true,
    chassis: typeof r.chassis === 'string' ? r.chassis : 'Unnamed',
    model: typeof r.model === 'string' ? r.model : '',
    tonnage: num(r.tonnage, 'tonnage'),
    safeThrust: num(r.safeThrust, 'safeThrust'),
    engineType: pick(r.engineType, ['ice', 'standard', 'xl', 'light', 'compact'] as const, 'standard'),
    cockpitType: pick(r.cockpitType, ['standard', 'small'] as const, 'standard'),
    heatSinkType: pick(r.heatSinkType, ['single', 'double'] as const, 'single'),
    heatSinks: typeof r.heatSinks === 'number' ? r.heatSinks : fighterType === 'conventional' ? 0 : 10,
    fuelTons: typeof r.fuelTons === 'number' ? r.fuelTons : 0,
    armorType: pick(r.armorType, ['standard', 'ferro-fibrous', 'light-ferro', 'heavy-ferro'] as const, 'standard'),
    armor,
    vstol: r.vstol === true,
    equipment,
  };
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

export function fighterReadout(
  d: FighterDesign, s: FighterSummary = computeFighter(d), values?: { bv: number; cost: number },
): string {
  const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const row = (label: string, mass: number | string) => `${label.padEnd(34)}${typeof mass === 'number' ? t(mass) : mass}`;
  const era = getEra(d.era);
  const conventional = d.fighterType === 'conventional';
  const lines: string[] = [];
  lines.push(`${d.chassis} ${d.model}`.trim());
  lines.push('');
  lines.push(`Type: ${FIGHTER_TYPE_NAMES[d.fighterType]}${d.omni ? ' (OmniFighter)' : ''}, ${d.tonnage} tons (${s.weightClass})`);
  lines.push(d.mixedTech
    ? `Tech Base: Mixed (${TECH_BASE_NAMES[d.techBase]} chassis) (Advanced)`
    : `Tech Base: ${TECH_BASE_NAMES[d.techBase]} (${era?.rulesLevel ?? '?'})`);
  if (era) lines.push(`Era: ${era.name} (${era.year})`);
  if (values) {
    lines.push(`Battle Value: ${values.bv.toLocaleString('en-US')}`);
    lines.push(`Cost: ${values.cost.toLocaleString('en-US')} C-bills`);
  }
  lines.push('');
  lines.push(row('Equipment', 'Mass'));
  lines.push(row(`Engine: ${s.rating} ${FIGHTER_ENGINE_LABELS[d.engineType]}`, s.weights.engine));
  lines.push(`    Safe Thrust: ${d.safeThrust}`);
  lines.push(`    Max Thrust: ${s.maxThrust}`);
  lines.push(`Structural Integrity: ${s.si}`);
  lines.push(row(`Heat Sinks: ${s.heatSinks.total}${d.heatSinkType === 'double' ? ' Double' : ''} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  lines.push(row(`Fuel: ${s.fuelPoints} points`, s.weights.fuel));
  lines.push(row(conventional ? 'Controls:' : `Cockpit:${d.cockpitType === 'small' ? ' Small' : ''}`, s.weights.controls));
  if (s.weights.vstol) lines.push(row('VSTOL Gear:', s.weights.vstol));
  if (s.weights.powerAmplifiers) lines.push(row('Power Amplifiers:', s.weights.powerAmplifiers));
  const armorLabel = d.armorType === 'standard' ? '' : ` (${FIGHTER_ARMOR_NAMES[d.armorType]})`;
  lines.push(row(`Armor Factor${armorLabel}: ${s.armorTotal}`, s.weights.armor));
  lines.push('');
  lines.push(`${''.padEnd(22)}Armor  Threshold`);
  for (const l of FIGHTER_ARCS) {
    lines.push(`    ${FIGHTER_LOCATION_NAMES[l].padEnd(18)}${String(d.armor[l]).padStart(5)}${String(armorThreshold(d.armor[l])).padStart(10)}`);
  }
  lines.push('');
  const nameWidth = Math.max(30, ...d.equipment.map((e) => { const eq = getEquipment(e.equipmentId); return eq ? shortEquipmentName(eq, d).length + 8 : 0; }));
  lines.push(`${'Weapons and Equipment'.padEnd(nameWidth)}${'Loc'.padEnd(6)}${'Heat'.padEnd(6)}Tons`);
  const groups = new Map<string, { name: string; loc: string; heat: number; tons: number; n: number }>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const key = `${eq.id}|${item.location}|${item.rear ? 'R' : ''}`;
    const w = fighterItemWeight(eq, d);
    const g = groups.get(key);
    if (g) { g.n++; g.tons += w; } else {
      groups.set(key, {
        name: shortEquipmentName(eq, d) + (item.rear ? ' (R)' : ''), loc: item.location ?? '—',
        heat: eq.isWeapon ? eq.heat : 0, tons: w, n: 1,
      });
    }
  }
  for (const g of groups.values()) {
    lines.push(`${(g.n > 1 ? `${g.n} ${g.name}` : g.name).padEnd(nameWidth)}${g.loc.padEnd(6)}${String(g.heat * g.n).padEnd(6)}${t(g.tons)}`);
  }
  return lines.join('\n');
}
