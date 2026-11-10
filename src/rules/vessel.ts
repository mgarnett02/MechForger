/**
 * Small craft and DropShip construction (TechManual / Strategic Operations), following MegaMek's
 * TestSmallCraft, DropShipBVCalculator and the small craft / DropShip cost calculators.
 *
 * Vessels share the equipment catalog with the rest of MechForger. Weapons sit in firing arcs
 * (nose, left and right sides — forward or rear-facing — and aft) and on DropShips are grouped into
 * weapon bays; other equipment goes in the hull. Ammunition is counted in shots.
 */
import type { HeatSinkType, TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra, isAvailableIn } from './eras';
import type { ComponentOption } from './tables';
import { HEAT_SINK_OPTIONS, componentEraOk, componentTechOk } from './tables';
import type { Equipment } from './equipment';
import { getEquipment, isEquipmentAvailable, itemWeight, shortEquipmentName } from './equipment';
import type { Issue } from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VesselType = 'small-craft' | 'dropship';
export type VesselShape = 'aerodyne' | 'spheroid';
export type VesselArmorType = 'standard' | 'ferro-aluminum' | 'light-ferro-aluminum' | 'heavy-ferro-aluminum';

export const VESSEL_LOCATIONS = ['NOS', 'LS', 'RS', 'AFT', 'HULL'] as const;
export type VesselLocation = (typeof VESSEL_LOCATIONS)[number];
export type VesselArc = Exclude<VesselLocation, 'HULL'>;
export const VESSEL_ARCS: readonly VesselArc[] = ['NOS', 'LS', 'RS', 'AFT'];

export const VESSEL_LOCATION_NAMES: Record<VesselLocation, string> = {
  NOS: 'Nose', LS: 'Left Side', RS: 'Right Side', AFT: 'Aft', HULL: 'Hull',
};
export const VESSEL_TYPE_NAMES: Record<VesselType, string> = { 'small-craft': 'Small craft', dropship: 'DropShip' };

export type BayKind =
  | 'mek' | 'fighter' | 'small-craft' | 'light-vehicle' | 'heavy-vehicle' | 'superheavy-vehicle' | 'protomek'
  | 'infantry-foot' | 'infantry-jump' | 'infantry-motorized' | 'infantry-mechanized' | 'battle-armor'
  | 'cargo' | 'liquid-cargo' | 'refrigerated-cargo' | 'insulated-cargo' | 'livestock-cargo';

export interface BayInfo {
  name: string;
  /** What `size` counts. */
  unit: string;
  /** Tons per unit of size. */
  tons: number;
  /** C-bills per unit of size (cargo and infantry bays have none in the cost rules used here). */
  cost: number;
  /** Personnel per unit (bay crews; for infantry bays, the troops themselves). */
  personnel: number;
  /** Clan infantry platoons are smaller. */
  clanPersonnel?: number;
  cargo: boolean;
}

export const BAY_INFO: Record<BayKind, BayInfo> = {
  mek: { name: "'Mech bay", unit: "'Mechs", tons: 150, cost: 20000, personnel: 2, cargo: false },
  fighter: { name: 'Fighter bay', unit: 'fighters', tons: 150, cost: 20000, personnel: 2, cargo: false },
  'small-craft': { name: 'Small craft bay', unit: 'small craft', tons: 200, cost: 20000, personnel: 5, cargo: false },
  'light-vehicle': { name: 'Light vehicle bay', unit: 'vehicles', tons: 50, cost: 10000, personnel: 5, cargo: false },
  'heavy-vehicle': { name: 'Heavy vehicle bay', unit: 'vehicles', tons: 100, cost: 10000, personnel: 8, cargo: false },
  'superheavy-vehicle': { name: 'Super-heavy vehicle bay', unit: 'vehicles', tons: 200, cost: 20000, personnel: 15, cargo: false },
  protomek: { name: 'ProtoMech bay', unit: 'points', tons: 50, cost: 10000, personnel: 6, cargo: false },
  'infantry-foot': { name: 'Infantry bay (foot)', unit: 'platoons', tons: 5, cost: 0, personnel: 28, clanPersonnel: 25, cargo: false },
  'infantry-jump': { name: 'Infantry bay (jump)', unit: 'platoons', tons: 6, cost: 0, personnel: 21, clanPersonnel: 20, cargo: false },
  'infantry-motorized': { name: 'Infantry bay (motorized)', unit: 'platoons', tons: 7, cost: 0, personnel: 28, clanPersonnel: 25, cargo: false },
  'infantry-mechanized': { name: 'Infantry bay (mechanized)', unit: 'squads', tons: 8, cost: 0, personnel: 7, clanPersonnel: 5, cargo: false },
  'battle-armor': { name: 'Battle armor bay', unit: 'squads', tons: 8, cost: 0, personnel: 6, cargo: false },
  cargo: { name: 'Cargo bay', unit: 'tons', tons: 1, cost: 0, personnel: 0, cargo: true },
  'liquid-cargo': { name: 'Liquid cargo bay', unit: 'tons', tons: 1 / 0.91, cost: 100, personnel: 0, cargo: true },
  'refrigerated-cargo': { name: 'Refrigerated cargo bay', unit: 'tons', tons: 1 / 0.87, cost: 200, personnel: 0, cargo: true },
  'insulated-cargo': { name: 'Insulated cargo bay', unit: 'tons', tons: 1 / 0.87, cost: 250, personnel: 0, cargo: true },
  'livestock-cargo': { name: 'Livestock cargo bay', unit: 'tons', tons: 1 / 0.83, cost: 2500, personnel: 0, cargo: true },
};
export const BAY_KINDS = Object.keys(BAY_INFO) as BayKind[];

export interface TransportBay {
  kind: BayKind;
  size: number;
  doors: number;
}

export type QuartersKind = 'crew' | 'first-class' | 'second-class' | 'steerage';
/** Tons of quarters per person. */
export const QUARTERS_TONS: Record<QuartersKind, number> = { crew: 7, 'first-class': 10, 'second-class': 7, steerage: 5 };
export const QUARTERS_NAMES: Record<QuartersKind, string> = {
  crew: 'Crew quarters', 'first-class': 'First-class quarters', 'second-class': 'Second-class quarters', steerage: 'Steerage quarters',
};
export const QUARTERS_KINDS = Object.keys(QUARTERS_TONS) as QuartersKind[];

export interface VesselCrew {
  /** Total crew, including officers, gunners and bay personnel. */
  crew: number;
  officers: number;
  gunners: number;
  passengers: number;
  marines: number;
  battleArmor: number;
}

export interface VesselItem {
  uid: string;
  equipmentId: string;
  location: VesselLocation | null;
  /** Rear-facing (side arcs only). */
  rear?: boolean;
  /** DropShips: weapon bay number within the arc; weapons with the same number share a bay. */
  bay?: number;
  /** Ammunition: number of shots. */
  shots?: number;
}

export interface VesselDesign {
  schemaVersion: 1;
  unitType: 'vessel';
  vesselType: VesselType;
  shape: VesselShape;
  /** Military DropShips get more weight-free heat sinks. */
  military: boolean;
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  tonnage: number;
  safeThrust: number;
  /** Structural integrity (chosen; it sets hull weight and maximum armor). */
  si: number;
  heatSinkType: HeatSinkType;
  heatSinks: number;
  fuelTons: number;
  armorType: VesselArmorType;
  armor: Record<VesselArc, number>;
  crew: VesselCrew;
  /** People housed in each kind of quarters. */
  quarters: Record<QuartersKind, number>;
  bays: TransportBay[];
  lifeboats: number;
  escapePods: number;
  equipment: VesselItem[];
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const halfUp = (n: number) => Math.ceil(n * 2 - 1e-9) / 2 || 0;
const halfDown = (n: number) => Math.floor(n * 2 + 1e-9) / 2;
const tonUp = (n: number) => Math.ceil(n - 1e-9);

export const VESSEL_ARMOR_NAMES: Record<VesselArmorType, string> = {
  standard: 'Standard Aerospace', 'ferro-aluminum': 'Ferro-Aluminum', 'light-ferro-aluminum': 'Light Ferro-Aluminum',
  'heavy-ferro-aluminum': 'Heavy Ferro-Aluminum',
};
export const VESSEL_ARMOR_OPTIONS: Record<VesselArmorType, ComponentOption> = {
  standard: { label: 'Standard aerospace armor', techBase: 'Both', firstEra: '3025' },
  'ferro-aluminum': { label: 'Ferro-aluminum armor', techBase: 'Both', firstEra: '3050' },
  'light-ferro-aluminum': { label: 'Light ferro-aluminum armor', techBase: 'IS', firstEra: '3068' },
  'heavy-ferro-aluminum': { label: 'Heavy ferro-aluminum armor', techBase: 'IS', firstEra: '3068' },
};
export const VESSEL_ARMOR_COST: Record<VesselArmorType, number> = {
  standard: 10000, 'ferro-aluminum': 20000, 'light-ferro-aluminum': 15000, 'heavy-ferro-aluminum': 25000,
};

/** Armor points per ton by tonnage band (MegaMek's ArmorType tables for small craft and DropShips). */
const PPT: Record<VesselArmorType, { IS: number[]; Clan: number[] }> = {
  standard: { IS: [16, 14, 12, 10, 8, 6], Clan: [20, 17, 14, 12, 10, 7] },
  'ferro-aluminum': { IS: [17.92, 15.68, 13.44, 11.2, 8.96, 6.72], Clan: [24, 20.4, 16.8, 14.4, 12, 8.4] },
  'light-ferro-aluminum': { IS: [16.96, 14.84, 12.72, 10.6, 8.48, 6.36], Clan: [16.96, 14.84, 12.72, 10.6, 8.48, 6.36] },
  'heavy-ferro-aluminum': { IS: [19.84, 17.36, 14.88, 12.4, 9.92, 7.44], Clan: [19.84, 17.36, 14.88, 12.4, 9.92, 7.44] },
};
const SPHEROID_BANDS = [12500, 20000, 35000, 50000, 65000];
const AERODYNE_BANDS = [6000, 9500, 12500, 17500, 25000];

export function vesselArmorPointsPerTon(d: Pick<VesselDesign, 'armorType' | 'techBase' | 'shape' | 'tonnage'>): number {
  const table = PPT[d.armorType][d.techBase];
  const bands = d.shape === 'spheroid' ? SPHEROID_BANDS : AERODYNE_BANDS;
  const i = bands.findIndex((b) => d.tonnage < b);
  return table[i === -1 ? table.length - 1 : i];
}

export const VESSEL_TONNAGE: Record<VesselType, { min: number; max: Record<VesselShape, number> }> = {
  // Canon includes escape pods and lifeboats well under 100 tons.
  'small-craft': { min: 5, max: { aerodyne: 200, spheroid: 200 } },
  dropship: { min: 200, max: { aerodyne: 35000, spheroid: 100000 } },
};

/** Weapon slots per arc before extra fire control is needed. */
export const VESSEL_SLOTS_PER_ARC = 12;

/** Fuel points per ton: 80 for small craft; DropShips get fewer as they grow. */
export function vesselFuelPointsPerTon(d: Pick<VesselDesign, 'vesselType' | 'tonnage'>): number {
  if (d.vesselType === 'small-craft') return 80;
  const t = d.tonnage;
  return t < 400 ? 80 : t < 800 ? 70 : t < 1200 ? 60 : t < 1900 ? 50 : t < 3000 ? 40 : t < 20000 ? 30 : t < 40000 ? 20 : 10;
}

export function vesselEngineWeight(d: Pick<VesselDesign, 'tonnage' | 'safeThrust' | 'techBase'>): number {
  return halfUp(d.tonnage * d.safeThrust * (d.techBase === 'Clan' ? 0.061 : 0.065));
}

/** Weight-free heat sinks, from the engine tonnage. */
export function vesselFreeHeatSinks(d: Pick<VesselDesign, 'tonnage' | 'safeThrust' | 'techBase' | 'shape' | 'military' | 'vesselType'>): number {
  const engine = vesselEngineWeight(d);
  const militaryDS = d.military && d.vesselType === 'dropship';
  return d.shape === 'spheroid'
    ? Math.floor(Math.sqrt(engine * (militaryDS ? 6.8 : 1.6)))
    : Math.floor(engine / (militaryDS ? 20 : 60));
}

export function vesselMaxArmorWeight(d: Pick<VesselDesign, 'si' | 'shape'>): number {
  return halfDown(d.si * (d.shape === 'spheroid' ? 3.6 : 4.5));
}

/** Bonus armor points from structural integrity (one SI's worth per location, hull included). */
export function siBonusArmor(d: Pick<VesselDesign, 'si'>): number {
  return 4 * d.si;
}

export function vesselMaxArmor(d: VesselDesign): number {
  return Math.floor(vesselArmorPointsPerTon(d) * vesselMaxArmorWeight(d) + siBonusArmor(d));
}

export function armorThreshold(points: number): number {
  return Math.ceil(points / 10);
}

/** Bay doors allowed. */
export function maxBayDoors(d: Pick<VesselDesign, 'vesselType' | 'shape' | 'tonnage'>): number {
  if (d.vesselType === 'small-craft') return d.shape === 'spheroid' ? 4 : 2;
  return 7 + Math.ceil(d.tonnage / 50000);
}

/** Equipment that takes a weapon slot in its arc. */
export function vesselUsesWeaponSlot(eq: Equipment): boolean {
  return eq.isWeapon || /ecm|active-probe|beagle|remote-sensor-dispenser/.test(eq.id);
}

export function isVesselEquipment(eq: Equipment): boolean {
  if (eq.id === 'remote-sensor-dispenser' || eq.id === 'cargo-container') return true;
  if (eq.managed || eq.melee || eq.lamOnly || eq.category === 'Utility' || eq.variableWeight === 'masc') return false;
  return true;
}

export function vesselItemLocations(eq: Equipment): VesselLocation[] {
  if (eq.isWeapon || /artemis/.test(eq.id)) return ['NOS', 'LS', 'RS', 'AFT'];
  return [...VESSEL_LOCATIONS];
}

/** Shots in one bin (one ton, or half a ton for half bins). */
export function shotsPerBin(eq: Equipment): number {
  const m = /\((\d+)\)\s*$/.exec(eq.name);
  return m ? Number(m[1]) : 1;
}

// ---------------------------------------------------------------------------
// New designs
// ---------------------------------------------------------------------------

let uidCounter = 0;
export function newVesselUid(): string {
  uidCounter++;
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${uidCounter}`;
}

export function emptyVesselArmor(): Record<VesselArc, number> {
  return { NOS: 0, LS: 0, RS: 0, AFT: 0 };
}

export function newVessel(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS', vesselType: VesselType = 'dropship'): VesselDesign {
  const dropship = vesselType === 'dropship';
  return {
    schemaVersion: 1,
    unitType: 'vessel',
    vesselType,
    shape: dropship ? 'spheroid' : 'aerodyne',
    military: true,
    era,
    techBase,
    mixedTech: false,
    chassis: dropship ? 'New DropShip' : 'New Small Craft',
    model: '',
    tonnage: dropship ? 2000 : 150,
    safeThrust: dropship ? 3 : 5,
    si: dropship ? 10 : 8,
    heatSinkType: 'single',
    heatSinks: 0,
    fuelTons: dropship ? 80 : 10,
    armorType: 'standard',
    armor: emptyVesselArmor(),
    crew: { crew: dropship ? 8 : 3, officers: dropship ? 2 : 1, gunners: 0, passengers: 0, marines: 0, battleArmor: 0 },
    quarters: { crew: dropship ? 8 : 3, 'first-class': 0, 'second-class': 0, steerage: 0 },
    bays: [],
    lifeboats: 0,
    escapePods: dropship ? 2 : 0,
    equipment: [],
  };
}

export function isVessel(d: unknown): d is VesselDesign {
  return !!d && typeof d === 'object' && (d as { unitType?: unknown }).unitType === 'vessel';
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export interface VesselWeights {
  structure: number;
  engine: number;
  controls: number;
  fuel: number;
  heatSinks: number;
  armor: number;
  fireControl: number;
  lifeboats: number;
  equipment: number;
  ammo: number;
  bays: number;
  quarters: number;
  total: number;
  free: number;
}

export interface WeaponBayGroup {
  arc: VesselArc;
  rear: boolean;
  bay: number;
  items: VesselItem[];
}

export interface VesselSummary {
  maxThrust: number;
  fuelPoints: number;
  fuelPointsPerTon: number;
  armorTotal: number;
  armorMax: number;
  armorMaxWeight: number;
  armorPointsPerTon: number;
  heatSinks: { total: number; free: number; dissipation: number };
  weaponHeat: number;
  slots: Record<VesselArc, number>;
  crewNeeded: { base: number; gunners: number; bayPersonnel: number; officers: number; total: number };
  quartersCapacity: number;
  peopleAboard: number;
  bayDoors: number;
  weaponBays: WeaponBayGroup[];
  weights: VesselWeights;
  unallocated: VesselItem[];
}

export function vesselItemWeight(eq: Equipment, d: VesselDesign, item?: VesselItem): number {
  if (eq.category === 'Ammo') {
    const bins = Math.ceil((item?.shots ?? shotsPerBin(eq)) / shotsPerBin(eq));
    return bins * eq.tons;
  }
  return itemWeight(eq, { tonnage: d.tonnage, techBase: d.techBase, equipment: d.equipment as never });
}

/** Standard and capital gunners: one per six standard weapons that reach past one hex. */
export function requiredGunners(d: VesselDesign): number {
  let standard = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq?.isWeapon) continue;
    if ((eq.range?.long ?? 0) <= 1 && !/^mml-/.test(eq.id)) continue;
    standard++;
  }
  return Math.ceil(standard / 6);
}

/** Weapons grouped into bays: by arc, facing and bay number (small craft: each weapon is its own). */
export function weaponBays(d: VesselDesign): WeaponBayGroup[] {
  const groups = new Map<string, WeaponBayGroup>();
  let solo = 1000;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq?.isWeapon || !item.location || item.location === 'HULL') continue;
    const bay = d.vesselType === 'small-craft' ? solo++ : item.bay ?? solo++;
    const key = `${item.location}|${item.rear ? 'R' : ''}|${bay}`;
    const g = groups.get(key);
    if (g) g.items.push(item);
    else groups.set(key, { arc: item.location, rear: !!item.rear, bay, items: [item] });
  }
  const order: Record<VesselArc, number> = { NOS: 0, LS: 1, RS: 2, AFT: 3 };
  return [...groups.values()].sort((a, b) => order[a.arc] - order[b.arc] || Number(a.rear) - Number(b.rear) || a.bay - b.bay);
}

export function computeVessel(d: VesselDesign): VesselSummary {
  const ppt = vesselArmorPointsPerTon(d);
  const armorTotal = VESSEL_ARCS.reduce((a, l) => a + (d.armor[l] ?? 0), 0);
  const free = vesselFreeHeatSinks(d);
  const fppt = vesselFuelPointsPerTon(d);

  let equipment = 0;
  let ammo = 0;
  let weaponHeat = 0;
  const slots: Record<VesselArc, number> = { NOS: 0, LS: 0, RS: 0, AFT: 0 };
  // Fire-control arcs: spheroids count rear-facing side weapons as arcs of their own.
  const fcSlots = new Map<string, { n: number; tons: number }>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = vesselItemWeight(eq, d, item);
    if (eq.category === 'Ammo') ammo += w; else equipment += w;
    if (eq.isWeapon) weaponHeat += eq.heat;
    if (item.location && item.location !== 'HULL' && vesselUsesWeaponSlot(eq)) {
      slots[item.location]++;
      const key = `${item.location}${d.shape === 'spheroid' && item.rear ? ':R' : ''}`;
      const a = fcSlots.get(key) ?? { n: 0, tons: 0 };
      a.n++; a.tons += w;
      fcSlots.set(key, a);
    }
  }
  // Each full 12 weapons beyond the first in an arc need extra fire control: 10% of the arc's weapons.
  let fireControl = 0;
  for (const { n, tons } of fcSlots.values()) {
    const excess = Math.floor((n - 1) / VESSEL_SLOTS_PER_ARC);
    if (excess > 0) fireControl += halfUp((excess * tons) / 10);
  }

  const bays = d.bays.reduce((a, b) => a + BAY_INFO[b.kind].tons * b.size, 0);
  const quarters = QUARTERS_KINDS.reduce((a, q) => a + QUARTERS_TONS[q] * (d.quarters[q] ?? 0), 0);
  const quartersCapacity = QUARTERS_KINDS.reduce((a, q) => a + (d.quarters[q] ?? 0), 0);
  const bayPersonnel = d.bays.reduce((a, b) => {
    const info = BAY_INFO[b.kind];
    return a + (d.techBase === 'Clan' && info.clanPersonnel !== undefined ? info.clanPersonnel : info.personnel) * Math.floor(b.size);
  }, 0);
  const base = 3 + (d.vesselType === 'dropship' ? Math.ceil(d.tonnage / 5000) + (d.military ? 1 : 0) : 0);
  const gunners = requiredGunners(d);
  const officers = Math.ceil((base + gunners) / 5);

  const weights: VesselWeights = {
    structure: halfUp((d.si * d.tonnage) / (d.shape === 'spheroid' ? 500 : 200)),
    engine: vesselEngineWeight(d),
    controls: d.vesselType === 'dropship' ? tonUp(d.tonnage * 0.0075) : halfUp(d.tonnage * 0.0075),
    fuel: halfUp(d.fuelTons * 1.02),
    heatSinks: Math.max(0, d.heatSinks - free),
    armor: armorTotal > 0 ? halfUp(Math.max(0, armorTotal - siBonusArmor(d)) / ppt) : 0,
    fireControl,
    lifeboats: (d.lifeboats + d.escapePods) * 7,
    equipment,
    ammo,
    bays,
    quarters,
    total: 0,
    free: 0,
  };
  weights.total = weights.structure + weights.engine + weights.controls + weights.fuel + weights.heatSinks + weights.armor
    + weights.fireControl + weights.lifeboats + weights.equipment + weights.ammo + weights.bays + weights.quarters;
  // As in MegaMek, the exact total is rounded up to the half ton.
  weights.total = halfUp(Math.round(weights.total * 1000) / 1000);
  weights.free = Math.round((d.tonnage - weights.total) * 1000) / 1000;

  return {
    maxThrust: Math.ceil(d.safeThrust * 1.5),
    fuelPoints: Math.floor(d.fuelTons * fppt + 1e-9),
    fuelPointsPerTon: fppt,
    armorTotal,
    armorMax: vesselMaxArmor(d),
    armorMaxWeight: vesselMaxArmorWeight(d),
    armorPointsPerTon: ppt,
    heatSinks: { total: d.heatSinks, free, dissipation: d.heatSinks * (d.heatSinkType === 'double' ? 2 : 1) },
    weaponHeat,
    slots,
    crewNeeded: { base, gunners, bayPersonnel, officers, total: base + gunners + bayPersonnel },
    quartersCapacity,
    // Bay personnel live with their bays; everyone else needs quarters.
    peopleAboard: Math.max(0, d.crew.crew - bayPersonnel) + d.crew.passengers + d.crew.marines + d.crew.battleArmor,
    bayDoors: d.bays.reduce((a, b) => a + b.doors, 0),
    weaponBays: weaponBays(d),
    weights,
    unallocated: d.equipment.filter((e) => e.location === null),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

export function validateVessel(d: VesselDesign, s: VesselSummary = computeVessel(d)): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const typeName = VESSEL_TYPE_NAMES[d.vesselType];
  const era = getEra(d.era);

  // Era / tech base
  if (!era) error(`Unknown era "${d.era}".`);
  else {
    if (!era.techBases.includes(d.techBase)) error(`${TECH_BASE_NAMES[d.techBase]} craft cannot be built in the ${era.name} era.`);
    for (const o of [HEAT_SINK_OPTIONS[d.heatSinkType], VESSEL_ARMOR_OPTIONS[d.armorType]]) {
      if (!componentEraOk(o, d.era, d.techBase)) error(`${o.label} cannot be used in the ${era.name} era.`);
      else if (!componentTechOk(o, d.techBase, d.mixedTech)) {
        error(`${o.label}: ${TECH_BASE_NAMES[o.techBase as TechBase]} technology only (needs mixed tech on a ${TECH_BASE_NAMES[d.techBase]} design).`);
      }
    }
    if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era.name} era.`);
  }

  // Chassis
  const lim = VESSEL_TONNAGE[d.vesselType];
  const max = lim.max[d.shape];
  if (!Number.isInteger(d.tonnage) || d.tonnage < lim.min || d.tonnage > max) {
    error(`${d.shape === 'spheroid' ? 'Spheroid' : 'Aerodyne'} ${typeName.toLowerCase()} weigh ${lim.min.toLocaleString('en-US')}–${max.toLocaleString('en-US')} tons (got ${d.tonnage.toLocaleString('en-US')}).`);
  }
  if (!Number.isInteger(d.safeThrust) || d.safeThrust < 0) error('Safe thrust must be a whole number.');
  if (!Number.isInteger(d.si) || d.si < 1) error('Structural integrity must be a whole number of at least 1.');

  // Weight
  if (s.weights.free < 0) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 0) warn(`${fmt(s.weights.free)} tons unused.`);

  // Heat sinks
  if (d.heatSinks < s.heatSinks.free) error(`The engine comes with ${s.heatSinks.free} weight-free heat sinks; carry at least that many (has ${d.heatSinks}).`);

  // Fuel
  if (d.fuelTons <= 0) warn('No fuel carried.');

  // Armor
  for (const l of VESSEL_ARCS) {
    const v = d.armor[l];
    if (!Number.isInteger(v) || v < 0) error(`${VESSEL_LOCATION_NAMES[l]} armor must be a non-negative whole number.`);
  }
  if (s.weights.armor > s.armorMaxWeight) {
    error(`Armor weighs ${fmt(s.weights.armor)} tons; structural integrity ${d.si} allows at most ${fmt(s.armorMaxWeight)} tons (${s.armorMax} points).`);
  }
  if (s.armorTotal === 0) warn('No armor allocated.');

  // Equipment
  const unavailable = new Set<string>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) { error(`Unknown equipment "${item.equipmentId}".`); continue; }
    if (!isVesselEquipment(eq)) error(`${eq.name} cannot be mounted on a ${typeName.toLowerCase()}.`);
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !unavailable.has(eq.id)) {
      unavailable.add(eq.id);
      error(eq.techBase !== 'Both' && eq.techBase !== d.techBase
        ? `${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`
        : `${eq.name} is not available in the ${era?.name ?? d.era} era.`);
    }
    if (item.location && !vesselItemLocations(eq).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${VESSEL_LOCATION_NAMES[item.location].toLowerCase()}.`);
    }
    if (item.rear && item.location !== 'LS' && item.location !== 'RS') error(`${eq.name}: only side-arc weapons can face the rear.`);
  }
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not yet mounted in a location.`);
  const side = (l: VesselLocation) => d.equipment
    .filter((e) => e.location === l && getEquipment(e.equipmentId)?.isWeapon)
    .map((e) => `${e.equipmentId}${e.rear ? ':R' : ''}`).sort().join(',');
  if (side('LS') !== side('RS')) error('Left and right side weapons must match.');
  for (const l of VESSEL_ARCS) {
    if (s.slots[l] > VESSEL_SLOTS_PER_ARC) {
      warn(`${VESSEL_LOCATION_NAMES[l]} carries ${s.slots[l]} weapons; beyond ${VESSEL_SLOTS_PER_ARC} they need extra fire control (included in the weight).`);
    }
  }

  // Crew and quarters
  const need = s.crewNeeded;
  if (d.crew.crew < need.total) {
    error(`Needs a crew of ${need.total} (${need.base} base + ${need.gunners} gunners${need.bayPersonnel ? ` + ${need.bayPersonnel} bay personnel` : ''}); has ${d.crew.crew}.`);
  }
  if (d.crew.officers < need.officers) error(`Needs at least ${need.officers} officers; has ${d.crew.officers}.`);
  if (s.quartersCapacity < s.peopleAboard) error(`Quarters house ${s.quartersCapacity} but ${s.peopleAboard} people need them (crew other than bay personnel, passengers, marines, battle armor).`);

  // Transport bays
  for (const b of d.bays) {
    const info = BAY_INFO[b.kind];
    if (b.size <= 0) error(`${info.name} needs a size.`);
    if (b.doors < 1 && !info.cargo && !b.kind.startsWith('infantry') && b.kind !== 'battle-armor') error(`${info.name} needs at least one door.`);
  }
  if (s.bayDoors > maxBayDoors(d)) error(`${s.bayDoors} bay doors; a ${typeName.toLowerCase()} this size can have ${maxBayDoors(d)}.`);

  return issues;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setVesselType(d: VesselDesign, vesselType: VesselType): VesselDesign {
  if (d.vesselType === vesselType) return d;
  const lim = VESSEL_TONNAGE[vesselType];
  return { ...d, vesselType, tonnage: Math.max(lim.min, Math.min(d.tonnage, lim.max[d.shape])) };
}

export function addVesselItem(d: VesselDesign, equipmentId: string): VesselDesign {
  const eq = getEquipment(equipmentId);
  if (!eq) return d;
  const location: VesselLocation = vesselUsesWeaponSlot(eq) || /artemis/.test(eq.id) ? 'NOS' : 'HULL';
  const item: VesselItem = { uid: newVesselUid(), equipmentId, location };
  if (eq.category === 'Ammo') item.shots = shotsPerBin(eq);
  if (eq.isWeapon && d.vesselType === 'dropship') {
    // A new weapon opens a bay of its own; join it to another by giving it the same bay number.
    const used = d.equipment.filter((e) => e.location === location).map((e) => e.bay ?? 0);
    item.bay = Math.max(0, ...used) + 1;
  }
  return { ...d, equipment: [...d.equipment, item] };
}

export function updateVesselItem(d: VesselDesign, uid: string, patch: Partial<VesselItem>): VesselDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => {
      if (e.uid !== uid) return e;
      const next = { ...e, ...patch };
      if (next.location !== 'LS' && next.location !== 'RS') delete next.rear;
      return next;
    }),
  };
}

export function removeVesselItem(d: VesselDesign, uid: string): VesselDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

/** Spread armor: nose 30%, sides 25% each, aft 20%. */
export function distributeVesselArmor(d: VesselDesign, points: number): VesselDesign {
  const target = Math.max(0, Math.min(Math.floor(points), vesselMaxArmor(d)));
  const share: Record<VesselArc, number> = { NOS: 0.3, LS: 0.25, RS: 0.25, AFT: 0.2 };
  const armor = emptyVesselArmor();
  let used = 0;
  for (const l of VESSEL_ARCS) { armor[l] = Math.floor(target * share[l]); used += armor[l]; }
  for (const l of VESSEL_ARCS) { if (used >= target) break; armor[l]++; used++; }
  return { ...d, armor };
}

export function setVesselArmorTonnage(d: VesselDesign, tons: number): VesselDesign {
  const t = Math.min(halfDown(tons), vesselMaxArmorWeight(d));
  return distributeVesselArmor(d, Math.floor(t * vesselArmorPointsPerTon(d)) + siBonusArmor(d));
}

// ---------------------------------------------------------------------------
// Parsing saved files
// ---------------------------------------------------------------------------

export function parseVessel(raw: unknown): VesselDesign {
  if (!isVessel(raw)) throw new Error('Not a small craft or DropShip design.');
  const r = raw as unknown as Record<string, unknown>;
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Missing or invalid "${name}".`);
    return v;
  };
  const n = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
    options.includes(v as T) ? (v as T) : fallback;
  const armorIn = (r.armor ?? {}) as Record<string, unknown>;
  const armor = emptyVesselArmor();
  for (const l of VESSEL_ARCS) armor[l] = n(armorIn[l]);
  const c = (r.crew ?? {}) as Record<string, unknown>;
  const q = (r.quarters ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.equipment)) throw new Error('Missing equipment list.');
  const equipment: VesselItem[] = r.equipment.map((x) => {
    const e = x as Record<string, unknown>;
    if (typeof e?.equipmentId !== 'string') throw new Error('Equipment entry without an id.');
    const location = (VESSEL_LOCATIONS as readonly string[]).includes(e.location as string) ? (e.location as VesselLocation) : null;
    const item: VesselItem = { uid: newVesselUid(), equipmentId: e.equipmentId, location };
    if (e.rear === true) item.rear = true;
    if (typeof e.bay === 'number') item.bay = e.bay;
    if (typeof e.shots === 'number') item.shots = e.shots;
    return item;
  });
  const bays: TransportBay[] = Array.isArray(r.bays)
    ? r.bays.flatMap((x) => {
        const b = x as Record<string, unknown>;
        return BAY_KINDS.includes(b?.kind as BayKind) ? [{ kind: b.kind as BayKind, size: n(b.size), doors: n(b.doors) }] : [];
      })
    : [];
  return {
    schemaVersion: 1,
    unitType: 'vessel',
    vesselType: pick(r.vesselType, ['small-craft', 'dropship'] as const, 'dropship'),
    shape: pick(r.shape, ['aerodyne', 'spheroid'] as const, 'spheroid'),
    military: r.military !== false,
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
    techBase: pick(r.techBase, ['IS', 'Clan'] as const, 'IS'),
    mixedTech: r.mixedTech === true,
    chassis: typeof r.chassis === 'string' ? r.chassis : 'Unnamed',
    model: typeof r.model === 'string' ? r.model : '',
    tonnage: num(r.tonnage, 'tonnage'),
    safeThrust: num(r.safeThrust, 'safeThrust'),
    si: n(r.si, 1),
    heatSinkType: pick(r.heatSinkType, ['single', 'double'] as const, 'single'),
    heatSinks: n(r.heatSinks),
    fuelTons: n(r.fuelTons),
    armorType: pick(r.armorType, ['standard', 'ferro-aluminum', 'light-ferro-aluminum', 'heavy-ferro-aluminum'] as const, 'standard'),
    armor,
    crew: { crew: n(c.crew), officers: n(c.officers), gunners: n(c.gunners), passengers: n(c.passengers), marines: n(c.marines), battleArmor: n(c.battleArmor) },
    quarters: { crew: n(q.crew), 'first-class': n(q['first-class']), 'second-class': n(q['second-class']), steerage: n(q.steerage) },
    bays,
    lifeboats: n(r.lifeboats),
    escapePods: n(r.escapePods),
    equipment,
  };
}

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

export function vesselReadout(d: VesselDesign, s: VesselSummary = computeVessel(d), values?: { bv: number; cost: number }): string {
  const t = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1));
  const row = (label: string, mass: number | string) => `${label.padEnd(38)}${typeof mass === 'number' ? t(mass) : mass}`;
  const era = getEra(d.era);
  const lines: string[] = [];
  lines.push(`${d.chassis} ${d.model}`.trim());
  lines.push('');
  lines.push(`Type: ${d.military ? 'Military' : 'Civilian'} ${d.shape} ${VESSEL_TYPE_NAMES[d.vesselType].toLowerCase()}, ${t(d.tonnage)} tons`);
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
  lines.push(row(`Structural Integrity: ${d.si}`, s.weights.structure));
  lines.push(row(`Engine (safe thrust ${d.safeThrust}, max ${s.maxThrust})`, s.weights.engine));
  lines.push(row('Control Systems:', s.weights.controls));
  lines.push(row(`Fuel: ${t(s.fuelPoints)} points`, s.weights.fuel));
  lines.push(row(`Heat Sinks: ${d.heatSinks}${d.heatSinkType === 'double' ? ' Double' : ''} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  lines.push(row(`Armor (${VESSEL_ARMOR_NAMES[d.armorType]}): ${s.armorTotal}`, s.weights.armor));
  if (s.weights.fireControl) lines.push(row('Extra Fire Control:', s.weights.fireControl));
  if (s.weights.lifeboats) lines.push(row(`Life Boats / Escape Pods: ${d.lifeboats} / ${d.escapePods}`, s.weights.lifeboats));
  for (const b of d.bays) lines.push(row(`${BAY_INFO[b.kind].name}: ${b.size} ${BAY_INFO[b.kind].unit} (${b.doors} doors)`, BAY_INFO[b.kind].tons * b.size));
  for (const q of QUARTERS_KINDS) if (d.quarters[q]) lines.push(row(`${QUARTERS_NAMES[q]}: ${d.quarters[q]}`, QUARTERS_TONS[q] * d.quarters[q]));
  lines.push('');
  lines.push(`Crew: ${d.crew.crew} (${d.crew.officers} officers, ${d.crew.gunners} gunners)` +
    `${d.crew.passengers ? ` · Passengers: ${d.crew.passengers}` : ''}${d.crew.marines ? ` · Marines: ${d.crew.marines}` : ''}${d.crew.battleArmor ? ` · Battle armor: ${d.crew.battleArmor}` : ''}`);
  lines.push('');
  lines.push(`${''.padEnd(22)}Armor  Threshold`);
  for (const l of VESSEL_ARCS) lines.push(`    ${VESSEL_LOCATION_NAMES[l].padEnd(18)}${String(d.armor[l]).padStart(5)}${String(armorThreshold(d.armor[l])).padStart(10)}`);
  lines.push('');
  const nameWidth = Math.max(30, ...d.equipment.map((e) => { const eq = getEquipment(e.equipmentId); return eq ? shortEquipmentName(eq, d).length + 10 : 0; }));
  lines.push(`${'Weapons and Equipment'.padEnd(nameWidth)}${'Loc'.padEnd(6)}${'Heat'.padEnd(6)}Tons`);
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const name = shortEquipmentName(eq, d) + (item.rear ? ' (R)' : '') + (item.shots !== undefined ? ` [${item.shots}]` : '');
    lines.push(`${name.padEnd(nameWidth)}${(item.location ?? '—').padEnd(6)}${String(eq.isWeapon ? eq.heat : 0).padEnd(6)}${t(vesselItemWeight(eq, d, item))}`);
  }
  return lines.join('\n');
}
