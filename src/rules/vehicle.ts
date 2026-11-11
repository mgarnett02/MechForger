/**
 * Combat vehicle construction (TechManual, Standard rules): tracked, wheeled,
 * hover, VTOL and naval (displacement hull, hydrofoil, submarine) vehicles.
 *
 * Vehicles share the equipment catalog and era / tech-base availability with
 * BattleMechs, but have their own chassis, engine, armor and slot rules.
 */
import type { BasicArmorType, BasicStructureType, TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra, isAvailableIn } from './eras';
import type { ComponentOption } from './tables';
import {
  ARMOR_OPTIONS, STRUCTURE_OPTIONS, armorPointsPerTon, componentEraOk, componentTechOk, engineWeight,
  standardFusionEngineWeight,
} from './tables';
import type { Equipment } from './equipment';
import {
  shortEquipmentName, getEquipment, isDirectFire, isEquipmentAvailable, usesAmmo,
} from './equipment';
import { armorPointsForTons, armorTonnage } from './armor';
import type { Issue } from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MotiveType = 'tracked' | 'wheeled' | 'hover' | 'vtol' | 'naval' | 'hydrofoil' | 'submarine';
export type VehicleEngineType = 'ice' | 'standard' | 'xl' | 'light' | 'compact';

export const VEHICLE_LOCATIONS = ['FR', 'LS', 'RS', 'RR', 'TU', 'RO', 'BD'] as const;
export type VehicleLocation = (typeof VEHICLE_LOCATIONS)[number];
/** Locations that carry armor (body holds equipment only). */
export type VehicleArmorLocation = Exclude<VehicleLocation, 'BD'>;

export const VEHICLE_LOCATION_NAMES: Record<VehicleLocation, string> = {
  FR: 'Front', LS: 'Left Side', RS: 'Right Side', RR: 'Rear', TU: 'Turret', RO: 'Rotor', BD: 'Body',
};

export interface VehicleItem {
  uid: string;
  equipmentId: string;
  location: VehicleLocation | null;
}

export interface VehicleDesign {
  /** Master Unit List id, for designs loaded from the canon list. */
  mulId?: number;
  schemaVersion: 1;
  unitType: 'vehicle';
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  motive: MotiveType;
  tonnage: number;
  cruiseMP: number;
  engineType: VehicleEngineType;
  structureType: BasicStructureType;
  armorType: BasicArmorType;
  /** Single turret (a chin turret on VTOLs). */
  turret: boolean;
  /** Total single heat sinks (fusion engines include 10 for free). */
  heatSinks: number;
  /** Troop compartment and cargo bay space, in tons. */
  cargo?: number;
  armor: Record<VehicleArmorLocation, number>;
  equipment: VehicleItem[];
}

export interface MotiveInfo {
  name: string;
  maxTonnage: number;
  /** Lift / rotor / dive equipment as a fraction of tonnage. */
  liftFraction: number;
  liftName: string | null;
  description: string;
}

export const MOTIVE_TYPES: Record<MotiveType, MotiveInfo> = {
  tracked: { name: 'Tracked', maxTonnage: 100, liftFraction: 0, liftName: null, description: 'Tanks: go almost anywhere on land.' },
  wheeled: { name: 'Wheeled', maxTonnage: 80, liftFraction: 0, liftName: null, description: 'Fast and cheap, but roads and open ground only.' },
  hover: { name: 'Hover', maxTonnage: 50, liftFraction: 0.1, liftName: 'Lift equipment', description: 'Very fast over land and water.' },
  vtol: { name: 'VTOL', maxTonnage: 30, liftFraction: 0.1, liftName: 'Rotor', description: 'Rotorcraft: flies over terrain; chin turret only.' },
  naval: { name: 'Naval (displacement hull)', maxTonnage: 300, liftFraction: 0, liftName: null, description: 'Surface ships.' },
  hydrofoil: { name: 'Naval (hydrofoil)', maxTonnage: 100, liftFraction: 0.1, liftName: 'Hydrofoil equipment', description: 'Fast surface craft.' },
  submarine: { name: 'Naval (submarine)', maxTonnage: 300, liftFraction: 0.1, liftName: 'Dive equipment', description: 'Operates underwater.' },
};

export const MOTIVE_ORDER: MotiveType[] = ['tracked', 'wheeled', 'hover', 'vtol', 'naval', 'hydrofoil', 'submarine'];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Round up to the half ton (the epsilon absorbs float error; `|| 0` avoids -0). */
const halfUp = (n: number) => Math.ceil(n * 2 - 1e-9) / 2 || 0;

/** Suspension factor subtracted from cruise MP × tonnage to get the engine rating. */
export function suspensionFactor(motive: MotiveType, tonnage: number): number {
  const band = Math.max(0, Math.ceil(tonnage / 10) - 1); // 0 = up to 10 t, 1 = 11–20 t, …
  switch (motive) {
    case 'tracked': return 0;
    case 'wheeled': return 20;
    case 'naval':
    case 'submarine': return 30;
    case 'hover': return [40, 85, 130, 175, 235][Math.min(band, 4)];
    case 'vtol': return [50, 95, 140][Math.min(band, 2)];
    case 'hydrofoil': return [60, 105, 150, 195, 255, 300, 345, 390, 435, 480][Math.min(band, 9)];
  }
}

/** Engine rating: cruise MP × tonnage − suspension factor, rounded up to the next 5 (minimum 10). */
export function vehicleEngineRating(motive: MotiveType, tonnage: number, cruiseMP: number): number {
  const raw = cruiseMP * tonnage - suspensionFactor(motive, tonnage);
  return Math.max(10, Math.ceil(raw / 5) * 5);
}

const isFusion = (e: VehicleEngineType) => e !== 'ice';

/** ICE engines weigh twice a standard fusion engine; fusion engines need 50% extra shielding. */
export function vehicleEngineWeight(type: VehicleEngineType, rating: number): number | null {
  if (type === 'ice') {
    const std = standardFusionEngineWeight(rating);
    return std === null ? null : std * 2;
  }
  const w = engineWeight(type, rating);
  return w === null ? null : halfUp(w * 1.5);
}

export const VEHICLE_ENGINE_LABELS: Record<VehicleEngineType, string> = {
  ice: 'ICE', standard: 'Fusion', xl: 'XL Fusion', light: 'Light Fusion', compact: 'Compact Fusion',
};

const opt = (label: string, techBase: TechBase | 'Both', firstEra: EraId): ComponentOption => ({ label, techBase, firstEra });

export const VEHICLE_ENGINE_OPTIONS: Record<VehicleEngineType, ComponentOption> = {
  ice: opt('ICE engines', 'Both', '3025'),
  standard: opt('Fusion engines', 'Both', '3025'),
  xl: opt('XL engines', 'Both', '3050'),
  light: opt('Light engines', 'IS', '3062'),
  compact: opt('Compact engines', 'IS', '3068'),
};

export function vehicleWeightClass(tonnage: number): string {
  if (tonnage < 40) return 'Light';
  if (tonnage < 60) return 'Medium';
  if (tonnage < 80) return 'Heavy';
  if (tonnage <= 100) return 'Assault';
  return 'Super-heavy';
}

/** Maximum armor: 3.5 points per ton (rounded down) plus 40. */
export function vehicleMaxArmor(tonnage: number): number {
  return Math.floor(tonnage * 3.5) + 40;
}

export const VTOL_ROTOR_MAX_ARMOR = 2;

/** Internal structure points per location: tonnage ÷ 10, rounded up. */
export function vehicleStructurePoints(tonnage: number): number {
  return Math.ceil(tonnage / 10);
}

/** Item slots: 5 plus 1 per 5 tons (rounded down). */
export function vehicleSlotCapacity(tonnage: number): number {
  return 5 + Math.floor(tonnage / 5);
}

/** Item slots used by Endo Steel / Ferro-Fibrous on vehicles. */
export function vehicleStructureSlots(type: BasicStructureType, techBase: TechBase): number {
  return type === 'endo-steel' ? (techBase === 'Clan' ? 1 : 2) : 0;
}

export function vehicleArmorSlots(type: BasicArmorType, techBase: TechBase): number {
  switch (type) {
    case 'ferro-fibrous': return techBase === 'Clan' ? 1 : 2;
    case 'light-ferro': return 1;
    case 'heavy-ferro': return 3;
    default: return 0;
  }
}

/** Armor locations a vehicle has. */
export function vehicleArmorLocations(d: Pick<VehicleDesign, 'motive' | 'turret'>): VehicleArmorLocation[] {
  const locs: VehicleArmorLocation[] = ['FR', 'LS', 'RS', 'RR'];
  if (d.turret) locs.push('TU');
  if (d.motive === 'vtol') locs.push('RO');
  return locs;
}

/** Where an item may be mounted: weapons in firing arcs, everything else in the body. */
export function vehicleItemLocations(eq: Equipment, d: Pick<VehicleDesign, 'motive' | 'turret'>): VehicleLocation[] {
  if (!eq.isWeapon) return ['BD'];
  const arcs: VehicleLocation[] = ['FR', 'LS', 'RS', 'RR'];
  if (d.turret) arcs.push('TU');
  return arcs;
}

/** Mech-only equipment that vehicles cannot mount. */
export function isVehicleEquipment(eq: Equipment): boolean {
  if (eq.managed) return false; // heat sinks, jump jets, structure slots, TSM
  if (eq.variableWeight === 'masc' || eq.variableWeight === 'supercharger') return false;
  if (eq.lamOnly || eq.melee || eq.capitalClass) return false; // Land-Air 'Mech systems and 'Mech melee weapons
  return true;
}

export function turretName(d: Pick<VehicleDesign, 'motive'>): string {
  return d.motive === 'vtol' ? 'Chin turret' : 'Turret';
}

// ---------------------------------------------------------------------------
// Design helpers
// ---------------------------------------------------------------------------

let vUid = 0;
export function newVehicleUid(): string {
  return `v-${Date.now().toString(36)}-${(vUid++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyVehicleArmor(): Record<VehicleArmorLocation, number> {
  return { FR: 0, LS: 0, RS: 0, RR: 0, TU: 0, RO: 0 };
}

export function newVehicle(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS'): VehicleDesign {
  return {
    schemaVersion: 1,
    unitType: 'vehicle',
    era,
    techBase,
    mixedTech: false,
    chassis: 'New Vehicle',
    model: 'NV-1',
    motive: 'tracked',
    tonnage: 40,
    cruiseMP: 4,
    engineType: 'ice',
    structureType: 'standard',
    armorType: 'standard',
    turret: false,
    heatSinks: 0,
    armor: emptyVehicleArmor(),
    equipment: [],
  };
}

export function isVehicle(d: unknown): d is VehicleDesign {
  return !!d && typeof d === 'object' && (d as { unitType?: unknown }).unitType === 'vehicle';
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export interface VehicleWeights {
  structure: number;
  engine: number;
  lift: number;
  controls: number;
  turret: number;
  powerAmplifiers: number;
  heatSinks: number;
  armor: number;
  equipment: number;
  cargo: number;
  total: number;
  free: number;
}

export interface VehicleSummary {
  rating: number;
  suspension: number;
  flankMP: number;
  engineWeight: number | null;
  weightClass: string;
  structurePoints: number;
  armorLocations: VehicleArmorLocation[];
  armorTotal: number;
  armorMax: number;
  armorPointsPerTon: number;
  freeHeatSinks: number;
  energyHeat: number;
  slots: { used: number; capacity: number };
  weights: VehicleWeights;
  unallocated: VehicleItem[];
}

export function vehicleItemWeight(eq: Equipment, d: VehicleDesign): number {
  if (eq.variableWeight === 'targetingComputer') {
    let tons = 0;
    for (const m of d.equipment) {
      const w = getEquipment(m.equipmentId);
      if (w && isDirectFire(w)) tons += w.tons;
    }
    return Math.max(1, Math.ceil(tons / (eq.techBase === 'Clan' ? 5 : 4) - 1e-9));
  }
  return eq.tons;
}

/** Item slots used: 1 per weapon or item, 1 per ammunition type, plus structure/armor slots. */
export function vehicleSlotsUsed(d: VehicleDesign): number {
  let used = vehicleStructureSlots(d.structureType, d.techBase) + vehicleArmorSlots(d.armorType, d.techBase);
  const ammoTypes = new Set<string>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    if (eq.category === 'Ammo') ammoTypes.add(eq.id);
    else used++;
  }
  return used + ammoTypes.size + ((d.cargo ?? 0) > 0 ? 1 : 0);
}

export function computeVehicle(d: VehicleDesign): VehicleSummary {
  const motive = MOTIVE_TYPES[d.motive];
  const rating = vehicleEngineRating(d.motive, d.tonnage, d.cruiseMP);
  // Hovercraft engines weigh at least 20% of the vehicle (TechManual).
  const baseEngine = vehicleEngineWeight(d.engineType, rating);
  const engineWt = baseEngine === null ? null
    : d.motive === 'hover' ? Math.max(baseEngine, halfUp(d.tonnage * 0.2)) : baseEngine;
  const ppt = armorPointsPerTon(d.armorType, d.techBase);
  const armorLocations = vehicleArmorLocations(d);
  const armorTotal = armorLocations.reduce((a, l) => a + (d.armor[l] ?? 0), 0);

  let equipment = 0;
  let turretItems = 0;
  let energyTons = 0;
  let energyHeat = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = vehicleItemWeight(eq, d);
    equipment += w;
    if (item.location === 'TU') turretItems += w;
    if (eq.isWeapon && eq.category === 'Energy') {
      energyTons += eq.tons;
      energyHeat += eq.heat;
    }
  }

  const freeHeatSinks = isFusion(d.engineType) ? 10 : 0;
  const weights: VehicleWeights = {
    structure: halfUp(d.tonnage * (d.structureType === 'endo-steel' ? 0.05 : 0.1)),
    engine: engineWt ?? 0,
    lift: halfUp(d.tonnage * motive.liftFraction),
    controls: halfUp(d.tonnage * 0.05),
    turret: d.turret ? halfUp(turretItems * 0.1) : 0,
    powerAmplifiers: isFusion(d.engineType) ? 0 : halfUp(energyTons * 0.1),
    heatSinks: Math.max(0, d.heatSinks - freeHeatSinks),
    armor: armorTonnage(armorTotal, ppt),
    equipment,
    cargo: d.cargo ?? 0,
    total: 0,
    free: 0,
  };
  weights.total = weights.structure + weights.engine + weights.lift + weights.controls + weights.turret +
    weights.powerAmplifiers + weights.heatSinks + weights.armor + weights.equipment + weights.cargo;
  weights.free = d.tonnage - weights.total;

  return {
    rating,
    suspension: suspensionFactor(d.motive, d.tonnage),
    flankMP: Math.ceil(d.cruiseMP * 1.5),
    engineWeight: engineWt,
    weightClass: vehicleWeightClass(d.tonnage),
    structurePoints: vehicleStructurePoints(d.tonnage),
    armorLocations,
    armorTotal,
    armorMax: vehicleMaxArmor(d.tonnage),
    armorPointsPerTon: ppt,
    freeHeatSinks,
    energyHeat,
    slots: { used: vehicleSlotsUsed(d), capacity: vehicleSlotCapacity(d.tonnage) },
    weights,
    unallocated: d.equipment.filter((e) => e.location === null),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function validateVehicle(d: VehicleDesign, s: VehicleSummary = computeVehicle(d)): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const info = (message: string) => issues.push({ severity: 'info', message });
  const motive = MOTIVE_TYPES[d.motive];
  const era = getEra(d.era);

  // Era / tech base
  if (!era) {
    error(`Unknown era "${d.era}".`);
  } else {
    if (!era.techBases.includes(d.techBase)) {
      error(`${TECH_BASE_NAMES[d.techBase]} vehicles cannot be built in the ${era.name} era.`);
    }
    const chosen = [VEHICLE_ENGINE_OPTIONS[d.engineType], STRUCTURE_OPTIONS[d.structureType], ARMOR_OPTIONS[d.armorType]];
    for (const o of chosen) {
      if (!componentEraOk(o, d.era, d.techBase)) error(`${o.label} cannot be used in the ${era.name} era.`);
      else if (!componentTechOk(o, d.techBase, d.mixedTech)) {
        error(`${o.label}: ${TECH_BASE_NAMES[o.techBase as TechBase]} technology only (needs mixed tech on a ${TECH_BASE_NAMES[d.techBase]} design).`);
      }
    }
    if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era.name} era.`);
  }

  // Chassis and movement
  if (!Number.isInteger(d.tonnage) || d.tonnage < 1 || d.tonnage > motive.maxTonnage) {
    error(`${motive.name} vehicles must weigh 1–${motive.maxTonnage} tons in whole tons (got ${d.tonnage}).`);
  }
  if (!Number.isInteger(d.cruiseMP) || d.cruiseMP < 1) error('Cruising MP must be a whole number of at least 1.');
  if (s.rating > 400) error(`Engine rating ${s.rating} exceeds the maximum of 400.`);
  else if (s.engineWeight === null) error(`No ${VEHICLE_ENGINE_LABELS[d.engineType]} engine exists with rating ${s.rating}.`);

  // Weight
  if (s.weights.free < 0) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 0) warn(`${fmt(s.weights.free)} tons unused.`);

  // Armor
  for (const l of VEHICLE_LOCATIONS) {
    if (l === 'BD') continue;
    const v = d.armor[l] ?? 0;
    if (!Number.isInteger(v) || v < 0) error(`${VEHICLE_LOCATION_NAMES[l]} armor must be a non-negative whole number.`);
    if (v > 0 && !s.armorLocations.includes(l)) {
      error(`${VEHICLE_LOCATION_NAMES[l]} armor is assigned but this vehicle has no ${VEHICLE_LOCATION_NAMES[l].toLowerCase()}.`);
    }
  }
  if (s.armorTotal > s.armorMax) error(`Armor total ${s.armorTotal} exceeds the maximum of ${s.armorMax}.`);
  if (d.motive === 'vtol' && d.armor.RO > VTOL_ROTOR_MAX_ARMOR) {
    error(`A VTOL rotor can carry at most ${VTOL_ROTOR_MAX_ARMOR} points of armor.`);
  }
  if (s.armorTotal === 0) warn('No armor allocated.');
  else {
    const unused = Math.min(armorPointsForTons(s.weights.armor, s.armorPointsPerTon), s.armorMax) - s.armorTotal;
    if (unused > 0) warn(`${unused} armor point(s) paid for but not allocated (armor is bought in half-ton lots).`);
  }

  // Heat: only energy weapons generate heat on vehicles.
  if (d.heatSinks < 0 || !Number.isInteger(d.heatSinks)) error('Heat sinks must be a non-negative whole number.');
  if ((d.cargo ?? 0) < 0 || ((d.cargo ?? 0) * 2) % 1 !== 0) error('Troop / cargo space must be a non-negative number of half tons.');
  if (s.freeHeatSinks > 0 && d.heatSinks < s.freeHeatSinks) {
    error(`Fusion engines come with ${s.freeHeatSinks} heat sinks; the total cannot be lower.`);
  }
  if (d.heatSinks < s.energyHeat) {
    error(`Energy weapons generate ${s.energyHeat} heat but only ${d.heatSinks} heat sink(s) are fitted.`);
  }

  // Slots
  if (s.slots.used > s.slots.capacity) {
    error(`Uses ${s.slots.used} item slots; a ${d.tonnage}-ton vehicle has ${s.slots.capacity}.`);
  }

  // Equipment
  const reported = new Set<string>();
  let tcs = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) {
      error(`Unknown equipment "${item.equipmentId}".`);
      continue;
    }
    if (eq.variableWeight === 'targetingComputer') tcs++;
    if (!isVehicleEquipment(eq) && !reported.has(`v-${eq.id}`)) {
      reported.add(`v-${eq.id}`);
      error(`${eq.name} cannot be mounted on a vehicle.`);
    }
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !reported.has(eq.id)) {
      reported.add(eq.id);
      if (eq.techBase !== 'Both' && eq.techBase !== d.techBase && !d.mixedTech) {
        error(`${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`);
      } else {
        error(`${eq.name} is not available in the ${era?.name ?? d.era} era.`);
      }
    }
    if (item.location && !vehicleItemLocations(eq, d).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${VEHICLE_LOCATION_NAMES[item.location].toLowerCase()}.`);
    }
  }
  if (tcs > 1) error('Only one targeting computer may be installed.');
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not allocated to a location.`);

  const ids = d.equipment.map((e) => e.equipmentId);
  const artemis = ids.filter((id) => id === 'artemis-iv' || id === 'clan-artemis-iv').length;
  const launchers = ids.filter((id) => getEquipment(id)?.artemisCapable).length;
  if (artemis > launchers) error(`${artemis} Artemis IV FCS but only ${launchers} LRM/SRM launcher(s) to link them to.`);

  const idSet = new Set(ids);
  const fed = new Set(ids.map((id) => getEquipment(id)?.ammoFor).filter(Boolean));
  for (const id of idSet) {
    const eq = getEquipment(id);
    if (eq?.ammoFor && !idSet.has(eq.ammoFor)) warn(`${eq.name} is carried but no ${getEquipment(eq.ammoFor)?.name} is mounted.`);
    if (eq && usesAmmo(eq) && !fed.has(id)) warn(`${eq.name} has no ammunition.`);
  }

  if (d.engineType === 'ice' && s.weights.powerAmplifiers > 0) {
    info(`Power amplifiers (${fmt(s.weights.powerAmplifiers)} t) are included for the energy weapons on this ICE engine.`);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setVehicleMotive(d: VehicleDesign, motive: MotiveType): VehicleDesign {
  const tonnage = Math.min(d.tonnage, MOTIVE_TYPES[motive].maxTonnage);
  const armor = { ...d.armor };
  if (motive !== 'vtol') armor.RO = 0;
  return { ...d, motive, tonnage, armor };
}

export function setVehicleTurret(d: VehicleDesign, turret: boolean): VehicleDesign {
  if (turret) return { ...d, turret };
  return {
    ...d,
    turret,
    armor: { ...d.armor, TU: 0 },
    equipment: d.equipment.map((e) => (e.location === 'TU' ? { ...e, location: null } : e)),
  };
}

export function setVehicleEngine(d: VehicleDesign, engineType: VehicleEngineType): VehicleDesign {
  // Switching to fusion brings 10 free heat sinks.
  const heatSinks = engineType !== 'ice' ? Math.max(d.heatSinks, 10) : d.heatSinks;
  return { ...d, engineType, heatSinks };
}

export function addVehicleItem(d: VehicleDesign, equipmentId: string): VehicleDesign {
  const eq = getEquipment(equipmentId);
  // Non-weapons can only go in the body, so place them straight away.
  const location: VehicleLocation | null = eq && !eq.isWeapon ? 'BD' : null;
  return { ...d, equipment: [...d.equipment, { uid: newVehicleUid(), equipmentId, location }] };
}

export function removeVehicleItem(d: VehicleDesign, uid: string): VehicleDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

export function setVehicleItemLocation(d: VehicleDesign, uid: string, location: VehicleLocation | null): VehicleDesign {
  return { ...d, equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, location } : e)) };
}

/** Spread armor points over the vehicle: 30% front, 20% each side, 15% rear, rest to the turret. */
export function distributeVehicleArmor(d: VehicleDesign, points: number): VehicleDesign {
  const max = vehicleMaxArmor(d.tonnage);
  let left = Math.max(0, Math.min(Math.floor(points), max));
  const armor = emptyVehicleArmor();
  if (d.motive === 'vtol') {
    armor.RO = Math.min(VTOL_ROTOR_MAX_ARMOR, left);
    left -= armor.RO;
  }
  const shares: [VehicleArmorLocation, number][] = d.turret
    ? [['FR', 0.3], ['LS', 0.2], ['RS', 0.2], ['RR', 0.12], ['TU', 0.18]]
    : [['FR', 0.34], ['LS', 0.24], ['RS', 0.24], ['RR', 0.18]];
  let given = 0;
  for (const [l, f] of shares) {
    armor[l] = Math.floor(left * f);
    given += armor[l];
  }
  armor.FR += left - given; // remainder to the front
  return { ...d, armor };
}

export function setVehicleArmorTonnage(d: VehicleDesign, tons: number): VehicleDesign {
  const ppt = armorPointsPerTon(d.armorType, d.techBase);
  return distributeVehicleArmor(d, armorPointsForTons(Math.round(tons * 2) / 2, ppt));
}

/** Coerce untrusted JSON into a vehicle design, or throw with a readable message. */
export function parseVehicle(raw: unknown): VehicleDesign {
  if (!isVehicle(raw)) throw new Error('Not a vehicle design.');
  const r = raw as unknown as Record<string, unknown>;
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Missing or invalid "${name}".`);
    return v;
  };
  const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
    options.includes(v as T) ? (v as T) : fallback;
  const armorIn = (r.armor ?? {}) as Record<string, unknown>;
  const armor = emptyVehicleArmor();
  for (const l of Object.keys(armor) as VehicleArmorLocation[]) {
    armor[l] = typeof armorIn[l] === 'number' ? (armorIn[l] as number) : 0;
  }
  if (!Array.isArray(r.equipment)) throw new Error('Missing equipment list.');
  const equipment: VehicleItem[] = r.equipment.map((raw2) => {
    const e = raw2 as Record<string, unknown>;
    if (typeof e?.equipmentId !== 'string') throw new Error('Equipment entry without an id.');
    const location = (VEHICLE_LOCATIONS as readonly string[]).includes(e.location as string)
      ? (e.location as VehicleLocation)
      : null;
    return { uid: newVehicleUid(), equipmentId: e.equipmentId, location };
  });
  return {
    schemaVersion: 1,
    unitType: 'vehicle',
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
    techBase: pick(r.techBase, ['IS', 'Clan'] as const, 'IS'),
    mixedTech: r.mixedTech === true,
    chassis: typeof r.chassis === 'string' ? r.chassis : 'Unnamed',
    model: typeof r.model === 'string' ? r.model : '',
    motive: pick(r.motive, MOTIVE_ORDER, 'tracked'),
    tonnage: num(r.tonnage, 'tonnage'),
    cruiseMP: num(r.cruiseMP, 'cruiseMP'),
    engineType: pick(r.engineType, ['ice', 'standard', 'xl', 'light', 'compact'] as const, 'ice'),
    structureType: pick(r.structureType, ['standard', 'endo-steel'] as const, 'standard'),
    armorType: pick(r.armorType, ['standard', 'ferro-fibrous', 'light-ferro', 'heavy-ferro'] as const, 'standard'),
    turret: r.turret === true,
    heatSinks: typeof r.heatSinks === 'number' ? r.heatSinks : 0,
    cargo: typeof r.cargo === 'number' && r.cargo > 0 ? r.cargo : undefined,
    armor,
    equipment,
  };
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

export function vehicleReadout(
  d: VehicleDesign, s: VehicleSummary = computeVehicle(d), values?: { bv: number; cost: number },
): string {
  const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const row = (label: string, mass: number | string) => `${label.padEnd(34)}${typeof mass === 'number' ? t(mass) : mass}`;
  const era = getEra(d.era);
  const motive = MOTIVE_TYPES[d.motive];
  const lines: string[] = [];
  lines.push(`${d.chassis} ${d.model}`.trim());
  lines.push('');
  lines.push(`Type: ${motive.name} vehicle, ${d.tonnage} tons (${s.weightClass})`);
  lines.push(d.mixedTech
    ? `Tech Base: Mixed (${TECH_BASE_NAMES[d.techBase]} chassis) (Advanced)`
    : `Tech Base: ${TECH_BASE_NAMES[d.techBase]} (${era?.rulesLevel ?? '?'})`);
  if (era) lines.push(`Era: ${era.name} (${era.year})`);
  if (values) {
    lines.push(`Battle Value: ≈${values.bv.toLocaleString('en-US')} (approx.)`);
    lines.push(`Cost: ≈${values.cost.toLocaleString('en-US')} C-bills (approx.)`);
  }
  lines.push('');
  lines.push(row('Equipment', 'Mass'));
  lines.push(row(`Internal Structure:${d.structureType === 'endo-steel' ? ' Endo Steel' : ''}`, s.weights.structure));
  lines.push(row(`Engine: ${s.rating} ${VEHICLE_ENGINE_LABELS[d.engineType]}`, s.weights.engine));
  lines.push(`    Cruising MP: ${d.cruiseMP}`);
  lines.push(`    Flanking MP: ${s.flankMP}`);
  lines.push(row(`Heat Sinks: ${d.heatSinks}`, s.weights.heatSinks));
  lines.push(row('Control Equipment:', s.weights.controls));
  if (motive.liftName) lines.push(row(`${motive.liftName}:`, s.weights.lift));
  if (s.weights.powerAmplifiers) lines.push(row('Power Amplifiers:', s.weights.powerAmplifiers));
  if (d.turret) lines.push(row(`${turretName(d)}:`, s.weights.turret));
  if (s.weights.cargo) lines.push(row('Troop / Cargo Space:', s.weights.cargo));
  const armorLabel = { standard: '', 'ferro-fibrous': ' (Ferro-Fibrous)', 'light-ferro': ' (Light Ferro-Fibrous)', 'heavy-ferro': ' (Heavy Ferro-Fibrous)' }[d.armorType];
  lines.push(row(`Armor Factor${armorLabel}: ${s.armorTotal}`, s.weights.armor));
  lines.push('');
  lines.push(`${''.padEnd(22)}Internal   Armor`);
  lines.push(`${''.padEnd(22)}Structure  Value`);
  for (const l of s.armorLocations) {
    lines.push(`    ${VEHICLE_LOCATION_NAMES[l].padEnd(18)}${String(s.structurePoints).padStart(5)}${String(d.armor[l]).padStart(9)}`);
  }
  lines.push('');
  const nameWidth = Math.max(30, ...d.equipment.map((e) => { const eq = getEquipment(e.equipmentId); return eq ? shortEquipmentName(eq, d).length + 4 : 0; }));
  lines.push(`${'Weapons and Ammo'.padEnd(nameWidth)}${'Location'.padEnd(12)}Tons`);
  const groups = new Map<string, { name: string; loc: string; tons: number; n: number }>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const key = `${eq.id}|${item.location}`;
    const g = groups.get(key);
    const w = vehicleItemWeight(eq, d);
    if (g) {
      g.n++;
      g.tons += w;
    } else {
      groups.set(key, { name: shortEquipmentName(eq, d), loc: item.location ? VEHICLE_LOCATION_NAMES[item.location] : '—', tons: w, n: 1 });
    }
  }
  for (const g of groups.values()) {
    lines.push(`${(g.n > 1 ? `${g.n} ${g.name}` : g.name).padEnd(nameWidth)}${g.loc.padEnd(12)}${t(g.tons)}`);
  }
  lines.push('');
  lines.push(`Item slots: ${s.slots.used} / ${s.slots.capacity}`);
  return lines.join('\n');
}
