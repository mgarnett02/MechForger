import type { EraId } from './eras';

/** Mech body locations (biped). */
export const LOCATIONS = ['HD', 'CT', 'LT', 'RT', 'LA', 'RA', 'LL', 'RL'] as const;
export type Location = (typeof LOCATIONS)[number];

export const LOCATION_NAMES: Record<Location, string> = {
  HD: 'Head',
  CT: 'Center Torso',
  LT: 'Left Torso',
  RT: 'Right Torso',
  LA: 'Left Arm',
  RA: 'Right Arm',
  LL: 'Left Leg',
  RL: 'Right Leg',
};

/** Biped or four-legged. A quad uses the same location codes: LA/RA are its front legs, LL/RL its rear legs. */
export type MechConfig = 'biped' | 'quad';

const QUAD_LOCATION_NAMES: Record<Location, string> = {
  ...LOCATION_NAMES,
  LA: 'Front Left Leg',
  RA: 'Front Right Leg',
  LL: 'Rear Left Leg',
  RL: 'Rear Right Leg',
};

export const isQuad = (d: { config?: MechConfig }) => d.config === 'quad';

/**
 * Land-Air 'Mechs (Interstellar Operations): a standard LAM converts between 'Mech, AirMech
 * and fighter modes; a bimodal LAM has no AirMech mode.
 */
export type LamType = 'standard' | 'bimodal';
export const LAM_TYPE_NAMES: Record<LamType, string> = { standard: 'Standard', bimodal: 'Bimodal' };
export const isLam = (d: { lam?: LamType | null }) => !!d.lam;

/** Location name for this design's configuration. */
/** Components whose tech base can differ from the chassis on a mixed-tech design. */
export type TechComponent = 'structure' | 'armor' | 'engine' | 'heatSinks';
export const TECH_COMPONENTS: readonly TechComponent[] = ['structure', 'armor', 'engine', 'heatSinks'];

/** Tech base of a component: its own on a mixed-tech design, otherwise the chassis'. */
export function techOf(d: { techBase: TechBase; mixedTech?: boolean; componentTech?: Partial<Record<TechComponent, TechBase>> }, part: TechComponent): TechBase {
  return (d.mixedTech && d.componentTech?.[part]) || d.techBase;
}

/** Primitive 'Mechs (Interstellar Operations): primitive cockpit, engine rated at 1.2 × tonnage × walking MP. */
export function isPrimitive(d: { cockpitType?: string }): boolean {
  return d.cockpitType === 'primitive' || d.cockpitType === 'primitive-industrial';
}

/** Engine rating: tonnage × walking MP (primitive 'Mechs: × 1.2, rounded up to the next 5). */
export function engineRatingFor(d: { tonnage: number; walkMP: number; cockpitType?: string }): number {
  const r = d.tonnage * d.walkMP;
  return isPrimitive(d) ? Math.ceil((r * 1.2) / 5 - 1e-9) * 5 : r;
}

export function locationName(d: { config?: MechConfig }, loc: Location): string {
  return (isQuad(d) ? QUAD_LOCATION_NAMES : LOCATION_NAMES)[loc];
}

const QUAD_ABBR: Partial<Record<Location, string>> = { LA: 'FLL', RA: 'FRL', LL: 'RLL', RL: 'RRL' };

/** Short location code as printed on sheets: LA, RT… (FLL, RRL… for a quad's legs). */
export function locationAbbr(d: { config?: MechConfig }, loc: Location): string {
  return (isQuad(d) && QUAD_ABBR[loc]) || loc;
}

/** An item's location code; split weapons show both parts ("LT/LA"). */
export function mountAbbr(d: { config?: MechConfig }, item: { location: Location | null; split?: { location: Location } }): string {
  if (!item.location) return '—';
  return item.split ? `${locationAbbr(d, item.location)}/${locationAbbr(d, item.split.location)}` : locationAbbr(d, item.location);
}

/** Locations that are legs for this configuration. */
export function legLocations(d: { config?: MechConfig }): readonly Location[] {
  return isQuad(d) ? ['LA', 'RA', 'LL', 'RL'] : ['LL', 'RL'];
}

export const TORSO_LOCATIONS: readonly Location[] = ['CT', 'LT', 'RT'];
export const ARM_LOCATIONS = ['LA', 'RA'] as const;
export type ArmLocation = (typeof ARM_LOCATIONS)[number];

/** Armor is tracked per location, plus a rear facing for each torso location. */
export type ArmorFacing = Location | 'CTR' | 'LTR' | 'RTR';
export const ARMOR_FACINGS: readonly ArmorFacing[] = [
  'HD', 'CT', 'CTR', 'LT', 'LTR', 'RT', 'RTR', 'LA', 'RA', 'LL', 'RL',
];
export const REAR_FACING: Partial<Record<Location, ArmorFacing>> = {
  CT: 'CTR',
  LT: 'LTR',
  RT: 'RTR',
};
export const FACING_NAMES: Record<ArmorFacing, string> = {
  ...LOCATION_NAMES,
  CTR: 'Center Torso (rear)',
  LTR: 'Left Torso (rear)',
  RTR: 'Right Torso (rear)',
};

export function facingName(d: { config?: MechConfig }, f: ArmorFacing): string {
  return f in LOCATION_NAMES ? locationName(d, f as Location) : FACING_NAMES[f];
}

export type ArmorAllocation = Record<ArmorFacing, number>;

/** A piece of equipment installed (or waiting to be installed) on the mech. */
export interface MountedItem {
  uid: string;
  equipmentId: string;
  /** null = not yet allocated to a location. */
  location: Location | null;
  /** Rear-firing (torso weapons only). */
  rear?: boolean;
  /** OmniMechs: pod-mounted (belongs to the active configuration) rather than fixed. */
  pod?: boolean;
  /** Armored component (TO:AUE p. 95): +0.5 t per slot, survives a critical hit roll. */
  armored?: boolean;
  /** Split weapons (8+ slots): this many slots sit in an adjacent location; the rest in `location`. */
  split?: { location: Location; slots: number };
}

/** Locations a split weapon may straddle: arm or leg with its side torso, side torso with the center torso. */
export const SPLIT_ADJACENT: Record<Location, readonly Location[]> = {
  HD: [], CT: ['LT', 'RT'], LT: ['CT', 'LA', 'LL'], RT: ['CT', 'RA', 'RL'], LA: ['LT'], RA: ['RT'], LL: ['LT'], RL: ['RT'],
};

/** An OmniMech configuration: the pod-mounted items that go with it. */
export interface OmniConfiguration {
  name: string;
  /** Pod items for this configuration (for the active one, the live copy is in design.equipment). */
  pod: MountedItem[];
  /**
   * Lower arm / hand actuators for this configuration (OmniMechs may change them per configuration).
   * For the active one, the live copy is design.actuators. Absent = same as the active configuration.
   */
  actuators?: Record<ArmLocation, ArmActuators>;
  /** Mixed-tech pods (e.g. Inner Sphere weapons on a Clan OmniMech). Absent = same as the active configuration. */
  mixedTech?: boolean;
  /** Jump jet type of this configuration's pod-mounted jets. Absent = same as the active configuration. */
  jumpJetType?: JumpJetType;
}

export interface OmniData {
  configurations: OmniConfiguration[];
  active: number;
}

export interface ArmActuators {
  lowerArm: boolean;
  hand: boolean;
}

export type TechBase = 'IS' | 'Clan';
export const TECH_BASE_NAMES: Record<TechBase, string> = { IS: 'Inner Sphere', Clan: 'Clan' };

export type StructureType = 'standard' | 'endo-steel' | 'endo-prototype' | 'endo-composite' | 'composite' | 'reinforced' | 'industrial';
export type EngineType = 'standard' | 'xl' | 'xxl' | 'light' | 'compact' | 'ice' | 'fuel-cell' | 'fission';
export type GyroType = 'standard' | 'xl' | 'heavy-duty' | 'compact' | 'none';
export type JumpJetType = 'standard' | 'improved';
/** Cockpits shared with fighters. */
export type BasicCockpitType = 'standard' | 'small';
/** 'industrial': an IndustrialMech cockpit without advanced fire control (a standard cockpit on an IndustrialMech has it). */
export type CockpitType = BasicCockpitType | 'command-console' | 'torso-mounted' | 'industrial' | 'primitive' | 'primitive-industrial' | 'interface';
export type HeatSinkType = 'single' | 'double';
/** Armor types shared by vehicles and fighters. */
export type BasicArmorType = 'standard' | 'ferro-fibrous' | 'light-ferro' | 'heavy-ferro';
/** Structure types shared by vehicles. */
export type BasicStructureType = 'standard' | 'endo-steel';
export type ArmorType =
  | 'standard' | 'ferro-fibrous' | 'light-ferro' | 'heavy-ferro' | 'primitive'
  | 'stealth' | 'reactive' | 'reflective' | 'hardened' | 'ferro-lamellor'
  | 'ballistic-reinforced' | 'anti-penetrative' | 'heat-dissipating' | 'impact-resistant'
  | 'commercial' | 'industrial' | 'heavy-industrial';
export type MyomerType = 'standard' | 'tsm' | 'industrial-tsm';

export interface MechDesign {
  /** Master Unit List id, for designs loaded from the canon list. */
  mulId?: number;
  schemaVersion: 1;
  /** Tech level / era the design is built for. */
  era: EraId;
  techBase: TechBase;
  structureType: StructureType;
  engineType: EngineType;
  gyroType: GyroType;
  cockpitType: CockpitType;
  heatSinkType: HeatSinkType;
  /** Armored system slots (engine, gyro, cockpit, actuators…): indices into each location's fixed slots. */
  armoredSlots?: Partial<Record<Location, number[]>>;
  jumpJetType: JumpJetType;
  armorType: ArmorType;
  myomer: MyomerType;
  /** Mixed tech (Advanced rules): equipment from either tech base on this chassis. */
  mixedTech: boolean;
  /** Biped (two legs, two arms) or quad (four legs). */
  config: MechConfig;
  /** Land-Air 'Mech type (bipeds only); absent or null for an ordinary 'Mech. */
  lam?: LamType | null;
  /** IndustrialMechs: environmental sealing (one slot per location, a tenth of the tonnage). */
  environmentalSealing?: boolean;
  /** Clan laser heat sinks in place of double heat sinks (same weight, slots and dissipation). */
  laserHeatSinks?: boolean;
  /**
   * Mixed tech: the tech base of individual components when it differs from the chassis
   * (e.g. Clan double heat sinks or Clan ferro-fibrous armor on an Inner Sphere chassis).
   */
  componentTech?: Partial<Record<TechComponent, TechBase>>;
  /** Full Head Ejection System (Hatchetman, Axman…): no weight or slots, adds cost. */
  fullHeadEjection?: boolean;
  /** Set for OmniMechs: configurations of pod-mounted equipment. */
  omni: OmniData | null;
  chassis: string;
  model: string;
  tonnage: number;
  walkMP: number;
  /** Heat sinks carried inside the engine (no critical slots). */
  engineHeatSinks: number;
  armor: ArmorAllocation;
  /** Arm actuators (bipeds only; a quad's front legs always have full leg actuators). */
  actuators: Record<ArmLocation, ArmActuators>;
  /** Weapons, ammo, plus heat sinks / jump jets that need critical slots. */
  equipment: MountedItem[];
}

/** An IndustrialMech: built on industrial internal structure. */
export const isIndustrial = (d: { structureType?: string }) => d.structureType === 'industrial';

export type WeightClass = 'Ultralight' | 'Light' | 'Medium' | 'Heavy' | 'Assault';
