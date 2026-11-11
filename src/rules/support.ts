/**
 * Support vehicle construction (TechManual): wheeled, tracked, hover, VTOL,
 * naval, rail, airship and fixed-wing support vehicles.
 *
 * Weights follow the TechManual support vehicle tables (base chassis and engine
 * values by size class, tech-rating multipliers, BAR armor, chassis
 * modifications, fuel, fire control and crew accommodations).
 */
import type { TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra, isAvailableIn } from './eras';
import type { Equipment } from './equipment';
import { shortEquipmentName, getEquipment, isDirectFire, isEquipmentAvailable, usesAmmo } from './equipment';
import type { Issue } from './validation';

// ---------------------------------------------------------------------------
// Types and tables
// ---------------------------------------------------------------------------

export type SVType = 'wheeled' | 'tracked' | 'hover' | 'vtol' | 'naval' | 'rail' | 'airship' | 'fixed-wing';
export type TechRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const TECH_RATINGS: TechRating[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export type SVEngine =
  | 'ice' | 'fusion' | 'fission' | 'fuel-cell' | 'battery' | 'solar' | 'steam' | 'maglev' | 'external' | 'none';
export type SizeClass = 'small' | 'medium' | 'large';

export const SV_LOCATIONS = ['FR', 'LS', 'RS', 'RR', 'TU', 'RO', 'NO', 'LW', 'RW', 'AF', 'BD'] as const;
export type SVLocation = (typeof SV_LOCATIONS)[number];
export type SVArmorLocation = Exclude<SVLocation, 'BD'>;

export const SV_LOCATION_NAMES: Record<SVLocation, string> = {
  FR: 'Front', LS: 'Left Side', RS: 'Right Side', RR: 'Rear', TU: 'Turret', RO: 'Rotor',
  NO: 'Nose', LW: 'Left Wing', RW: 'Right Wing', AF: 'Aft', BD: 'Body',
};

export interface SVItem {
  uid: string;
  equipmentId: string;
  location: SVLocation | null;
}

/** Crew, passenger and cargo space. Seats are counts; the rest are tons. */
export interface SVTransport {
  seats: number;
  pillionSeats: number;
  ejectionSeats: number;
  steerage: number;
  secondClass: number;
  firstClass: number;
  crewQuarters: number;
  cargo: number;
  troops: number;
}

export interface SupportVehicleDesign {
  /** Master Unit List id, for designs loaded from the canon list. */
  mulId?: number;
  schemaVersion: 1;
  unitType: 'support';
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  svType: SVType;
  tonnage: number;
  /** Cruising MP (safe thrust for fixed-wing and airships). */
  cruiseMP: number;
  structureTech: TechRating;
  engineTech: TechRating;
  armorTech: TechRating;
  engineType: SVEngine;
  /** Barrier Armor Rating, 2–10. */
  bar: number;
  chassisMods: string[];
  /** Fuel in tons. */
  fuel: number;
  turret: boolean;
  fireControl: 'none' | 'basic' | 'advanced';
  armor: Partial<Record<SVArmorLocation, number>>;
  transport: SVTransport;
  equipment: SVItem[];
}

interface SVTypeInfo {
  name: string;
  /** Upper tonnage of the medium and large size classes. */
  mediumMax: number;
  largeMax: number;
  baseChassis: [number, number, number];
  baseEngine: [number, number, number];
  aero: boolean;
  description: string;
}

export const SV_TYPES: Record<SVType, SVTypeInfo> = {
  wheeled: { name: 'Wheeled', mediumMax: 80, largeMax: 160, baseChassis: [0.12, 0.15, 0.18], baseEngine: [0.0025, 0.0075, 0.015], aero: false, description: 'Trucks, cars, APCs and other road vehicles.' },
  tracked: { name: 'Tracked', mediumMax: 100, largeMax: 200, baseChassis: [0.13, 0.15, 0.25], baseEngine: [0.006, 0.013, 0.025], aero: false, description: 'Bulldozers, crawlers and heavy haulers.' },
  hover: { name: 'Hover', mediumMax: 50, largeMax: 100, baseChassis: [0.2, 0.25, 0.3], baseEngine: [0.0025, 0.004, 0.007], aero: false, description: 'Hovercraft for land and water.' },
  vtol: { name: 'VTOL', mediumMax: 30, largeMax: 60, baseChassis: [0.2, 0.25, 0.3], baseEngine: [0.002, 0.0025, 0.004], aero: false, description: 'Helicopters and other rotorcraft.' },
  naval: { name: 'Naval', mediumMax: 300, largeMax: 300, baseChassis: [0.12, 0.15, 0.17], baseEngine: [0.004, 0.007, 0.009], aero: false, description: 'Boats and ships (hydrofoil and submersible as chassis modifications).' },
  rail: { name: 'Rail', mediumMax: 300, largeMax: 600, baseChassis: [0.15, 0.2, 0.3], baseEngine: [0.003, 0.004, 0.005], aero: false, description: 'Trains and maglev vehicles.' },
  airship: { name: 'Airship', mediumMax: 300, largeMax: 1000, baseChassis: [0.2, 0.25, 0.3], baseEngine: [0.004, 0.008, 0.012], aero: true, description: 'Lighter-than-air craft.' },
  'fixed-wing': { name: 'Fixed-wing', mediumMax: 100, largeMax: 200, baseChassis: [0.08, 0.1, 0.15], baseEngine: [0.005, 0.01, 0.015], aero: true, description: 'Airplanes: cargo planes, airliners, light fighters.' },
};

export const SV_TYPE_ORDER: SVType[] = ['wheeled', 'tracked', 'hover', 'vtol', 'naval', 'rail', 'airship', 'fixed-wing'];

const STRUCTURE_TECH: Record<TechRating, number> = { A: 1.6, B: 1.3, C: 1.15, D: 1.0, E: 0.85, F: 0.66 };

/** Engine weight multipliers by tech rating (0 = not available at that rating). */
const ENGINE_TECH: Record<SVEngine, number[]> = {
  ice: [0, 3.0, 2.0, 1.5, 1.3, 1.0],
  fusion: [0, 0, 1.5, 1.0, 0.75, 0.5],
  'fuel-cell': [0, 0, 1.2, 1.0, 0.9, 0.7],
  fission: [0, 0, 1.75, 1.5, 1.4, 1.3],
  maglev: [0, 0, 0.8, 0.7, 0.6, 0.5],
  steam: [4.0, 3.5, 3.0, 2.8, 2.6, 2.5],
  battery: [0, 0, 1.5, 1.2, 1.0, 0.8],
  solar: [0, 0, 5.0, 4.5, 4.0, 3.5],
  external: [0, 1.4, 1.0, 0.8, 0.7, 0.6],
  none: [0, 0, 0, 0, 0, 0],
};

export const SV_ENGINE_NAMES: Record<SVEngine, string> = {
  ice: 'Internal combustion', fusion: 'Fusion', fission: 'Fission', 'fuel-cell': 'Fuel cell', battery: 'Electric (battery)',
  solar: 'Electric (solar)', steam: 'Steam', maglev: 'Maglev', external: 'External power', none: 'None (trailer)',
};

const ALL: SVType[] = SV_TYPE_ORDER;
const ENGINE_TYPES_ALLOWED: Record<SVEngine, SVType[]> = {
  steam: ['wheeled', 'tracked', 'airship', 'naval', 'rail'],
  ice: ALL, external: ['rail'], battery: ALL, 'fuel-cell': ALL,
  solar: ['wheeled', 'tracked', 'airship', 'fixed-wing', 'naval'],
  maglev: ['rail'], fission: ALL, fusion: ALL, none: ['wheeled', 'tracked', 'rail'],
};

/** Engines that need fuel (combustion, fuel cell and steam). */
export function needsFuel(d: Pick<SupportVehicleDesign, 'engineType' | 'svType' | 'chassisMods'>): boolean {
  if (SV_TYPES[d.svType].aero) {
    const propOrAirship = d.svType === 'airship' || d.chassisMods.includes('prop');
    return !(propOrAirship && ['fusion', 'fission', 'solar'].includes(d.engineType));
  }
  return ['ice', 'fuel-cell', 'steam'].includes(d.engineType);
}

export interface ChassisMod {
  id: string;
  name: string;
  multiplier: number;
  types: SVType[];
  smallOnly?: boolean;
}

export const CHASSIS_MODS: ChassisMod[] = [
  { id: 'amphibious', name: 'Amphibious', multiplier: 1.75, types: ALL.filter((t) => t !== 'hover' && t !== 'naval') },
  { id: 'armored', name: 'Armored', multiplier: 1.5, types: ALL.filter((t) => t !== 'airship') },
  { id: 'bicycle', name: 'Bicycle', multiplier: 0.75, types: ['hover', 'wheeled'], smallOnly: true },
  { id: 'convertible', name: 'Convertible', multiplier: 1.1, types: ['hover', 'wheeled', 'tracked'] },
  { id: 'dune-buggy', name: 'Dune Buggy', multiplier: 1.5, types: ['wheeled'] },
  { id: 'environmental-sealing', name: 'Environmental Sealing', multiplier: 2.0, types: ALL },
  { id: 'external-power-pickup', name: 'External Power Pickup', multiplier: 1.1, types: ['rail'] },
  { id: 'hydrofoil', name: 'Hydrofoil', multiplier: 1.7, types: ['naval'] },
  { id: 'monocycle', name: 'Monocycle', multiplier: 0.5, types: ['hover', 'wheeled'], smallOnly: true },
  { id: 'off-road', name: 'Off-Road', multiplier: 1.5, types: ['wheeled'] },
  { id: 'prop', name: 'Prop', multiplier: 1.2, types: ['fixed-wing'] },
  { id: 'snowmobile', name: 'Snowmobile', multiplier: 1.75, types: ['wheeled', 'tracked'] },
  { id: 'stol', name: 'STOL', multiplier: 1.5, types: ['fixed-wing'] },
  { id: 'submersible', name: 'Submersible', multiplier: 1.8, types: ['naval'] },
  { id: 'tractor', name: 'Tractor', multiplier: 1.2, types: ['wheeled', 'tracked', 'naval', 'rail'] },
  { id: 'trailer', name: 'Trailer', multiplier: 0.8, types: ['wheeled', 'tracked', 'rail'] },
  { id: 'ultra-light', name: 'Ultra-Light', multiplier: 0.5, types: ALL, smallOnly: true },
  { id: 'vstol', name: 'VSTOL', multiplier: 2.0, types: ['fixed-wing'] },
];

/** BAR armor weight per point by armor tech rating (A–F; 0 = not available). */
const BAR_WEIGHT: Record<number, number[]> = {
  2: [0.040, 0.025, 0.016, 0.013, 0.012, 0.011],
  3: [0.060, 0.038, 0.024, 0.019, 0.017, 0.016],
  4: [0, 0.050, 0.032, 0.026, 0.023, 0.021],
  5: [0, 0.063, 0.040, 0.032, 0.028, 0.026],
  6: [0, 0, 0.048, 0.038, 0.034, 0.032],
  7: [0, 0, 0.056, 0.045, 0.040, 0.037],
  8: [0, 0, 0, 0.051, 0.045, 0.042],
  9: [0, 0, 0, 0.057, 0.051, 0.047],
  10: [0, 0, 0, 0.063, 0.056, 0.052],
};

/** Fuel weight per point for fixed-wing / airships by size class and engine tech rating (kg). */
const KG_PER_FUEL_POINT = [
  [50, 30, 23, 15, 13, 10],
  [63, 38, 25, 20, 18, 15],
  [83, 50, 35, 28, 23, 20],
];

const techIndex = (t: TechRating) => TECH_RATINGS.indexOf(t);

export function sizeClass(d: Pick<SupportVehicleDesign, 'svType' | 'tonnage'>): SizeClass {
  if (d.tonnage < 5) return 'small';
  return d.tonnage <= SV_TYPES[d.svType].mediumMax ? 'medium' : 'large';
}

const sizeIndex = (s: SizeClass) => (s === 'small' ? 0 : s === 'medium' ? 1 : 2);

/** Small support vehicles weigh to the kilogram; others to the half ton. */
function roundUp(w: number, small: boolean): number {
  const t = Math.round(w * 1e6) / 1e6;
  return (small ? Math.ceil(t * 1000) / 1000 : Math.ceil(t * 2) / 2) || 0;
}

export function svArmorLocations(d: Pick<SupportVehicleDesign, 'svType' | 'turret'>): SVArmorLocation[] {
  if (SV_TYPES[d.svType].aero) return ['NO', 'LW', 'RW', 'AF'];
  const locs: SVArmorLocation[] = ['FR', 'LS', 'RS', 'RR'];
  if (d.turret) locs.push('TU');
  if (d.svType === 'vtol') locs.push('RO');
  return locs;
}

export function svItemLocations(eq: Equipment, d: Pick<SupportVehicleDesign, 'svType' | 'turret'>): SVLocation[] {
  if (!eq.isWeapon) return ['BD'];
  return [...svArmorLocations(d).filter((l) => l !== 'RO'), 'BD'];
}

/** Maximum armor points: 4 + tonnage × a factor for the vehicle type. */
export function svMaxArmor(d: Pick<SupportVehicleDesign, 'svType' | 'tonnage'>): number {
  const large = sizeClass(d) === 'large';
  const factor = {
    airship: large ? 0.05 : 0.334, naval: large ? 0.05 : 0.334, rail: 0.5,
    'fixed-wing': 1.0, hover: 1.0, vtol: 1.0, tracked: 2.0, wheeled: 2.0,
  }[d.svType];
  return 4 + Math.floor(d.tonnage * factor);
}

export function barWeightPerPoint(bar: number, tech: TechRating): number {
  return BAR_WEIGHT[bar]?.[techIndex(tech)] ?? 0;
}

export function svEngineMultiplier(e: SVEngine, tech: TechRating): number {
  return ENGINE_TECH[e][techIndex(tech)];
}

export function kgPerFuelPoint(d: SupportVehicleDesign): number {
  const kg = KG_PER_FUEL_POINT[sizeIndex(sizeClass(d))][techIndex(d.engineTech)];
  return d.svType === 'airship' || d.chassisMods.includes('prop') ? Math.ceil(kg * 0.75) : kg;
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export interface SVWeights {
  structure: number;
  engine: number;
  fuel: number;
  armor: number;
  turret: number;
  fireControl: number;
  powerAmplifiers: number;
  heatSinks: number;
  accommodations: number;
  cargo: number;
  equipment: number;
  total: number;
  free: number;
}

export interface SupportSummary {
  size: SizeClass;
  flankMP: number;
  armorLocations: SVArmorLocation[];
  armorTotal: number;
  armorMax: number;
  heatSinks: number;
  weights: SVWeights;
  unallocated: SVItem[];
}

const isEnergyHeat = (eq: Equipment) => eq.isWeapon && eq.category === 'Energy';

export function computeSupport(d: SupportVehicleDesign): SupportSummary {
  const info = SV_TYPES[d.svType];
  const size = sizeClass(d);
  const small = size === 'small';
  const si = sizeIndex(size);

  let structure = d.tonnage * info.baseChassis[si] * STRUCTURE_TECH[d.structureTech];
  for (const id of d.chassisMods) structure *= CHASSIS_MODS.find((m) => m.id === id)?.multiplier ?? 1;

  let engine = 0;
  if (d.engineType !== 'none') {
    const mp = d.svType === 'rail' ? Math.max(0, d.cruiseMP - 2) : d.cruiseMP;
    engine = info.baseEngine[si] * (4 + mp * mp) * svEngineMultiplier(d.engineType, d.engineTech) * d.tonnage;
    if (d.engineType === 'fusion') engine = Math.max(engine, ['A', 'B', 'C'].includes(d.engineTech) ? 0.5 : 0.25);
    if (d.engineType === 'fission') engine = Math.max(engine, 5);
    if (d.svType === 'hover') engine = Math.max(engine, d.tonnage * 0.2);
  }

  let equipment = 0;
  let turretItems = 0;
  let weapons = 0;
  let energyAmp = 0;
  let heat = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = svItemWeight(eq, d);
    equipment += w;
    if (item.location === 'TU') turretItems += w;
    if (eq.isWeapon && !/ams$/.test(eq.id)) weapons += w;
    if (isEnergyHeat(eq)) {
      energyAmp += eq.tons;
      heat += eq.heat;
    }
  }
  const fusionLike = d.engineType === 'fusion' || d.engineType === 'fission';
  const armorLocations = svArmorLocations(d);
  const armorTotal = armorLocations.reduce((a, l) => a + (d.armor[l] ?? 0), 0);
  const t = d.transport;
  const heatSinks = small ? 0 : heat;

  const weights: SVWeights = {
    structure: roundUp(structure, small),
    engine: roundUp(engine, small),
    fuel: roundUp(d.fuel, small),
    armor: roundUp(armorTotal * barWeightPerPoint(d.bar, d.armorTech), small),
    turret: d.turret ? roundUp(turretItems * 0.1, small) : 0,
    fireControl: d.fireControl === 'none' ? 0 : roundUp(weapons / (d.fireControl === 'basic' ? 20 : 10), small),
    powerAmplifiers: small || fusionLike ? 0 : roundUp(energyAmp / 10, small),
    heatSinks,
    accommodations: Math.round((t.seats * 0.075 + t.pillionSeats * 0.025 + t.ejectionSeats * 0.1 +
      t.steerage + t.secondClass + t.firstClass + t.crewQuarters) * 1000) / 1000,
    cargo: t.cargo + t.troops,
    equipment,
    total: 0,
    free: 0,
  };
  const sum = weights.structure + weights.engine + weights.fuel + weights.armor + weights.turret +
    weights.fireControl + weights.powerAmplifiers + weights.heatSinks + weights.accommodations +
    weights.cargo + weights.equipment;
  weights.total = Math.round(sum * 1000) / 1000;
  weights.free = Math.round((d.tonnage - weights.total) * 1000) / 1000;

  return {
    size,
    flankMP: Math.ceil(d.cruiseMP * 1.5),
    armorLocations,
    armorTotal,
    armorMax: svMaxArmor(d),
    heatSinks,
    weights,
    unallocated: d.equipment.filter((e) => e.location === null),
  };
}

export function svItemWeight(eq: Equipment, d: SupportVehicleDesign): number {
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

export function isSupportEquipment(eq: Equipment): boolean {
  return !eq.managed && eq.variableWeight !== 'masc' && eq.variableWeight !== 'supercharger' && !eq.lamOnly && !eq.melee && !eq.capitalClass;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function validateSupport(d: SupportVehicleDesign, s: SupportSummary = computeSupport(d)): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const info = SV_TYPES[d.svType];
  const era = getEra(d.era);

  if (!era) error(`Unknown era "${d.era}".`);
  else {
    if (!era.techBases.includes(d.techBase)) error(`${TECH_BASE_NAMES[d.techBase]} vehicles cannot be built in the ${era.name} era.`);
    if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era.name} era.`);
  }

  if (!(d.tonnage > 0) || d.tonnage > info.largeMax) {
    error(`${info.name} support vehicles weigh up to ${info.largeMax} tons (got ${d.tonnage}).`);
  }
  if (s.size !== 'small' && (d.tonnage * 2) % 1 !== 0) error('Medium and large support vehicles are built in half-ton steps.');
  if (!Number.isInteger(d.cruiseMP) || d.cruiseMP < 0) error('Cruising MP must be a whole number.');
  if (d.engineType === 'none' && d.cruiseMP > 0) error('A vehicle without an engine (trailer) cannot move on its own.');
  if (d.engineType !== 'none' && d.cruiseMP < 1) error('Cruising MP must be at least 1.');

  if (!ENGINE_TYPES_ALLOWED[d.engineType].includes(d.svType)) {
    error(`${SV_ENGINE_NAMES[d.engineType]} engines cannot power ${info.name.toLowerCase()} support vehicles.`);
  } else if (d.engineType !== 'none' && svEngineMultiplier(d.engineType, d.engineTech) === 0) {
    error(`${SV_ENGINE_NAMES[d.engineType]} engines are not available at engine tech rating ${d.engineTech}.`);
  }
  if (d.svType === 'fixed-wing' && ['battery', 'solar'].includes(d.engineType) && !d.chassisMods.includes('prop')) {
    error('Electric fixed-wing aircraft need the Prop chassis modification.');
  }
  for (const id of d.chassisMods) {
    const m = CHASSIS_MODS.find((x) => x.id === id);
    if (!m) error(`Unknown chassis modification "${id}".`);
    else if (!m.types.includes(d.svType)) error(`The ${m.name} modification cannot be fitted to ${info.name.toLowerCase()} vehicles.`);
    else if (m.smallOnly && s.size !== 'small') error(`The ${m.name} modification is for small support vehicles only.`);
  }
  if (d.chassisMods.includes('hydrofoil') && d.tonnage > 100) error('Hydrofoils are limited to 100 tons.');

  if (s.weights.free < -1e-9) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 1e-9) warn(`${fmt(s.weights.free)} tons unused.`);

  if (needsFuel(d) && d.fuel <= 0) error('This engine needs some weight allocated to fuel.');
  if (!needsFuel(d) && d.fuel > 0) warn('This engine does not use fuel.');

  if (!Number.isInteger(d.bar) || d.bar < 2 || d.bar > 10) error('BAR must be between 2 and 10.');
  else if (barWeightPerPoint(d.bar, d.armorTech) === 0 && s.armorTotal > 0) {
    error(`BAR ${d.bar} armor is not available at armor tech rating ${d.armorTech}.`);
  }
  if (s.armorTotal > s.armorMax) error(`Armor total ${s.armorTotal} exceeds the maximum of ${s.armorMax}.`);
  if (d.svType === 'vtol' && (d.armor.RO ?? 0) > 2) error('A VTOL rotor can carry at most 2 points of armor.');
  if (d.turret && info.aero) error('Fixed-wing aircraft and airships cannot mount turrets.');

  if (s.size === 'small' && d.equipment.some((e) => getEquipment(e.equipmentId)?.isWeapon)) {
    error('Small support vehicles can only mount infantry weapons, which MechForger does not model.');
  }

  const reported = new Set<string>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) { error(`Unknown equipment "${item.equipmentId}".`); continue; }
    if (!isSupportEquipment(eq) && !reported.has(`x${eq.id}`)) {
      reported.add(`x${eq.id}`);
      error(`${eq.name} cannot be mounted on a support vehicle.`);
    }
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !reported.has(eq.id)) {
      reported.add(eq.id);
      error(eq.techBase !== 'Both' && eq.techBase !== d.techBase && !d.mixedTech
        ? `${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`
        : `${eq.name} is not available in the ${era?.name ?? d.era} era.`);
    }
    if (item.location && !svItemLocations(eq, d).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${SV_LOCATION_NAMES[item.location].toLowerCase()}.`);
    }
  }
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not allocated to a location.`);
  const ids = new Set(d.equipment.map((e) => e.equipmentId));
  const fed = new Set(d.equipment.map((e) => getEquipment(e.equipmentId)?.ammoFor).filter(Boolean));
  for (const id of ids) {
    const eq = getEquipment(id);
    if (eq?.ammoFor && !ids.has(eq.ammoFor)) warn(`${eq.name} is carried but no ${getEquipment(eq.ammoFor)?.name} is mounted.`);
    if (eq && usesAmmo(eq) && !fed.has(id)) warn(`${eq.name} has no ammunition.`);
  }
  if (s.armorTotal === 0) warn('No armor allocated.');
  if (s.size !== 'small' && d.fireControl === 'none' && [...ids].some((id) => getEquipment(id)?.isWeapon)) {
    warn('Weapons without a fire control system fire at +2 to-hit (+1 with basic fire control).');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

let sUid = 0;
export function newSupportUid(): string {
  return `s-${Date.now().toString(36)}-${(sUid++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyTransport(): SVTransport {
  return { seats: 0, pillionSeats: 0, ejectionSeats: 0, steerage: 0, secondClass: 0, firstClass: 0, crewQuarters: 0, cargo: 0, troops: 0 };
}

export function newSupportVehicle(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS'): SupportVehicleDesign {
  return {
    schemaVersion: 1, unitType: 'support', era, techBase, mixedTech: false,
    chassis: 'New Support Vehicle', model: 'SV-1', svType: 'wheeled', tonnage: 20, cruiseMP: 6,
    structureTech: 'D', engineTech: 'D', armorTech: 'D', engineType: 'ice', bar: 5, chassisMods: [],
    fuel: 1, turret: false, fireControl: 'none', armor: {}, transport: { ...emptyTransport(), seats: 2 },
    equipment: [],
  };
}

export function isSupport(d: unknown): d is SupportVehicleDesign {
  return !!d && typeof d === 'object' && (d as { unitType?: unknown }).unitType === 'support';
}

export function setSupportType(d: SupportVehicleDesign, svType: SVType): SupportVehicleDesign {
  const info = SV_TYPES[svType];
  const armorLocs = svArmorLocations({ svType, turret: d.turret && !info.aero });
  const armor: SupportVehicleDesign['armor'] = {};
  for (const l of armorLocs) armor[l] = d.armor[l] ?? 0;
  const engineType = ENGINE_TYPES_ALLOWED[d.engineType].includes(svType) ? d.engineType : 'ice';
  return {
    ...d, svType, armor, engineType,
    turret: d.turret && !info.aero,
    tonnage: Math.min(d.tonnage, info.largeMax),
    chassisMods: d.chassisMods.filter((id) => CHASSIS_MODS.find((m) => m.id === id)?.types.includes(svType)),
    equipment: d.equipment.map((e) => ({ ...e, location: null })),
  };
}

export function svEnginesFor(svType: SVType): SVEngine[] {
  return (Object.keys(ENGINE_TYPES_ALLOWED) as SVEngine[]).filter((e) => ENGINE_TYPES_ALLOWED[e].includes(svType));
}

export function addSupportItem(d: SupportVehicleDesign, equipmentId: string): SupportVehicleDesign {
  const eq = getEquipment(equipmentId);
  return { ...d, equipment: [...d.equipment, { uid: newSupportUid(), equipmentId, location: eq && !eq.isWeapon ? 'BD' : null }] };
}

export function distributeSupportArmor(d: SupportVehicleDesign, points: number): SupportVehicleDesign {
  const locs = svArmorLocations(d);
  const max = svMaxArmor(d);
  let left = Math.max(0, Math.min(Math.floor(points), max));
  const armor: SupportVehicleDesign['armor'] = {};
  if (locs.includes('RO')) {
    armor.RO = Math.min(2, left);
    left -= armor.RO;
  }
  const main = locs.filter((l) => l !== 'RO');
  const weightsFor: Partial<Record<SVArmorLocation, number>> = { FR: 3, NO: 3, LS: 2, RS: 2, LW: 2, RW: 2, RR: 1.5, AF: 1.5, TU: 2 };
  const total = main.reduce((a, l) => a + (weightsFor[l] ?? 1), 0);
  let given = 0;
  for (const l of main) {
    armor[l] = Math.floor((left * (weightsFor[l] ?? 1)) / total);
    given += armor[l]!;
  }
  armor[main[0]] = (armor[main[0]] ?? 0) + left - given;
  return { ...d, armor };
}

/** Coerce untrusted JSON into a support vehicle design. */
export function parseSupport(raw: unknown): SupportVehicleDesign {
  if (!isSupport(raw)) throw new Error('Not a support vehicle design.');
  const r = raw as unknown as Record<string, unknown>;
  const base = newSupportVehicle();
  const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const tr = (v: unknown) => pick(v, TECH_RATINGS, 'D');
  const transport = { ...emptyTransport(), ...(typeof r.transport === 'object' && r.transport ? r.transport as Partial<SVTransport> : {}) };
  const equipment: SVItem[] = Array.isArray(r.equipment)
    ? r.equipment.map((e: Record<string, unknown>) => ({
      uid: newSupportUid(),
      equipmentId: String(e.equipmentId),
      location: (SV_LOCATIONS as readonly string[]).includes(e.location as string) ? (e.location as SVLocation) : null,
    }))
    : [];
  return {
    ...base,
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
    techBase: pick(r.techBase, ['IS', 'Clan'] as const, 'IS'),
    mixedTech: r.mixedTech === true,
    chassis: typeof r.chassis === 'string' ? r.chassis : base.chassis,
    model: typeof r.model === 'string' ? r.model : '',
    svType: pick(r.svType, SV_TYPE_ORDER, 'wheeled'),
    tonnage: num(r.tonnage, base.tonnage),
    cruiseMP: num(r.cruiseMP, base.cruiseMP),
    structureTech: tr(r.structureTech), engineTech: tr(r.engineTech), armorTech: tr(r.armorTech),
    engineType: pick(r.engineType, Object.keys(ENGINE_TECH) as SVEngine[], 'ice'),
    bar: num(r.bar, 5),
    chassisMods: Array.isArray(r.chassisMods) ? r.chassisMods.filter((x): x is string => typeof x === 'string') : [],
    fuel: num(r.fuel, 0),
    turret: r.turret === true,
    fireControl: pick(r.fireControl, ['none', 'basic', 'advanced'] as const, 'none'),
    armor: typeof r.armor === 'object' && r.armor ? r.armor as SupportVehicleDesign['armor'] : {},
    transport,
    equipment,
  };
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

export function supportReadout(d: SupportVehicleDesign, s: SupportSummary = computeSupport(d)): string {
  const t = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
  const row = (label: string, mass: number | string) => `${label.padEnd(36)}${typeof mass === 'number' ? t(mass) : mass}`;
  const info = SV_TYPES[d.svType];
  const era = getEra(d.era);
  const w = s.weights;
  const lines: string[] = [];
  lines.push(`${d.chassis} ${d.model}`.trim(), '');
  lines.push(`Type: ${info.name} support vehicle, ${t(d.tonnage)} tons (${s.size})`);
  lines.push(`Tech Base: ${d.mixedTech ? `Mixed (${TECH_BASE_NAMES[d.techBase]} chassis)` : TECH_BASE_NAMES[d.techBase]}`);
  if (era) lines.push(`Era: ${era.name} (${era.year})`);
  lines.push(`Tech ratings: structure ${d.structureTech}, engine ${d.engineTech}, armor ${d.armorTech}`);
  if (d.chassisMods.length) lines.push(`Chassis modifications: ${d.chassisMods.map((id) => CHASSIS_MODS.find((m) => m.id === id)?.name ?? id).join(', ')}`);
  lines.push('', row('Equipment', 'Mass'));
  lines.push(row('Chassis / Structure:', w.structure));
  lines.push(row(`Engine: ${SV_ENGINE_NAMES[d.engineType]}`, w.engine));
  lines.push(`    ${info.aero ? 'Safe thrust' : 'Cruising MP'}: ${d.cruiseMP}`);
  lines.push(`    ${info.aero ? 'Max thrust' : 'Flanking MP'}: ${s.flankMP}`);
  if (w.fuel) lines.push(row('Fuel:', w.fuel));
  if (w.heatSinks) lines.push(row(`Heat Sinks: ${s.heatSinks}`, w.heatSinks));
  if (w.fireControl || d.fireControl !== 'none') lines.push(row(`Fire Control: ${d.fireControl}`, w.fireControl));
  if (w.powerAmplifiers) lines.push(row('Power Amplifiers:', w.powerAmplifiers));
  if (d.turret) lines.push(row('Turret:', w.turret));
  if (w.accommodations) lines.push(row('Crew & Passenger Accommodations:', w.accommodations));
  if (w.cargo) lines.push(row('Cargo / Troop Space:', w.cargo));
  lines.push(row(`Armor: BAR ${d.bar}, ${s.armorTotal} points`, w.armor));
  lines.push('');
  for (const l of s.armorLocations) lines.push(`    ${SV_LOCATION_NAMES[l].padEnd(18)}${String(d.armor[l] ?? 0).padStart(5)}`);
  const nameWidth = Math.max(30, ...d.equipment.map((e) => { const eq = getEquipment(e.equipmentId); return eq ? shortEquipmentName(eq, d).length + 4 : 0; }));
  lines.push('', `${'Weapons and Equipment'.padEnd(nameWidth)}${'Location'.padEnd(12)}Tons`);
  const groups = new Map<string, { name: string; loc: string; tons: number; n: number }>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const key = `${eq.id}|${item.location}`;
    const g = groups.get(key);
    const wt = svItemWeight(eq, d);
    if (g) { g.n++; g.tons += wt; } else groups.set(key, { name: shortEquipmentName(eq, d), loc: item.location ? SV_LOCATION_NAMES[item.location] : '—', tons: wt, n: 1 });
  }
  for (const g of groups.values()) lines.push(`${(g.n > 1 ? `${g.n} ${g.name}` : g.name).padEnd(nameWidth)}${g.loc.padEnd(12)}${t(g.tons)}`);
  return lines.join('\n');
}
