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
  ARMOR_NAMES, ARMOR_OPTIONS, LARGE_ENGINE_OPTION, LARGE_ICE_OPTION, STRUCTURE_OPTIONS, armorPointsPerTon, componentEraOk,
  componentTechOk, engineWeight, standardFusionEngineWeight,
} from './tables';
import type { Equipment } from './equipment';
import {
  shortEquipmentName, getEquipment, isArtemisVCapable, heatNeutralHeat, targetingComputerTons, isEquipmentAvailable, dumperWeight, srcsWeight, usesAmmo,
} from './equipment';
import { armorPointsForTons, armorTonnage } from './armor';
import type { Issue } from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MotiveType = 'tracked' | 'wheeled' | 'hover' | 'vtol' | 'wige' | 'naval' | 'hydrofoil' | 'submarine';
export type VehicleEngineType = 'ice' | 'standard' | 'xl' | 'light' | 'compact' | 'xxl' | 'fuel-cell' | 'fission' | 'none';
/** Vehicle armor: the basic types plus advanced armors (Tactical Operations). */
export type VehicleArmorType = BasicArmorType | 'reactive' | 'reflective' | 'hardened' | 'stealth' | 'ferro-lamellor' | 'ballistic-reinforced';

/** FRS / FLS / RRS / RLS: the front and rear side facings of a superheavy vehicle (six armor facings). */
export const VEHICLE_LOCATIONS = ['FR', 'FRS', 'FLS', 'LS', 'RS', 'RRS', 'RLS', 'RR', 'TU', 'TU2', 'RO', 'BD'] as const;
export type VehicleLocation = (typeof VEHICLE_LOCATIONS)[number];
/** Locations that carry armor (body holds equipment only). */
export type VehicleArmorLocation = Exclude<VehicleLocation, 'BD'>;

export const VEHICLE_LOCATION_NAMES: Record<VehicleLocation, string> = {
  FR: 'Front', FRS: 'Front Right', FLS: 'Front Left', LS: 'Left Side', RS: 'Right Side', RRS: 'Rear Right', RLS: 'Rear Left',
  RR: 'Rear', TU: 'Turret', TU2: 'Front Turret', RO: 'Rotor', BD: 'Body',
};

export interface VehicleItem {
  uid: string;
  equipmentId: string;
  location: VehicleLocation | null;
  /** Mounted in a sponson turret (side locations only). */
  sponson?: boolean;
}

/** Side locations, where sponson turrets go. */
export const SPONSON_LOCATIONS: readonly VehicleLocation[] = ['LS', 'RS', 'FLS', 'FRS', 'RLS', 'RRS'];

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
  armorType: VehicleArmorType;
  /** Mixed tech: the armor's tech base when it differs from the chassis' (e.g. Clan ferro-fibrous on an Inner Sphere chassis). */
  armorTech?: TechBase;
  /** OmniVehicle: pod-mounted equipment (each canon configuration loads as its own design); cost ×1.25. */
  omni?: boolean;
  /** OmniVehicle: turret weight fixed by the base chassis (tons); pods may fill up to it. */
  omniTurretTons?: number;
  /** Trailer: towed by a tractor, so it may have no engine or cruise MP. */
  trailer?: boolean;
  /** Trailer without control systems (no crew compartment). */
  noControls?: boolean;
  /** Single turret (a chin turret on VTOLs). */
  turret: boolean;
  /** A second, front turret (Tactical Operations; not on VTOLs). The main turret is then the rear turret. */
  dualTurret?: boolean;
  /** OmniVehicle: front turret weight fixed by the base chassis (tons). */
  omniTurret2Tons?: number;
  /** A pair of sponson turrets on the sides (Tactical Operations). */
  sponsons?: boolean;
  /** OmniVehicle: sponson turret weight fixed by the base chassis (tons). */
  omniSponsonTons?: number;
  /** Total single heat sinks (fusion engines include 10 for free). */
  heatSinks: number;
  /** Troop compartment and cargo bay space, in tons. */
  cargo?: number;
  /** Separate cargo bays (plus one for any troop space) the cargo is split into; each takes an item slot. 1 when unset. */
  cargoBays?: number;
  /** Of the troop and cargo space, the tons that are infantry compartments (no cost, as MegaMek). */
  troopSpace?: number;
  /** Doors on the cargo bays (1,000 C-bills each). One per cargo bay when unset. */
  cargoDoors?: number;
  /** Specialized cargo bays among the cargo space (tons of bay, priced per ton as MegaMek). */
  specialCargo?: { kind: 'liquid' | 'insulated' | 'refrigerated'; tons: number }[];
  armor: Record<VehicleArmorLocation, number>;
  equipment: VehicleItem[];
}

export interface MotiveInfo {
  name: string;
  maxTonnage: number;
  /** Superheavy vehicles (Tactical Operations, as MegaMek) may weigh up to this; none for hydrofoils. */
  superheavyMax?: number;
  /** Lift / rotor / dive equipment as a fraction of tonnage. */
  liftFraction: number;
  liftName: string | null;
  description: string;
}

export const MOTIVE_TYPES: Record<MotiveType, MotiveInfo> = {
  tracked: { name: 'Tracked', maxTonnage: 100, superheavyMax: 200, liftFraction: 0, liftName: null, description: 'Tanks: go almost anywhere on land.' },
  wheeled: { name: 'Wheeled', maxTonnage: 80, superheavyMax: 160, liftFraction: 0, liftName: null, description: 'Fast and cheap, but roads and open ground only.' },
  hover: { name: 'Hover', maxTonnage: 50, superheavyMax: 100, liftFraction: 0.1, liftName: 'Lift equipment', description: 'Very fast over land and water.' },
  wige: { name: 'WiGE', maxTonnage: 80, superheavyMax: 160, liftFraction: 0.1, liftName: 'Wings / lift equipment', description: 'Wing-in-ground-effect craft: skims over land and water; at least 5 cruise MP.' },
  vtol: { name: 'VTOL', maxTonnage: 30, superheavyMax: 60, liftFraction: 0.1, liftName: 'Rotor', description: 'Rotorcraft: flies over terrain; chin turret only.' },
  naval: { name: 'Naval (displacement hull)', maxTonnage: 300, superheavyMax: 555, liftFraction: 0, liftName: null, description: 'Surface ships.' },
  hydrofoil: { name: 'Naval (hydrofoil)', maxTonnage: 100, liftFraction: 0.1, liftName: 'Hydrofoil equipment', description: 'Fast surface craft.' },
  submarine: { name: 'Naval (submarine)', maxTonnage: 300, superheavyMax: 555, liftFraction: 0.1, liftName: 'Dive equipment', description: 'Operates underwater.' },
};

/** Superheavy: heavier than the motive type's normal maximum. */
export function isSuperheavyVehicle(d: Pick<VehicleDesign, 'motive' | 'tonnage'>): boolean {
  return d.tonnage > MOTIVE_TYPES[d.motive].maxTonnage;
}
/** Superheavy ground and naval vehicles have six armor facings (superheavy VTOLs keep four). */
export function hasSixFacings(d: Pick<VehicleDesign, 'motive' | 'tonnage'>): boolean {
  return isSuperheavyVehicle(d) && d.motive !== 'vtol';
}
/** Heaviest legal tonnage for the motive type, superheavy included. */
export const motiveMaxTonnage = (m: MotiveType) => MOTIVE_TYPES[m].superheavyMax ?? MOTIVE_TYPES[m].maxTonnage;

export const MOTIVE_ORDER: MotiveType[] = ['tracked', 'wheeled', 'hover', 'vtol', 'wige', 'naval', 'hydrofoil', 'submarine'];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Round up to the half ton (the epsilon absorbs float error; `|| 0` avoids -0). */
const halfUp = (n: number) => Math.ceil(n * 2 - 1e-9) / 2 || 0;

/** Suspension factor subtracted from cruise MP × tonnage to get the engine rating. */
export function suspensionFactor(motive: MotiveType, tonnage: number): number {
  const band = Math.max(0, Math.ceil(tonnage / 10) - 1); // 0 = up to 10 t, 1 = 11–20 t, …
  // Superheavy weights continue the tables as MegaMek does.
  switch (motive) {
    case 'tracked': return 0;
    case 'wheeled': return tonnage <= 80 ? 20 : 40;
    case 'naval':
    case 'submarine': {
      if (tonnage <= 300) return 30;
      const f = Math.ceil(tonnage / 10);
      return f + (f % 5);
    }
    case 'hover': return tonnage <= 50 ? [40, 85, 130, 175, 235][Math.min(band, 4)] : 235 + 45 * Math.ceil((tonnage - 50) / 25);
    case 'vtol': return tonnage <= 30 ? [50, 95, 140][Math.min(band, 2)] : 140 + 45 * Math.ceil((tonnage - 30) / 20);
    case 'hydrofoil': return [60, 105, 150, 195, 255, 300, 345, 390, 435, 480][Math.min(band, 9)];
    case 'wige': return tonnage <= 15 ? 45 : tonnage <= 30 ? 80 : tonnage <= 45 ? 115 : tonnage <= 80 ? 140 : 140 + 35 * Math.ceil((tonnage - 80) / 30);
  }
}

/** Engine rating: cruise MP × tonnage − suspension factor, rounded up to the next 5 (minimum 10). */
export function vehicleEngineRating(motive: MotiveType, tonnage: number, cruiseMP: number): number {
  const raw = cruiseMP * tonnage - suspensionFactor(motive, tonnage);
  return Math.max(10, Math.ceil(raw / 5) * 5);
}

const isFusion = (e: VehicleEngineType) => e !== 'ice' && e !== 'fuel-cell' && e !== 'fission' && e !== 'none';
/** Engines that power energy weapons without amplifiers (fusion and fission). */
const powersEnergy = (e: VehicleEngineType) => isFusion(e) || e === 'fission';
/** Heat sinks an engine provides for free: fusion 10, fission 5, fuel cell 1 (as MegaMek). */
export function vehicleFreeHeatSinks(e: VehicleEngineType): number {
  return isFusion(e) ? 10 : e === 'fission' ? 5 : e === 'fuel-cell' ? 1 : 0;
}

/** ICE engines weigh twice a standard fusion engine; fusion and fission engines need 50% extra shielding. */
export function vehicleEngineWeight(type: VehicleEngineType, rating: number): number | null {
  if (type === 'none') return 0;
  if (type === 'ice') {
    const std = standardFusionEngineWeight(rating);
    return std === null ? null : std * 2;
  }
  const w = engineWeight(type, rating);
  if (w === null) return null;
  return powersEnergy(type) ? halfUp(w * 1.5) : w;
}

export const VEHICLE_ENGINE_LABELS: Record<VehicleEngineType, string> = {
  ice: 'ICE', standard: 'Fusion', xl: 'XL Fusion', light: 'Light Fusion', compact: 'Compact Fusion',
  xxl: 'XXL Fusion', 'fuel-cell': 'Fuel Cell', fission: 'Fission', none: 'None (trailer)',
};

const opt = (label: string, techBase: TechBase | 'Both', firstEra: EraId): ComponentOption => ({ label, techBase, firstEra });

export const VEHICLE_ENGINE_OPTIONS: Record<VehicleEngineType, ComponentOption> = {
  ice: opt('ICE engines', 'Both', '3025'),
  standard: opt('Fusion engines', 'Both', '3025'),
  xl: opt('XL engines', 'Both', '3050'),
  light: opt('Light engines', 'IS', '3062'),
  compact: opt('Compact engines', 'IS', '3068'),
  xxl: opt('XXL engines', 'Both', '3068'),
  'fuel-cell': opt('Fuel cell engines', 'Both', '3025'),
  fission: opt('Fission engines', 'Both', '3025'),
  none: opt('No engine (trailers)', 'Both', '3025'),
};

export function vehicleWeightClass(tonnage: number, motive?: MotiveType): string {
  if (motive && tonnage > MOTIVE_TYPES[motive].maxTonnage) return 'Super-heavy';
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

/** Tech base of a vehicle's armor: its own on a mixed-tech design, otherwise the chassis'. */
/**
 * Cost of a vehicle's troop and cargo space (as MegaMek): infantry compartments and plain cargo bays cost nothing
 * but 1,000 C-bills per bay door; liquid, refrigerated and insulated bays 100 / 200 / 250 per ton (rounded up).
 */
export function vehicleCargoCost(d: Pick<VehicleDesign, 'cargo' | 'cargoBays' | 'troopSpace' | 'cargoDoors' | 'specialCargo'>): number {
  const troop = d.troopSpace ?? 0;
  const bayTons = Math.max(0, (d.cargo ?? 0) - troop);
  const bays = Math.max(0, (d.cargoBays ?? 1) - (troop > 0 ? 1 : 0));
  const doors = d.cargoDoors ?? (bayTons > 0 ? Math.max(1, bays) : 0);
  const rate = { liquid: 100, refrigerated: 200, insulated: 250 } as const;
  return 1000 * doors + (d.specialCargo ?? []).reduce((a, b) => a + rate[b.kind] * Math.ceil(b.tons - 1e-9), 0);
}

export function vehicleArmorTech(d: Pick<VehicleDesign, 'techBase' | 'mixedTech' | 'armorTech'>): TechBase {
  return (d.mixedTech && d.armorTech) || d.techBase;
}

export function vehicleArmorSlots(type: VehicleArmorType, techBase: TechBase): number {
  switch (type) {
    case 'ferro-fibrous': case 'reactive': return techBase === 'Clan' ? 1 : 2;
    case 'light-ferro': case 'reflective': case 'hardened': case 'ferro-lamellor': case 'ballistic-reinforced': return 1;
    case 'stealth': return 2;
    case 'heavy-ferro': return 3;
    default: return 0;
  }
}

/** Armor locations a vehicle has. */
export function vehicleArmorLocations(d: Pick<VehicleDesign, 'motive' | 'turret'> & Partial<Pick<VehicleDesign, 'tonnage' | 'dualTurret'>>): VehicleArmorLocation[] {
  const locs: VehicleArmorLocation[] = d.tonnage !== undefined && hasSixFacings({ motive: d.motive, tonnage: d.tonnage })
    ? ['FR', 'FRS', 'FLS', 'RRS', 'RLS', 'RR'] : ['FR', 'LS', 'RS', 'RR'];
  if (d.turret) locs.push('TU');
  if (d.turret && d.dualTurret) locs.push('TU2');
  if (d.motive === 'vtol') locs.push('RO');
  return locs;
}

/** Where an item may be mounted: weapons in firing arcs, everything else in the body. */
export function vehicleItemLocations(eq: Equipment, d: Pick<VehicleDesign, 'motive' | 'turret'> & Partial<Pick<VehicleDesign, 'tonnage' | 'dualTurret'>>): VehicleLocation[] {
  // Dumpers, and the cargo they unload, may sit at the front, sides or rear (MegaMek).
  const located = eq.variableWeight === 'dumper' || /^(cargo|liquid-storage)-/.test(eq.id);
  // VTOLs may carry equipment on a mast mount above the rotor; equipment may also sit in a turret (and counts toward
  // its weight), except ammunition and chassis modifications.
  if (!eq.isWeapon && !located) {
    const turretOk = d.turret && eq.category !== 'Ammo' && !eq.vehicleChassisMod;
    return [
      'BD', ...(d.motive === 'vtol' ? ['RO' as const] : []),
      ...(turretOk ? ['TU' as const] : []), ...(turretOk && d.dualTurret ? ['TU2' as const] : []),
    ];
  }
  if (located) return d.tonnage !== undefined && hasSixFacings({ motive: d.motive, tonnage: d.tonnage })
    ? ['BD', 'FR', 'FRS', 'FLS', 'RRS', 'RLS', 'RR'] : ['BD', 'FR', 'LS', 'RS', 'RR'];
  const arcs: VehicleLocation[] = d.tonnage !== undefined && hasSixFacings({ motive: d.motive, tonnage: d.tonnage })
    ? ['FR', 'FRS', 'FLS', 'RRS', 'RLS', 'RR'] : ['FR', 'LS', 'RS', 'RR'];
  if (d.turret) arcs.push('TU');
  if (d.turret && d.dualTurret) arcs.push('TU2');
  return arcs;
}

/** Mech-only equipment that vehicles cannot mount. */
export function isVehicleEquipment(eq: Equipment): boolean {
  if (eq.managed) return false; // heat sinks, jump jets, structure slots, TSM
  if (eq.variableWeight === 'masc' || eq.variableWeight === 'mechTurret' || eq.variableWeight === 'pintleTurret') return false;
  if (eq.lamOnly || eq.melee || eq.capitalClass || eq.vesselOnly) return false; // Land-Air 'Mech systems and 'Mech melee weapons
  return true;
}

export function turretName(d: Pick<VehicleDesign, 'motive'> & Partial<Pick<VehicleDesign, 'dualTurret'>>): string {
  return d.motive === 'vtol' ? 'Chin turret' : d.dualTurret ? 'Rear turret' : 'Turret';
}

/** Jump jet weight per jet, as 'Mech jump jets: ½ t up to 55 tons, 1 t up to 85, 2 t above. */
export function vehicleJumpJetWeight(tonnage: number): number {
  return tonnage <= 55 ? 0.5 : tonnage <= 85 ? 1 : 2;
}
export const vehicleJumpMP = (d: Pick<VehicleDesign, 'equipment'>) => d.equipment.filter((e) => e.equipmentId === 'vehicle-jump-jet').length;
export const hasJetBooster = (d: Pick<VehicleDesign, 'equipment'>) => d.equipment.some((e) => e.equipmentId === 'vtol-jet-booster');

// ---------------------------------------------------------------------------
// Design helpers
// ---------------------------------------------------------------------------

let vUid = 0;
export function newVehicleUid(): string {
  return `v-${Date.now().toString(36)}-${(vUid++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyVehicleArmor(): Record<VehicleArmorLocation, number> {
  return { FR: 0, FRS: 0, FLS: 0, LS: 0, RS: 0, RRS: 0, RLS: 0, RR: 0, TU: 0, TU2: 0, RO: 0 };
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
  /** Sponson turrets (both). */
  sponsons: number;
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
  /** Weight of the equipment mounted in the turret. */
  turretItemTons: number;
  /** Weight of the equipment in the front turret (dual turrets). */
  turret2ItemTons: number;
  /** Weight of the equipment in the sponson turrets. */
  sponsonItemTons: number;
  jumpMP: number;
  /** Flank MP with a VTOL jet booster engaged (twice cruise). */
  boostedFlankMP: number | null;
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
  // Chassis modifications weigh a share of the tonnage (rounded up to the half ton).
  if (eq.vehicleChassisMod) return halfUp(d.tonnage * (eq.techBase === 'Clan' && eq.vehicleChassisMod.clan ? eq.vehicleChassisMod.clan : eq.vehicleChassisMod.share));
  if (eq.variableWeight === 'supercharger') {
    // 10% of the engine weight, rounded up to the half ton.
    const engine = vehicleEngineWeight(d.engineType, vehicleEngineRating(d.motive, d.tonnage, d.cruiseMP)) ?? 0;
    return halfUp(engine / 10);
  }
  if (eq.variableWeight === 'droneOS') return halfUp(d.tonnage / 10 + 0.5);
  if (eq.variableWeight === 'vehicleJumpJet') return vehicleJumpJetWeight(d.tonnage);
  if (eq.variableWeight === 'boobyTrap') return halfUp(d.tonnage / 10);
  if (eq.variableWeight === 'srcs') return srcsWeight(eq.id, d.tonnage, halfUp);
  if (eq.variableWeight === 'dumper') return dumperWeight(d.equipment, halfUp);
  if (eq.variableWeight === 'targetingComputer') {
    let tons = 0;
    for (const m of d.equipment) {
      const w = getEquipment(m.equipmentId);
      if (w) tons += targetingComputerTons(w);
    }
    return Math.max(1, Math.ceil(tons / (eq.techBase === 'Clan' ? 5 : 4) - 1e-9));
  }
  return eq.tons;
}

/** Items that take no vehicle item slot (MegaMek's tankSlots 0): fire-control links, CASE on Clan units, chassis mods, … */
const NO_SLOT = new Set(['artemis-iv', 'clan-artemis-iv', 'clan-artemis-v', 'ppc-capacitor', 'clan-ppc-capacitor', 'flotation-hull',
  'laser-insulator', 'trailer-hitch', 'mast-mount', 'mash-theater', 'drone-carrier-slot', 'sponson-turret']);
/** Sized items whose pieces share one slot (MegaMek mounts each as a single item). */
const ONE_SLOT_GROUPS: [RegExp, string][] = [
  [/^communications-equipment$/, 'comms'], [/^vehicle-jump-jet$/, 'jump jets'], [/^extended-fuel-tank$/, 'fuel tanks'],
  [/^cargo-(1|half)$|^cargo-container$/, 'cargo'], [/^liquid-storage-(1|half)$/, 'liquid storage'], [/^ladder-20m$/, 'ladders'],
];

/** Engine item slots (TechManual / MegaMek): XL 2 (Clan 1), XXL 4 (Clan 2), light 1, large +1, compact −1. */
export function vehicleEngineSlots(d: Pick<VehicleDesign, 'engineType' | 'techBase' | 'motive' | 'tonnage' | 'cruiseMP'>): number {
  const clan = d.techBase === 'Clan';
  let n = d.engineType === 'xl' ? (clan ? 1 : 2) : d.engineType === 'xxl' ? (clan ? 2 : 4) : d.engineType === 'light' ? 1 : d.engineType === 'compact' ? -1 : 0;
  if (vehicleEngineRating(d.motive, d.tonnage, d.cruiseMP) > 400) n++;
  return n;
}

/**
 * Item slots used, as MegaMek's Tank.getFreeSlots counts them: one per item (none for fire-control links,
 * Clan CASE and chassis modifications; five for a Blue Shield), one in all for each sized system (cargo,
 * communications, jump jets, fuel tanks), one per kind of ammunition whatever its munition, the engine's and
 * armor's slots, Endo Steel structure, and one for troop space.
 */
export function vehicleSlotsUsed(d: VehicleDesign): number {
  let used = vehicleStructureSlots(d.structureType, d.techBase) + vehicleArmorSlots(d.armorType, vehicleArmorTech(d)) + vehicleEngineSlots(d);
  const ammoTypes = new Set<string>();
  const groups = new Set<string>();
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    if (eq.category === 'Ammo') { ammoTypes.add(eq.ammoFor ?? eq.id); continue; }
    if (NO_SLOT.has(eq.id) || eq.vehicleChassisMod || eq.id === 'clan-case' || (eq.id === 'case' && d.techBase === 'Clan')) continue;
    const g = ONE_SLOT_GROUPS.find(([re]) => re.test(eq.id));
    if (g) { groups.add(g[1]); continue; }
    used += eq.id === 'blue-shield' ? 5 : 1;
  }
  return used + groups.size + ammoTypes.size + ((d.cargo ?? 0) > 0 ? Math.max(1, d.cargoBays ?? 1) : 0);
}

export function computeVehicle(d: VehicleDesign): VehicleSummary {
  const motive = MOTIVE_TYPES[d.motive];
  const rating = vehicleEngineRating(d.motive, d.tonnage, d.cruiseMP);
  // Hovercraft engines weigh at least 20% of the vehicle (TechManual).
  const baseEngine = vehicleEngineWeight(d.engineType, rating);
  const engineWt = baseEngine === null ? null
    : d.motive === 'hover' ? Math.max(baseEngine, halfUp(d.tonnage * 0.2)) : baseEngine;
  const ppt = armorPointsPerTon(d.armorType, vehicleArmorTech(d));
  const armorLocations = vehicleArmorLocations(d);
  const armorTotal = armorLocations.reduce((a, l) => a + (d.armor[l] ?? 0), 0);

  let equipment = 0;
  let turretItems = 0;
  let turret2Items = 0;
  let sponsonItems = 0;
  let energyTons = 0;
  let energyHeat = 0;
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const w = vehicleItemWeight(eq, d);
    equipment += w;
    if (item.location === 'TU') turretItems += w;
    if (item.location === 'TU2') turret2Items += w;
    if (item.sponson && eq.category !== 'Ammo') sponsonItems += w;
    // Ammunition-fed flamers (vehicle and heavy flamers) need neither power amplifiers nor heat sinks (as MegaMek).
    // (as are other ammunition-fed energy weapons such as chemical lasers; plasma weapons still count).
    if (eq.isWeapon && eq.category === 'Energy' && !(eq.ammoPerTon && !/plasma/.test(eq.id))) energyTons += eq.tons;
  }
  energyHeat = heatNeutralHeat(d.equipment, powersEnergy(d.engineType));
  // Stealth armor generates 10 heat that the heat sinks must handle (as MegaMek).
  if (d.armorType === 'stealth') energyHeat += 10;

  const freeHeatSinks = vehicleFreeHeatSinks(d.engineType);
  const weights: VehicleWeights = {
    // Superheavy ground vehicles carry twice the structure (naval superheavies do not), as MegaMek.
    structure: halfUp(d.tonnage * (d.structureType === 'endo-steel' ? 0.05 : 0.1)
      * (isSuperheavyVehicle(d) && d.motive !== 'naval' && d.motive !== 'submarine' ? 2 : 1)),
    engine: engineWt ?? 0,
    lift: halfUp(d.tonnage * motive.liftFraction),
    controls: d.trailer && d.noControls ? 0 : halfUp(d.tonnage * 0.05),
    // Each turret weighs 10% of the equipment in it (OmniVehicles: as the base chassis sets).
    turret: (d.turret ? (d.omni && d.omniTurretTons !== undefined ? d.omniTurretTons : halfUp(turretItems * 0.1)) : 0)
      + (d.turret && d.dualTurret ? (d.omni && d.omniTurret2Tons !== undefined ? d.omniTurret2Tons : halfUp(turret2Items * 0.1)) : 0),
    // The pair of sponson turrets weighs 10% of the equipment in them.
    sponsons: d.sponsons ? (d.omni && d.omniSponsonTons !== undefined ? d.omniSponsonTons : halfUp(sponsonItems * 0.1)) : 0,
    powerAmplifiers: powersEnergy(d.engineType) ? 0 : halfUp(energyTons * 0.1),
    heatSinks: Math.max(0, d.heatSinks - freeHeatSinks),
    armor: armorTonnage(armorTotal, ppt),
    equipment,
    cargo: d.cargo ?? 0,
    total: 0,
    free: 0,
  };
  weights.total = weights.structure + weights.engine + weights.lift + weights.controls + weights.turret + weights.sponsons +
    weights.powerAmplifiers + weights.heatSinks + weights.armor + weights.equipment + weights.cargo;
  weights.free = d.tonnage - weights.total;

  return {
    rating,
    turretItemTons: turretItems,
    turret2ItemTons: turret2Items,
    sponsonItemTons: sponsonItems,
    jumpMP: vehicleJumpMP(d),
    boostedFlankMP: hasJetBooster(d) ? d.cruiseMP * 2 : null,
    suspension: suspensionFactor(d.motive, d.tonnage),
    flankMP: Math.ceil(d.cruiseMP * 1.5),
    engineWeight: engineWt,
    weightClass: vehicleWeightClass(d.tonnage, d.motive),
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
    const chosen: [ComponentOption, TechBase][] = [[VEHICLE_ENGINE_OPTIONS[d.engineType], d.techBase], [STRUCTURE_OPTIONS[d.structureType], d.techBase], [ARMOR_OPTIONS[d.armorType], vehicleArmorTech(d)]];
    for (const [o, tech] of chosen) {
      if (!componentEraOk(o, d.era, tech)) error(`${o.label} cannot be used in the ${era.name} era.`);
      else if (!componentTechOk(o, d.techBase, d.mixedTech)) {
        error(`${o.label}: ${TECH_BASE_NAMES[o.techBase as TechBase]} technology only (needs mixed tech on a ${TECH_BASE_NAMES[d.techBase]} design).`);
      }
    }
    if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era.name} era.`);
  }

  // Chassis and movement
  const maxT = motiveMaxTonnage(d.motive);
  if (!Number.isInteger(d.tonnage) || d.tonnage < 1 || d.tonnage > maxT) {
    error(`${motive.name} vehicles must weigh 1–${maxT} tons${motive.superheavyMax ? ` (over ${motive.maxTonnage}: superheavy)` : ''} in whole tons (got ${d.tonnage}).`);
  }
  if (!Number.isInteger(d.cruiseMP) || (d.cruiseMP < 1 && !d.trailer && d.engineType !== 'none')) error('Cruising MP must be a whole number of at least 1.');
  if (s.rating > 500) error(`Engine rating ${s.rating} exceeds the maximum of 500.`);
  else if (s.engineWeight === null) error(`No ${VEHICLE_ENGINE_LABELS[d.engineType]} engine exists with rating ${s.rating}.`);
  else if (s.rating > 400) {
    // Large engines (Tactical Operations).
    if (['compact', 'fuel-cell', 'fission'].includes(d.engineType)) error(`There are no large ${VEHICLE_ENGINE_LABELS[d.engineType]} engines (rating over 400).`);
    const o = d.engineType === 'ice' ? LARGE_ICE_OPTION : LARGE_ENGINE_OPTION;
    if (era && !componentEraOk(o, d.era, d.techBase)) error(`${o.label} cannot be used in the ${era.name} era.`);
  }

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
  if (d.motive === 'wige' && d.cruiseMP < 5) error('WiGE vehicles need at least 5 cruise MP.');
  if (d.armorType === 'stealth' && !d.equipment.some((e) => /(^|-)ecm$/.test(e.equipmentId))) error('Stealth armor needs an ECM suite.');
  if (d.omni && d.turret && d.omniTurretTons !== undefined && s.turretItemTons > d.omniTurretTons * 10 + 1e-9) {
    error(`Turret pods weigh ${fmt(s.turretItemTons)} tons; the base chassis turret carries ${fmt(d.omniTurretTons * 10)}.`);
  }
  if (d.motive === 'vtol' && d.equipment.some((e) => e.equipmentId === 'supercharger')) error('VTOLs cannot mount superchargers.');
  // Dual and sponson turrets, jump jets and jet boosters (Tactical Operations, as MegaMek)
  if (d.dualTurret && !d.turret) error('A front turret needs the main turret as well.');
  if (d.dualTurret && d.motive === 'vtol') error('VTOLs cannot have dual turrets.');
  if (d.omni && d.dualTurret && d.omniTurret2Tons !== undefined && s.turret2ItemTons > d.omniTurret2Tons * 10 + 1e-9) {
    error(`Front turret pods weigh ${fmt(s.turret2ItemTons)} tons; the base chassis front turret carries ${fmt(d.omniTurret2Tons * 10)}.`);
  }
  const sponsonItems = d.equipment.filter((e) => e.sponson);
  if (sponsonItems.length && !d.sponsons) error('Equipment is marked for sponson turrets but the vehicle has none.');
  if (sponsonItems.some((e) => !e.location || !SPONSON_LOCATIONS.includes(e.location))) error('Sponson turret weapons must be mounted on a side.');
  if (d.sponsons && era && !isAvailableIn('3068', d.era)) error(`Sponson turrets cannot be used in the ${era.name} era.`);
  if (d.dualTurret && era && !isAvailableIn('3068', d.era)) error(`Dual turrets cannot be used in the ${era.name} era.`);
  if (s.jumpMP > 0) {
    if (!['hover', 'wheeled', 'tracked', 'wige'].includes(d.motive)) error('Only hover, wheeled, tracked and WiGE vehicles can mount jump jets.');
    if (d.sponsons) error('Vehicle jump jets cannot be combined with sponson turrets.');
    if (s.jumpMP > d.cruiseMP) error(`Jumping MP (${s.jumpMP}) cannot exceed cruising MP (${d.cruiseMP}).`);
  }
  const boosters = d.equipment.filter((e) => e.equipmentId === 'vtol-jet-booster').length;
  if (boosters && d.motive !== 'vtol') error('Only VTOLs can mount a jet booster.');
  if (boosters > 1) error('Only one jet booster may be installed.');
  if (d.engineType === 'none' && !d.trailer) error('Only trailers can be built without an engine.');
  if (d.engineType === 'none' && d.cruiseMP > 0) error('A vehicle without an engine (a trailer) has no cruise MP.');
  const mods = d.equipment.map((e) => getEquipment(e.equipmentId)).filter((e) => e?.vehicleChassisMod);
  if (mods.some((e) => /amphibious/.test(e!.id)) && ['hover', 'naval', 'hydrofoil', 'submarine', 'vtol', 'wige'].includes(d.motive)) {
    error('Amphibious chassis modifications are for tracked and wheeled vehicles.');
  }
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
    error(`Energy weapons${d.armorType === 'stealth' ? ' and stealth armor' : ''} generate ${s.energyHeat} heat but only ${d.heatSinks} heat sink(s) are fitted.`);
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
  const artemisV = ids.filter((id) => id === 'clan-artemis-v').length;
  const launchersV = ids.filter((id) => isArtemisVCapable(id)).length;
  if (artemisV > launchersV) error(`${artemisV} Artemis V FCS but only ${launchersV} Clan LRM/SRM launcher(s) to link them to.`);
  else if (artemis + artemisV > launchers) error(`${artemis} Artemis IV FCS but only ${launchers} LRM/SRM launcher(s) to link them to.`);

  const idSet = new Set(ids.flatMap((id) => [id, getEquipment(id)?.ammoOf ?? id]));
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
  const tonnage = Math.min(d.tonnage, motiveMaxTonnage(motive));
  const armor = { ...d.armor };
  if (motive !== 'vtol') armor.RO = 0;
  return syncVehicleFacings(d, { ...d, motive, tonnage, armor });
}

export function setVehicleTonnage(d: VehicleDesign, tonnage: number): VehicleDesign {
  return syncVehicleFacings(d, { ...d, tonnage: Math.max(1, Math.min(Math.round(tonnage), motiveMaxTonnage(d.motive))) });
}

/**
 * Crossing into (or out of) superheavy weights changes the side facings: the left and right sides split
 * into front and rear sides (armor shared out, weapons on the front side), or merge back.
 */
function syncVehicleFacings(before: VehicleDesign, next: VehicleDesign): VehicleDesign {
  const was = hasSixFacings(before);
  const now = hasSixFacings(next);
  if (was === now) return next;
  const a = { ...next.armor };
  const move: Partial<Record<VehicleLocation, VehicleLocation>> = now
    ? { LS: 'FLS', RS: 'FRS' } : { FLS: 'LS', RLS: 'LS', FRS: 'RS', RRS: 'RS' };
  if (now) {
    a.FLS = Math.ceil(a.LS / 2); a.RLS = Math.floor(a.LS / 2); a.FRS = Math.ceil(a.RS / 2); a.RRS = Math.floor(a.RS / 2);
    a.LS = 0; a.RS = 0;
  } else {
    a.LS = a.FLS + a.RLS; a.RS = a.FRS + a.RRS;
    a.FLS = 0; a.RLS = 0; a.FRS = 0; a.RRS = 0;
  }
  return { ...next, armor: a, equipment: next.equipment.map((e) => (e.location && move[e.location] ? { ...e, location: move[e.location]! } : e)) };
}

export function setVehicleTurret(d: VehicleDesign, turret: boolean): VehicleDesign {
  if (turret) return { ...d, turret };
  const { dualTurret: _d, omniTurret2Tons: _o, ...rest } = d;
  return {
    ...rest,
    turret,
    armor: { ...d.armor, TU: 0, TU2: 0 },
    equipment: d.equipment.map((e) => (e.location === 'TU' || e.location === 'TU2' ? { ...e, location: null } : e)),
  };
}

/** Add or remove the front turret (its equipment becomes unplaced when removed). */
export function setVehicleDualTurret(d: VehicleDesign, dual: boolean): VehicleDesign {
  if (dual) return { ...d, turret: true, dualTurret: true };
  const { dualTurret: _d, omniTurret2Tons: _o, ...rest } = d;
  return { ...rest, armor: { ...d.armor, TU2: 0 }, equipment: d.equipment.map((e) => (e.location === 'TU2' ? { ...e, location: null } : e)) };
}

/** Add or remove the pair of sponson turrets (their equipment stays on the sides, unturreted, when removed). */
export function setVehicleSponsons(d: VehicleDesign, sponsons: boolean): VehicleDesign {
  if (sponsons) return { ...d, sponsons: true };
  const { sponsons: _s, omniSponsonTons: _o, ...rest } = d;
  return { ...rest, equipment: d.equipment.map(({ sponson: _x, ...e }) => e) };
}

export function setVehicleItemSponson(d: VehicleDesign, uid: string, sponson: boolean): VehicleDesign {
  return { ...d, equipment: d.equipment.map((e) => (e.uid !== uid ? e : sponson ? { ...e, sponson: true } : (({ sponson: _x, ...rest }) => rest)(e))) };
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
  const six = hasSixFacings(d);
  const shares: [VehicleArmorLocation, number][] = six
    ? (d.turret
      ? [['FR', 0.22], ['FRS', 0.12], ['FLS', 0.12], ['RRS', 0.09], ['RLS', 0.09], ['RR', 0.12], ['TU', 0.24]]
      : [['FR', 0.26], ['FRS', 0.15], ['FLS', 0.15], ['RRS', 0.12], ['RLS', 0.12], ['RR', 0.2]])
    : d.turret
      ? [['FR', 0.3], ['LS', 0.2], ['RS', 0.2], ['RR', 0.12], ['TU', 0.18]]
      : [['FR', 0.34], ['LS', 0.24], ['RS', 0.24], ['RR', 0.18]];
  let given = 0;
  for (const [l, f] of shares) {
    armor[l] = Math.floor(left * f);
    given += armor[l];
  }
  armor.FR += left - given; // remainder to the front
  if (d.turret && d.dualTurret) { armor.TU2 = Math.floor(armor.TU / 2); armor.TU -= armor.TU2; }
  return { ...d, armor };
}

export function setVehicleArmorTonnage(d: VehicleDesign, tons: number): VehicleDesign {
  const ppt = armorPointsPerTon(d.armorType, vehicleArmorTech(d));
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
    return { uid: newVehicleUid(), equipmentId: e.equipmentId, location, ...(e.sponson === true ? { sponson: true } : {}) };
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
    engineType: pick(r.engineType, ['ice', 'standard', 'xl', 'light', 'compact', 'xxl', 'fuel-cell', 'fission', 'none'] as const, 'ice'),
    structureType: pick(r.structureType, ['standard', 'endo-steel'] as const, 'standard'),
    armorType: pick(r.armorType, ['standard', 'ferro-fibrous', 'light-ferro', 'heavy-ferro', 'reactive', 'reflective', 'hardened', 'stealth', 'ferro-lamellor', 'ballistic-reinforced'] as const, 'standard'),
    ...(r.mixedTech === true && (r.armorTech === 'IS' || r.armorTech === 'Clan') && r.armorTech !== r.techBase ? { armorTech: r.armorTech } : {}),
    ...(r.omni === true ? { omni: true } : {}),
    ...(r.trailer === true ? { trailer: true } : {}),
    ...(r.trailer === true && r.noControls === true ? { noControls: true } : {}),
    ...(r.omni === true && typeof r.omniTurretTons === 'number' ? { omniTurretTons: r.omniTurretTons } : {}),
    turret: r.turret === true,
    ...(r.turret === true && r.dualTurret === true ? { dualTurret: true } : {}),
    ...(r.omni === true && typeof r.omniTurret2Tons === 'number' ? { omniTurret2Tons: r.omniTurret2Tons } : {}),
    ...(r.sponsons === true ? { sponsons: true } : {}),
    ...(r.omni === true && typeof r.omniSponsonTons === 'number' ? { omniSponsonTons: r.omniSponsonTons } : {}),
    heatSinks: typeof r.heatSinks === 'number' ? r.heatSinks : 0,
    cargo: typeof r.cargo === 'number' && r.cargo > 0 ? r.cargo : undefined,
    ...(typeof r.cargoBays === 'number' && r.cargoBays > 1 ? { cargoBays: Math.round(r.cargoBays) } : {}),
    ...(typeof r.troopSpace === 'number' && r.troopSpace > 0 ? { troopSpace: r.troopSpace } : {}),
    ...(typeof r.cargoDoors === 'number' && r.cargoDoors >= 0 ? { cargoDoors: Math.round(r.cargoDoors) } : {}),
    ...(Array.isArray(r.specialCargo) ? { specialCargo: (r.specialCargo as { kind: string; tons: number }[])
      .filter((b) => ['liquid', 'insulated', 'refrigerated'].includes(b?.kind) && typeof b.tons === 'number')
      .map((b) => ({ kind: b.kind as 'liquid', tons: b.tons })) } : {}),
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
  if (d.turret) lines.push(row(`${d.dualTurret ? 'Turrets (rear and front)' : turretName(d)}:`, s.weights.turret));
  if (d.sponsons) lines.push(row('Sponson turrets:', s.weights.sponsons));
  if (s.weights.cargo) lines.push(row('Troop / Cargo Space:', s.weights.cargo));
  const armorLabel = d.armorType === 'standard' ? '' : ` (${ARMOR_NAMES[d.armorType]})`;
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
