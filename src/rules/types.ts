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
}

export interface ArmActuators {
  lowerArm: boolean;
  hand: boolean;
}

export interface MechDesign {
  schemaVersion: 1;
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
