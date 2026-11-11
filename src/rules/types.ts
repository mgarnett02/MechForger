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
export function locationName(d: { config?: MechConfig }, loc: Location): string {
  return (isQuad(d) ? QUAD_LOCATION_NAMES : LOCATION_NAMES)[loc];
}

const QUAD_ABBR: Partial<Record<Location, string>> = { LA: 'FLL', RA: 'FRL', LL: 'RLL', RL: 'RRL' };

/** Short location code as printed on sheets: LA, RT… (FLL, RRL… for a quad's legs). */
export function locationAbbr(d: { config?: MechConfig }, loc: Location): string {
  return (isQuad(d) && QUAD_ABBR[loc]) || loc;
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
}

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

export type StructureType = 'standard' | 'endo-steel' | 'endo-prototype' | 'endo-composite' | 'composite' | 'reinforced';
export type EngineType = 'standard' | 'xl' | 'xxl' | 'light' | 'compact';
export type GyroType = 'standard' | 'xl' | 'heavy-duty' | 'compact';
export type JumpJetType = 'standard' | 'improved';
/** Cockpits shared with fighters. */
export type BasicCockpitType = 'standard' | 'small';
export type CockpitType = BasicCockpitType | 'command-console' | 'torso-mounted';
export type HeatSinkType = 'single' | 'double';
/** Armor types shared by vehicles and fighters. */
export type BasicArmorType = 'standard' | 'ferro-fibrous' | 'light-ferro' | 'heavy-ferro';
/** Structure types shared by vehicles. */
export type BasicStructureType = 'standard' | 'endo-steel';
export type ArmorType =
  | 'standard' | 'ferro-fibrous' | 'light-ferro' | 'heavy-ferro'
  | 'stealth' | 'reactive' | 'reflective' | 'hardened' | 'ferro-lamellor'
  | 'ballistic-reinforced' | 'anti-penetrative' | 'heat-dissipating' | 'impact-resistant';
export type MyomerType = 'standard' | 'tsm';

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
  jumpJetType: JumpJetType;
  armorType: ArmorType;
  myomer: MyomerType;
  /** Mixed tech (Advanced rules): equipment from either tech base on this chassis. */
  mixedTech: boolean;
  /** Biped (two legs, two arms) or quad (four legs). */
  config: MechConfig;
  /** Land-Air 'Mech type (bipeds only); absent or null for an ordinary 'Mech. */
  lam?: LamType | null;
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

export type WeightClass = 'Light' | 'Medium' | 'Heavy' | 'Assault';
