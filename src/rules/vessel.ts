/**
 * Small craft, DropShip, JumpShip, WarShip and space station construction (TechManual /
 * Strategic Operations), following MegaMek's TestSmallCraft and TestAdvancedAerospace, its large
 * craft BV calculators and its cost calculators.
 *
 * Large craft (JumpShips, WarShips, stations) have six armored facings, WarShips add broadside weapon
 * arcs, and they add K-F drives, jump sails, lithium-fusion batteries, grav decks, docking collars,
 * capital armor and capital weapons.
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

export type VesselType = 'small-craft' | 'dropship' | 'jumpship' | 'warship' | 'space-station';
export type VesselShape = 'aerodyne' | 'spheroid';
export type VesselArmorType =
  | 'standard' | 'ferro-aluminum' | 'light-ferro-aluminum' | 'heavy-ferro-aluminum'
  | 'improved-ferro-aluminum' | 'ferro-carbide' | 'lamellor-ferro-carbide';
/** K-F drive core: standard (JumpShips), compact (WarShips), sub-compact (small WarShips) or none (stations). */
export type DriveCore = 'standard' | 'compact' | 'subcompact' | 'none';

export const VESSEL_LOCATIONS = ['NOS', 'LS', 'RS', 'FLS', 'FRS', 'ALS', 'ARS', 'LBS', 'RBS', 'AFT', 'HULL'] as const;
export type VesselLocation = (typeof VESSEL_LOCATIONS)[number];
export type VesselArc = Exclude<VesselLocation, 'HULL'>;
/** Every arc (only some apply to a given vessel type; see weaponArcs / armorArcs). */
export const VESSEL_ARCS: readonly VesselArc[] = ['NOS', 'LS', 'RS', 'FLS', 'FRS', 'ALS', 'ARS', 'LBS', 'RBS', 'AFT'];

export const VESSEL_LOCATION_NAMES: Record<VesselLocation, string> = {
  NOS: 'Nose', LS: 'Left Side', RS: 'Right Side', FLS: 'Front Left Side', FRS: 'Front Right Side',
  ALS: 'Aft Left Side', ARS: 'Aft Right Side', LBS: 'Left Broadside', RBS: 'Right Broadside', AFT: 'Aft', HULL: 'Hull',
};
export const VESSEL_TYPE_NAMES: Record<VesselType, string> = {
  'small-craft': 'Small craft', dropship: 'DropShip', jumpship: 'JumpShip', warship: 'WarShip', 'space-station': 'Space station',
};

export const isLargeCraft = (d: { vesselType: VesselType }) =>
  d.vesselType === 'jumpship' || d.vesselType === 'warship' || d.vesselType === 'space-station';

const SMALL_ARCS: readonly VesselArc[] = ['NOS', 'LS', 'RS', 'AFT'];
const LARGE_ARCS: readonly VesselArc[] = ['NOS', 'FLS', 'FRS', 'ALS', 'ARS', 'AFT'];
const WARSHIP_ARCS: readonly VesselArc[] = ['NOS', 'FLS', 'FRS', 'LBS', 'RBS', 'ALS', 'ARS', 'AFT'];

/** Arcs that hold weapons: four for small craft and DropShips, six for large craft, eight on WarShips (broadsides). */
export function weaponArcs(d: { vesselType: VesselType }): readonly VesselArc[] {
  return d.vesselType === 'warship' ? WARSHIP_ARCS : isLargeCraft(d) ? LARGE_ARCS : SMALL_ARCS;
}

/** Armored facings: four for small craft and DropShips, six for large craft. */
export function armorArcs(d: { vesselType: VesselType }): readonly VesselArc[] {
  return isLargeCraft(d) ? LARGE_ARCS : SMALL_ARCS;
}

export type BayKind =
  | 'mek' | 'fighter' | 'small-craft' | 'light-vehicle' | 'heavy-vehicle' | 'superheavy-vehicle' | 'protomek'
  | 'infantry-foot' | 'infantry-jump' | 'infantry-motorized' | 'infantry-mechanized' | 'battle-armor'
  | 'cargo' | 'liquid-cargo' | 'refrigerated-cargo' | 'insulated-cargo' | 'livestock-cargo'
  | 'repair-pressurized' | 'repair-unpressurized' | 'drop-shuttle';

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
  /** Weight rounded up to the half ton per bay (naval repair facilities). */
  roundHalf?: boolean;
  /** Docking hardpoints the bay uses up (large craft). */
  hardpoints?: number;
  /** Large craft only. */
  largeOnly?: boolean;
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
  'repair-pressurized': { name: 'Naval repair facility (pressurized)', unit: 'tons of craft', tons: 0.075, cost: 10000, personnel: 0, cargo: false, roundHalf: true, hardpoints: 2, largeOnly: true },
  'repair-unpressurized': { name: 'Naval repair facility (unpressurized)', unit: 'tons of craft', tons: 0.025, cost: 5000, personnel: 0, cargo: false, roundHalf: true, hardpoints: 2, largeOnly: true },
  'drop-shuttle': { name: 'DropShuttle bay', unit: 'bays', tons: 11000, cost: 150000000, personnel: 0, cargo: false, hardpoints: 2, largeOnly: true },
};

export function bayWeight(b: TransportBay): number {
  const info = BAY_INFO[b.kind];
  return info.roundHalf ? Math.ceil(b.size * info.tons * 2 - 1e-9) / 2 : info.tons * b.size;
}
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
  /** Large craft: K-F drive core, jump sail, lithium-fusion battery, HPG, grav decks (diameters in m), docking collars. */
  driveCore: DriveCore;
  sail: boolean;
  lfBattery: boolean;
  hpg: boolean;
  gravDecks: number[];
  dockingCollars: number;
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
  'heavy-ferro-aluminum': 'Heavy Ferro-Aluminum', 'improved-ferro-aluminum': 'Improved Ferro-Aluminum',
  'ferro-carbide': 'Ferro-Carbide', 'lamellor-ferro-carbide': 'Lamellor Ferro-Carbide',
};
export const VESSEL_ARMOR_OPTIONS: Record<VesselArmorType, ComponentOption> = {
  standard: { label: 'Standard aerospace armor', techBase: 'Both', firstEra: '3025' },
  'ferro-aluminum': { label: 'Ferro-aluminum armor', techBase: 'Both', firstEra: '3050' },
  'light-ferro-aluminum': { label: 'Light ferro-aluminum armor', techBase: 'IS', firstEra: '3068' },
  'heavy-ferro-aluminum': { label: 'Heavy ferro-aluminum armor', techBase: 'IS', firstEra: '3068' },
  'improved-ferro-aluminum': { label: 'Improved ferro-aluminum armor', techBase: 'Both', firstEra: '3025' },
  'ferro-carbide': { label: 'Ferro-carbide armor', techBase: 'Both', firstEra: '3025' },
  'lamellor-ferro-carbide': { label: 'Lamellor ferro-carbide armor', techBase: 'Both', firstEra: '3025' },
};
/** Armor that only small craft and DropShips use, and armor that only large craft use. */
export const SMALL_CRAFT_ARMORS: readonly VesselArmorType[] = ['standard', 'ferro-aluminum', 'light-ferro-aluminum', 'heavy-ferro-aluminum'];
export const LARGE_CRAFT_ARMORS: readonly VesselArmorType[] = ['standard', 'improved-ferro-aluminum', 'ferro-carbide', 'lamellor-ferro-carbide'];
export const VESSEL_ARMOR_COST: Record<VesselArmorType, number> = {
  standard: 10000, 'ferro-aluminum': 20000, 'light-ferro-aluminum': 15000, 'heavy-ferro-aluminum': 25000,
  'improved-ferro-aluminum': 50000, 'ferro-carbide': 75000, 'lamellor-ferro-carbide': 100000,
};

/** Armor points per ton by tonnage band (MegaMek's ArmorType tables for small craft and DropShips). */
const PPT: Partial<Record<VesselArmorType, { IS: number[]; Clan: number[] }>> = {
  standard: { IS: [16, 14, 12, 10, 8, 6], Clan: [20, 17, 14, 12, 10, 7] },
  'ferro-aluminum': { IS: [17.92, 15.68, 13.44, 11.2, 8.96, 6.72], Clan: [24, 20.4, 16.8, 14.4, 12, 8.4] },
  'light-ferro-aluminum': { IS: [16.96, 14.84, 12.72, 10.6, 8.48, 6.36], Clan: [16.96, 14.84, 12.72, 10.6, 8.48, 6.36] },
  'heavy-ferro-aluminum': { IS: [19.84, 17.36, 14.88, 12.4, 9.92, 7.44], Clan: [19.84, 17.36, 14.88, 12.4, 9.92, 7.44] },
};
const SPHEROID_BANDS = [12500, 20000, 35000, 50000, 65000];
const AERODYNE_BANDS = [6000, 9500, 12500, 17500, 25000];
/** Capital armor points per ton for large craft (under 150,000 t, under 250,000 t, larger). */
const CAPITAL_PPT: Partial<Record<VesselArmorType, { IS: number[]; Clan: number[] }>> = {
  standard: { IS: [0.8, 0.6, 0.4], Clan: [1.0, 0.7, 0.5] },
  'improved-ferro-aluminum': { IS: [1.0, 0.8, 0.6], Clan: [1.2, 0.9, 0.7] },
  'ferro-carbide': { IS: [1.2, 1.0, 0.8], Clan: [1.4, 1.1, 0.9] },
  'lamellor-ferro-carbide': { IS: [1.4, 1.2, 1.0], Clan: [1.6, 1.3, 1.1] },
};
const CAPITAL_BANDS = [150000, 250000];

/** Armor points per ton; 0 if the armor cannot be used on this kind of vessel. */
export function vesselArmorPointsPerTon(d: Pick<VesselDesign, 'armorType' | 'techBase' | 'shape' | 'tonnage' | 'vesselType'>): number {
  const large = isLargeCraft(d);
  const table = (large ? CAPITAL_PPT : PPT)[d.armorType]?.[d.techBase];
  if (!table) return 0;
  const bands = large ? CAPITAL_BANDS : d.shape === 'spheroid' ? SPHEROID_BANDS : AERODYNE_BANDS;
  const i = bands.findIndex((b) => d.tonnage < b);
  return table[i === -1 ? table.length - 1 : i];
}

/** Tonnage limits (MegaMek's TestAero / TestAdvancedAerospace). Canon includes escape pods well under 100 tons. */
export function vesselTonnageLimits(d: Pick<VesselDesign, 'vesselType' | 'shape' | 'driveCore'>): { min: number; max: number } {
  switch (d.vesselType) {
    case 'small-craft': return { min: 5, max: 200 };
    case 'dropship': return { min: 200, max: d.shape === 'spheroid' ? 100000 : 35000 };
    case 'jumpship': return { min: 50000, max: 500000 };
    case 'warship': return d.driveCore === 'subcompact' ? { min: 5000, max: 25000 } : { min: 50000, max: 2500000 };
    case 'space-station': return { min: 2000, max: 2500000 };
  }
}

/** Weapon slots per arc before extra fire control is needed: 12, or 20 on WarShips and stations. */
export function slotsPerArc(d: Pick<VesselDesign, 'vesselType'>): number {
  return d.vesselType === 'warship' || d.vesselType === 'space-station' ? 20 : 12;
}
/** @deprecated small craft / DropShip value; use slotsPerArc. */
export const VESSEL_SLOTS_PER_ARC = 12;

/** Fuel points per ton: 80 for small craft; DropShips get fewer as they grow. */
export function vesselFuelPointsPerTon(d: Pick<VesselDesign, 'vesselType' | 'tonnage'>): number {
  if (d.vesselType === 'small-craft') return 80;
  const t = d.tonnage;
  if (isLargeCraft(d)) return t < 110000 ? 10 : t < 250000 ? 5 : 2.5;
  return t < 400 ? 80 : t < 800 ? 70 : t < 1200 ? 60 : t < 1900 ? 50 : t < 3000 ? 40 : t < 20000 ? 30 : t < 40000 ? 20 : 10;
}

const halfNearest = (n: number) => Math.round(n * 2) / 2;

export function vesselEngineWeight(d: Pick<VesselDesign, 'tonnage' | 'safeThrust' | 'techBase'> & { vesselType?: VesselType }): number {
  if (d.vesselType && isLargeCraft({ vesselType: d.vesselType })) {
    // A station-keeping drive (0 thrust) weighs 1.2% of the craft; transit drives 6% per point of thrust.
    return halfNearest(d.tonnage * (d.safeThrust === 0 ? 0.012 : d.safeThrust * 0.06));
  }
  return halfUp(d.tonnage * d.safeThrust * (d.techBase === 'Clan' ? 0.061 : 0.065));
}

/** Weight-free heat sinks, from the engine tonnage. */
export function vesselFreeHeatSinks(d: Pick<VesselDesign, 'tonnage' | 'safeThrust' | 'techBase' | 'shape' | 'military' | 'vesselType'>): number {
  const engine = vesselEngineWeight(d);
  if (isLargeCraft(d)) return Math.floor(45 + Math.sqrt(engine * 2));
  const militaryDS = d.military && d.vesselType === 'dropship';
  return d.shape === 'spheroid'
    ? Math.floor(Math.sqrt(engine * (militaryDS ? 6.8 : 1.6)))
    : Math.floor(engine / (militaryDS ? 20 : 60));
}

export function vesselMaxArmorWeight(d: Pick<VesselDesign, 'si' | 'shape'> & Partial<Pick<VesselDesign, 'vesselType' | 'tonnage'>>): number {
  const t = d.tonnage ?? 0;
  if (d.vesselType === 'warship') return halfDown((d.si * t) / 50000);
  if (d.vesselType === 'space-station') return halfDown((d.si * t) / 300 + 60);
  if (d.vesselType === 'jumpship') return halfDown((d.si * t) / 1800);
  return halfDown(d.si * (d.shape === 'spheroid' ? 3.6 : 4.5));
}

/** Bonus armor from structural integrity: one SI's worth per location (hull included) on small craft
 * and DropShips; a tenth of SI per facing on large craft. */
export function siBonusArmor(d: Pick<VesselDesign, 'si'> & Partial<Pick<VesselDesign, 'vesselType'>>): number {
  if (d.vesselType && isLargeCraft({ vesselType: d.vesselType })) return 6 * Math.round(d.si / 10);
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
  if (d.vesselType === 'warship') return 8 + Math.ceil(d.tonnage / 100000);
  if (d.vesselType === 'space-station') return 8 + Math.ceil(d.tonnage / 75000);
  return 7 + Math.ceil(d.tonnage / 50000);
}

/** K-F drive weight: a share of the craft's tonnage by drive core. */
export function kfDriveWeight(d: Pick<VesselDesign, 'vesselType' | 'driveCore' | 'tonnage'>): number {
  if (!isLargeCraft(d) || d.vesselType === 'space-station') return 0;
  const pct = { standard: 0.95, compact: 0.4525, subcompact: 0.5, none: 0 }[d.driveCore];
  return Math.ceil(d.tonnage * pct - 1e-9);
}

/** K-F drive integrity (used for cost). */
export function kfIntegrity(d: Pick<VesselDesign, 'vesselType' | 'driveCore' | 'tonnage'>): number {
  return Math.ceil(1.2 + kfDriveWeight(d) / 60000);
}

export function sailWeight(d: Pick<VesselDesign, 'vesselType' | 'sail' | 'tonnage'>): number {
  if (!isLargeCraft(d) || !d.sail) return 0;
  return Math.ceil(d.tonnage / (d.vesselType === 'warship' ? 20000 : 7500) - 1e-9) + 30;
}

/** Grav deck weight by diameter: standard (under 100 m) 50 t, large (to 250 m) 100 t, huge 500 t. */
export function gravDeckWeight(diameter: number): number {
  return diameter < 100 ? 50 : diameter <= 250 ? 100 : 500;
}

export function maxGravDecks(d: Pick<VesselDesign, 'tonnage'>): number {
  return 3 + Math.ceil(d.tonnage / 100000);
}

/** Docking hardpoints: one per 50,000 t (none under 50,000 t), less any taken by repair or DropShuttle bays. */
export function maxDockingCollars(d: Pick<VesselDesign, 'tonnage' | 'bays'>): number {
  if (d.tonnage < 50000) return 0;
  const used = d.bays.reduce((a, b) => a + (BAY_INFO[b.kind].hardpoints ?? 0) * Math.max(1, Math.ceil(BAY_INFO[b.kind].unit === 'bays' ? b.size : 1)), 0);
  return Math.max(0, Math.ceil(d.tonnage / 50000) - used);
}

/** Equipment that takes a weapon slot in its arc. */
export function vesselUsesWeaponSlot(eq: Equipment): boolean {
  return eq.isWeapon || /ecm|active-probe|beagle|remote-sensor-dispenser/.test(eq.id);
}

/** Whether a vessel of this type can carry the item (capital weapons need large craft; sub-capital
 * weapons, capital missiles and screen launchers also fit DropShips; mass drivers only WarShips). */
export function isVesselEquipment(eq: Equipment, d?: Pick<VesselDesign, 'vesselType'>): boolean {
  if (eq.id === 'remote-sensor-dispenser' || eq.id === 'cargo-container') return true;
  if (eq.managed || eq.melee || eq.lamOnly || eq.category === 'Utility' || eq.variableWeight === 'masc' || eq.variableWeight === 'supercharger') return false;
  if (eq.capitalClass && d) {
    if (d.vesselType === 'small-craft') return false;
    if (eq.capitalClass === 'mass-driver') return d.vesselType === 'warship';
    if (eq.capitalClass === 'capital') return isLargeCraft(d);
  }
  return true;
}

export function vesselItemLocations(eq: Equipment, d: Pick<VesselDesign, 'vesselType'> = { vesselType: 'dropship' }): VesselLocation[] {
  if (eq.isWeapon || /artemis/.test(eq.id)) return [...weaponArcs(d)];
  return [...weaponArcs(d), 'HULL'];
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
  return { NOS: 0, LS: 0, RS: 0, FLS: 0, FRS: 0, ALS: 0, ARS: 0, LBS: 0, RBS: 0, AFT: 0 };
}

/** Defaults per vessel type: drive core and sail for large craft, sensible starting sizes. */
const TYPE_DEFAULTS: Record<VesselType, Pick<VesselDesign, 'shape' | 'tonnage' | 'safeThrust' | 'si' | 'fuelTons' | 'driveCore' | 'sail' | 'dockingCollars' | 'escapePods'> & { name: string; crew: number; officers: number }> = {
  'small-craft': { name: 'New Small Craft', shape: 'aerodyne', tonnage: 150, safeThrust: 5, si: 8, fuelTons: 10, driveCore: 'none', sail: false, dockingCollars: 0, escapePods: 0, crew: 3, officers: 1 },
  dropship: { name: 'New DropShip', shape: 'spheroid', tonnage: 2000, safeThrust: 3, si: 10, fuelTons: 80, driveCore: 'none', sail: false, dockingCollars: 0, escapePods: 2, crew: 8, officers: 2 },
  jumpship: { name: 'New JumpShip', shape: 'aerodyne', tonnage: 150000, safeThrust: 0, si: 1, fuelTons: 500, driveCore: 'standard', sail: true, dockingCollars: 2, escapePods: 4, crew: 20, officers: 4 },
  warship: { name: 'New WarShip', shape: 'aerodyne', tonnage: 400000, safeThrust: 3, si: 50, fuelTons: 2000, driveCore: 'compact', sail: true, dockingCollars: 2, escapePods: 20, crew: 160, officers: 27 },
  'space-station': { name: 'New Space Station', shape: 'aerodyne', tonnage: 100000, safeThrust: 0, si: 20, fuelTons: 200, driveCore: 'none', sail: false, dockingCollars: 2, escapePods: 10, crew: 70, officers: 12 },
};

export function newVessel(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS', vesselType: VesselType = 'dropship'): VesselDesign {
  const t = TYPE_DEFAULTS[vesselType];
  return {
    schemaVersion: 1,
    unitType: 'vessel',
    vesselType,
    shape: t.shape,
    military: true,
    era,
    techBase,
    mixedTech: false,
    chassis: t.name,
    model: '',
    tonnage: t.tonnage,
    safeThrust: t.safeThrust,
    si: t.si,
    heatSinkType: 'single',
    heatSinks: 0,
    fuelTons: t.fuelTons,
    armorType: 'standard',
    armor: emptyVesselArmor(),
    crew: { crew: t.crew, officers: t.officers, gunners: 0, passengers: 0, marines: 0, battleArmor: 0 },
    quarters: { crew: t.crew, 'first-class': 0, 'second-class': 0, steerage: 0 },
    bays: [],
    driveCore: t.driveCore,
    sail: t.sail,
    lfBattery: false,
    hpg: false,
    gravDecks: [],
    dockingCollars: t.dockingCollars,
    lifeboats: 0,
    escapePods: t.escapePods,
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
  /** Large craft systems. */
  kfDrive: number;
  sail: number;
  lfBattery: number;
  gravDecks: number;
  dockingCollars: number;
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
  slotsPerArc: number;
  maxDockingCollars: number;
  weaponBays: WeaponBayGroup[];
  weights: VesselWeights;
  unallocated: VesselItem[];
}

export function vesselItemWeight(eq: Equipment, d: VesselDesign, item?: VesselItem): number {
  if (eq.category === 'Ammo') {
    const bins = Math.ceil((item?.shots ?? shotsPerBin(eq)) / shotsPerBin(eq));
    // Large craft round each ammunition load up to the half ton.
    return isLargeCraft(d) ? halfUp(bins * eq.tons) : bins * eq.tons;
  }
  return itemWeight(eq, { tonnage: d.tonnage, techBase: d.techBase, equipment: d.equipment as never });
}

/** Gunners: one per capital weapon (ten per mass driver) plus one per six standard weapons that reach past one hex. */
export function requiredGunners(d: VesselDesign): number {
  let standard = 0;
  let capital = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq?.isWeapon) continue;
    if (eq.capitalClass === 'mass-driver') { capital += 10; continue; }
    if (eq.capitalClass === 'capital' || eq.capitalClass === 'capital-missile' || eq.capitalClass === 'screen') { capital++; continue; }
    if (!eq.capitalClass && (eq.range?.long ?? 0) <= 1 && !/^mml-/.test(eq.id)) continue;
    standard++;
  }
  return capital + Math.ceil(standard / 6);
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
  const order = Object.fromEntries(VESSEL_ARCS.map((a, i) => [a, i])) as Record<VesselArc, number>;
  return [...groups.values()].sort((a, b) => order[a.arc] - order[b.arc] || Number(a.rear) - Number(b.rear) || a.bay - b.bay);
}

export function computeVessel(d: VesselDesign): VesselSummary {
  const ppt = vesselArmorPointsPerTon(d);
  const large = isLargeCraft(d);
  const armorTotal = armorArcs(d).reduce((a, l) => a + (d.armor[l] ?? 0), 0);
  const perArc = slotsPerArc(d);
  const free = vesselFreeHeatSinks(d);
  const fppt = vesselFuelPointsPerTon(d);

  let equipment = 0;
  let ammo = 0;
  let weaponHeat = 0;
  const slots = emptyVesselArmor();
  // Fire-control arcs: spheroids count rear-facing side weapons as arcs of their own.
  const fcSlots = new Map<string, { n: number; tons: number }>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = vesselItemWeight(eq, d, item);
    if (eq.category === 'Ammo') ammo += w; else equipment += w;
    if (eq.isWeapon) weaponHeat += eq.heat;
    if (item.location && item.location !== 'HULL' && vesselUsesWeaponSlot(eq)) {
      const n = eq.capitalClass === 'mass-driver' ? 10 : 1; // a mass driver fills ten slots
      slots[item.location] += n;
      const key = `${item.location}${!large && d.shape === 'spheroid' && item.rear ? ':R' : ''}`;
      const a = fcSlots.get(key) ?? { n: 0, tons: 0 };
      a.n += n; a.tons += w;
      fcSlots.set(key, a);
    }
  }
  // Each full 12 weapons beyond the first in an arc need extra fire control: 10% of the arc's weapons.
  let fireControl = 0;
  for (const { n, tons } of fcSlots.values()) {
    const excess = Math.floor((n - 1) / perArc);
    if (excess > 0) fireControl += halfUp((excess * tons) / 10);
  }

  const bays = d.bays.reduce((a, b) => a + bayWeight(b), 0);
  const quarters = QUARTERS_KINDS.reduce((a, q) => a + QUARTERS_TONS[q] * (d.quarters[q] ?? 0), 0);
  const quartersCapacity = QUARTERS_KINDS.reduce((a, q) => a + (d.quarters[q] ?? 0), 0);
  const bayPersonnel = d.bays.reduce((a, b) => {
    const info = BAY_INFO[b.kind];
    return a + (d.techBase === 'Clan' && info.clanPersonnel !== undefined ? info.clanPersonnel : info.personnel) * Math.floor(b.size);
  }, 0);
  const t = d.tonnage;
  const base = d.vesselType === 'warship' || d.vesselType === 'space-station' ? 45 + Math.ceil(t / 5000)
    : d.vesselType === 'jumpship' ? 6 + Math.ceil(t / 20000)
    : 3 + (d.vesselType === 'dropship' ? Math.ceil(t / 5000) + (d.military ? 1 : 0) : 0);
  const gunners = requiredGunners(d);
  // Large craft need an officer per six crew actually carried; smaller craft per five required crew.
  const officers = large ? Math.ceil(Math.max(0, d.crew.crew - bayPersonnel) / 6) : Math.ceil((base + gunners) / 5);

  const structure = d.vesselType === 'jumpship' ? halfUp(t / 150)
    : d.vesselType === 'warship' ? halfUp((d.si * t) / 1000)
    : d.vesselType === 'space-station' ? halfUp(t / 100)
    : halfUp((d.si * t) / (d.shape === 'spheroid' ? 500 : 200));
  const controls = d.vesselType === 'space-station' ? tonUp(t * 0.001)
    : large ? tonUp(t * 0.0025)
    : d.vesselType === 'dropship' ? tonUp(t * 0.0075) : halfUp(t * 0.0075);
  const weights: VesselWeights = {
    structure,
    engine: vesselEngineWeight(d),
    controls,
    // Fuel pumps: 2% of the fuel (rounded up to the ton on large craft, with the total to the half ton on smaller craft).
    fuel: large ? d.fuelTons + tonUp(d.fuelTons * 0.02) : halfUp(d.fuelTons * 1.02),
    heatSinks: Math.max(0, d.heatSinks - free),
    armor: armorTotal > 0 ? halfUp(Math.max(0, armorTotal - siBonusArmor(d)) / ppt) : 0,
    fireControl,
    lifeboats: (d.lifeboats + d.escapePods) * 7,
    equipment,
    ammo,
    bays,
    quarters,
    kfDrive: kfDriveWeight(d),
    sail: sailWeight(d),
    lfBattery: large && d.lfBattery ? t * 0.01 : 0,
    gravDecks: large ? d.gravDecks.reduce((a, g) => a + gravDeckWeight(g), 0) : 0,
    dockingCollars: large ? d.dockingCollars * 1000 : 0,
    total: 0,
    free: 0,
  };
  weights.total = weights.structure + weights.engine + weights.controls + weights.fuel + weights.heatSinks + weights.armor
    + weights.fireControl + weights.lifeboats + weights.equipment + weights.ammo + weights.bays + weights.quarters
    + weights.kfDrive + weights.sail + weights.lfBattery + weights.gravDecks + weights.dockingCollars;
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
    slotsPerArc: perArc,
    maxDockingCollars: maxDockingCollars(d),
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
  const large = isLargeCraft(d);
  const lim = vesselTonnageLimits(d);
  if (!Number.isInteger(d.tonnage) || d.tonnage < lim.min || d.tonnage > lim.max) {
    const what = large ? `${typeName}s` : `${d.shape === 'spheroid' ? 'Spheroid' : 'Aerodyne'} ${typeName.toLowerCase()}s`;
    error(`${what} weigh ${lim.min.toLocaleString('en-US')}–${lim.max.toLocaleString('en-US')} tons (got ${d.tonnage.toLocaleString('en-US')}).`);
  }
  if (d.vesselType === 'space-station' && d.safeThrust !== 0) error('Space stations have only a station-keeping drive (0 thrust).');
  if (!Number.isInteger(d.safeThrust) || d.safeThrust < 0) error('Safe thrust must be a whole number.');
  if (!Number.isInteger(d.si) || d.si < 1) error('Structural integrity must be a whole number of at least 1.');

  // Weight
  if (s.weights.free < 0) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 0) warn(`${fmt(s.weights.free)} tons unused.`);

  // Heat sinks
  if (d.heatSinks < s.heatSinks.free) error(`The engine comes with ${s.heatSinks.free} weight-free heat sinks; carry at least that many (has ${d.heatSinks}).`);

  // Fuel
  if (d.fuelTons <= 0) warn('No fuel carried.');

  // Large-craft systems
  if (large) {
    if (d.vesselType === 'warship' && d.driveCore !== 'compact' && d.driveCore !== 'subcompact') warn('WarShips normally use a compact K-F drive core.');
    if (d.vesselType === 'jumpship' && d.driveCore !== 'standard') warn('JumpShips normally use a standard K-F drive core.');
    if (d.vesselType === 'jumpship' && !d.sail) warn('JumpShips normally carry a jump sail to recharge.');
    if (d.gravDecks.length > maxGravDecks(d)) error(`At most ${maxGravDecks(d)} grav decks (has ${d.gravDecks.length}).`);
    const maxDia = d.vesselType === 'space-station' ? 1500 : 250;
    if (d.gravDecks.some((g) => g > maxDia || g <= 0)) error(`Grav deck diameters must be 1–${maxDia} m.`);
    if (d.dockingCollars > s.maxDockingCollars) error(`At most ${s.maxDockingCollars} docking collars (has ${d.dockingCollars}).`);
  }
  if (s.armorPointsPerTon === 0) {
    error(`${VESSEL_ARMOR_NAMES[d.armorType]} armor cannot be used on a ${typeName.toLowerCase()}.`);
  }

  // Armor
  for (const l of armorArcs(d)) {
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
    if (!isVesselEquipment(eq, d)) error(`${eq.name} cannot be mounted on a ${typeName.toLowerCase()}.`);
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !unavailable.has(eq.id)) {
      unavailable.add(eq.id);
      error(eq.techBase !== 'Both' && eq.techBase !== d.techBase
        ? `${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`
        : `${eq.name} is not available in the ${era?.name ?? d.era} era.`);
    }
    if (item.location && !vesselItemLocations(eq, d).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${VESSEL_LOCATION_NAMES[item.location].toLowerCase()}.`);
    }
    if (item.rear && (large || (item.location !== 'LS' && item.location !== 'RS'))) error(`${eq.name}: only small craft and DropShip side-arc weapons can face the rear.`);
  }
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not yet mounted in a location.`);
  const side = (l: VesselLocation) => d.equipment
    .filter((e) => e.location === l && getEquipment(e.equipmentId)?.isWeapon)
    .map((e) => `${e.equipmentId}${e.rear ? ':R' : ''}`).sort().join(',');
  const pairs: [VesselLocation, VesselLocation][] = large ? [['FLS', 'FRS'], ['ALS', 'ARS'], ['LBS', 'RBS']] : [['LS', 'RS']];
  for (const [l, r] of pairs) {
    if (side(l) !== side(r)) error(`${VESSEL_LOCATION_NAMES[l]} and ${VESSEL_LOCATION_NAMES[r].toLowerCase()} weapons must match.`);
  }
  for (const l of weaponArcs(d)) {
    if (s.slots[l] > s.slotsPerArc) {
      warn(`${VESSEL_LOCATION_NAMES[l]} carries ${s.slots[l]} weapons; beyond ${s.slotsPerArc} they need extra fire control (included in the weight).`);
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
    if (info.largeOnly && !large) error(`${info.name}s only fit JumpShips, WarShips and space stations.`);
    if (b.doors < 1 && !info.cargo && !info.largeOnly && !b.kind.startsWith('infantry') && b.kind !== 'battle-armor') error(`${info.name} needs at least one door.`);
  }
  if (s.bayDoors > maxBayDoors(d)) error(`${s.bayDoors} bay doors; a ${typeName.toLowerCase()} this size can have ${maxBayDoors(d)}.`);

  return issues;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export function setVesselType(d: VesselDesign, vesselType: VesselType): VesselDesign {
  if (d.vesselType === vesselType) return d;
  const t = TYPE_DEFAULTS[vesselType];
  const toLarge = isLargeCraft({ vesselType });
  const next: VesselDesign = {
    ...d, vesselType, driveCore: t.driveCore, sail: t.sail,
    safeThrust: vesselType === 'space-station' ? 0 : d.safeThrust,
    // Armor families differ between small and large craft.
    armorType: (toLarge ? LARGE_CRAFT_ARMORS : SMALL_CRAFT_ARMORS).includes(d.armorType) ? d.armorType : 'standard',
    // Weapons move to the nose if their arc does not exist on the new type.
    equipment: d.equipment.map((e) => (e.location && e.location !== 'HULL' && !weaponArcs({ vesselType }).includes(e.location)
      ? { ...e, location: 'NOS' as VesselLocation, rear: undefined } : e)),
  };
  const lim = vesselTonnageLimits(next);
  return { ...next, tonnage: Math.max(lim.min, Math.min(d.tonnage, lim.max)) };
}

export function addVesselItem(d: VesselDesign, equipmentId: string): VesselDesign {
  const eq = getEquipment(equipmentId);
  if (!eq) return d;
  const location: VesselLocation = vesselUsesWeaponSlot(eq) || /artemis/.test(eq.id) ? 'NOS' : 'HULL';
  const item: VesselItem = { uid: newVesselUid(), equipmentId, location };
  if (eq.category === 'Ammo') item.shots = shotsPerBin(eq);
  if (eq.isWeapon && d.vesselType !== 'small-craft') {
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
      if ((next.location !== 'LS' && next.location !== 'RS') || isLargeCraft(d)) delete next.rear;
      return next;
    }),
  };
}

export function removeVesselItem(d: VesselDesign, uid: string): VesselDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

/** Spread armor: small craft nose 30%, sides 25% each, aft 20%; large craft nose 20%, each side 15%, aft 20%. */
export function distributeVesselArmor(d: VesselDesign, points: number): VesselDesign {
  const target = Math.max(0, Math.min(Math.floor(points), vesselMaxArmor(d)));
  const share: Partial<Record<VesselArc, number>> = isLargeCraft(d)
    ? { NOS: 0.2, FLS: 0.15, FRS: 0.15, ALS: 0.15, ARS: 0.15, AFT: 0.2 }
    : { NOS: 0.3, LS: 0.25, RS: 0.25, AFT: 0.2 };
  const armor = emptyVesselArmor();
  const arcs = armorArcs(d);
  let used = 0;
  for (const l of arcs) { armor[l] = Math.floor(target * (share[l] ?? 0)); used += armor[l]; }
  for (const l of arcs) { if (used >= target) break; armor[l]++; used++; }
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
  if (!isVessel(raw)) throw new Error('Not a small craft, DropShip or large craft design.');
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
    vesselType: pick(r.vesselType, ['small-craft', 'dropship', 'jumpship', 'warship', 'space-station'] as const, 'dropship'),
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
    armorType: pick(r.armorType, Object.keys(VESSEL_ARMOR_NAMES) as VesselArmorType[], 'standard'),
    armor,
    crew: { crew: n(c.crew), officers: n(c.officers), gunners: n(c.gunners), passengers: n(c.passengers), marines: n(c.marines), battleArmor: n(c.battleArmor) },
    quarters: { crew: n(q.crew), 'first-class': n(q['first-class']), 'second-class': n(q['second-class']), steerage: n(q.steerage) },
    bays,
    driveCore: pick(r.driveCore, ['standard', 'compact', 'subcompact', 'none'] as const,
      r.vesselType === 'jumpship' ? 'standard' : r.vesselType === 'warship' ? 'compact' : 'none'),
    sail: r.sail === true,
    lfBattery: r.lfBattery === true,
    hpg: r.hpg === true,
    gravDecks: Array.isArray(r.gravDecks) ? r.gravDecks.filter((g): g is number => typeof g === 'number') : [],
    dockingCollars: n(r.dockingCollars),
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
  lines.push(`Type: ${d.military ? 'Military' : 'Civilian'} ${isLargeCraft(d) ? '' : `${d.shape} `}${VESSEL_TYPE_NAMES[d.vesselType].toLowerCase()}, ${t(d.tonnage)} tons`);
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
  lines.push(row(d.safeThrust === 0 ? 'Engine (station-keeping drive)' : `Engine (safe thrust ${d.safeThrust}, max ${s.maxThrust})`, s.weights.engine));
  lines.push(row('Control Systems:', s.weights.controls));
  lines.push(row(`Fuel: ${t(s.fuelPoints)} points`, s.weights.fuel));
  lines.push(row(`Heat Sinks: ${d.heatSinks}${d.heatSinkType === 'double' ? ' Double' : ''} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  lines.push(row(`Armor (${VESSEL_ARMOR_NAMES[d.armorType]}): ${s.armorTotal}`, s.weights.armor));
  if (s.weights.kfDrive) lines.push(row(`K-F Drive (${d.driveCore} core):`, s.weights.kfDrive));
  if (s.weights.sail) lines.push(row('Jump Sail:', s.weights.sail));
  if (s.weights.lfBattery) lines.push(row('Lithium-Fusion Battery:', s.weights.lfBattery));
  if (s.weights.gravDecks) lines.push(row(`Grav Decks: ${d.gravDecks.map((g) => `${g} m`).join(', ')}`, s.weights.gravDecks));
  if (s.weights.dockingCollars) lines.push(row(`Docking Collars: ${d.dockingCollars}`, s.weights.dockingCollars));
  if (d.hpg) lines.push('HPG');
  if (s.weights.fireControl) lines.push(row('Extra Fire Control:', s.weights.fireControl));
  if (s.weights.lifeboats) lines.push(row(`Life Boats / Escape Pods: ${d.lifeboats} / ${d.escapePods}`, s.weights.lifeboats));
  for (const b of d.bays) lines.push(row(`${BAY_INFO[b.kind].name}: ${b.size} ${BAY_INFO[b.kind].unit} (${b.doors} doors)`, bayWeight(b)));
  for (const q of QUARTERS_KINDS) if (d.quarters[q]) lines.push(row(`${QUARTERS_NAMES[q]}: ${d.quarters[q]}`, QUARTERS_TONS[q] * d.quarters[q]));
  lines.push('');
  lines.push(`Crew: ${d.crew.crew} (${d.crew.officers} officers, ${d.crew.gunners} gunners)` +
    `${d.crew.passengers ? ` · Passengers: ${d.crew.passengers}` : ''}${d.crew.marines ? ` · Marines: ${d.crew.marines}` : ''}${d.crew.battleArmor ? ` · Battle armor: ${d.crew.battleArmor}` : ''}`);
  lines.push('');
  lines.push(`${''.padEnd(22)}Armor  Threshold`);
  for (const l of armorArcs(d)) lines.push(`    ${VESSEL_LOCATION_NAMES[l].padEnd(18)}${String(d.armor[l]).padStart(5)}${String(armorThreshold(d.armor[l])).padStart(10)}`);
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
