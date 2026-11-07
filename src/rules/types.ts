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

export type StructureType = 'standard' | 'endo-steel';
export type EngineType = 'standard' | 'xl' | 'light' | 'compact';
export type GyroType = 'standard' | 'xl' | 'heavy-duty' | 'compact';
export type JumpJetType = 'standard' | 'improved';
export type CockpitType = 'standard' | 'small';
export type HeatSinkType = 'single' | 'double';
export type ArmorType = 'standard' | 'ferro-fibrous' | 'light-ferro' | 'heavy-ferro';
export type MyomerType = 'standard' | 'tsm';

export interface MechDesign {
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
  /** Set for OmniMechs: configurations of pod-mounted equipment. */
  omni: OmniData | null;
  chassis: string;
  model: string;
  tonnage: number;
  walkMP: number;
  /** Heat sinks carried inside the engine (no critical slots). */
  engineHeatSinks: number;
  armor: ArmorAllocation;
  actuators: Record<ArmLocation, ArmActuators>;
  /** Weapons, ammo, plus heat sinks / jump jets that need critical slots. */
  equipment: MountedItem[];
}

export type WeightClass = 'Light' | 'Medium' | 'Heavy' | 'Assault';
