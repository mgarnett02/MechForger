import type { Location } from './types';
import { LOCATIONS } from './types';

export type EquipmentCategory = 'Energy' | 'Ballistic' | 'Missile' | 'Ammo' | 'Other';

export interface RangeBrackets {
  min: number;
  short: number;
  medium: number;
  long: number;
}

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  /** Weight in tons (jump jets use jumpJetWeight() instead). */
  tons: number;
  slots: number;
  heat: number;
  damage?: string;
  range?: RangeBrackets;
  /** For weapons that use ammunition: shots per ton. */
  ammoPerTon?: number;
  /** For ammo bins: the weapon id this ammo feeds. */
  ammoFor?: string;
  /** Locations this item may be mounted in (default: anywhere). */
  allowedLocations?: readonly Location[];
  isWeapon: boolean;
  /** Weight depends on the mech's tonnage (jump jets). */
  variableWeight?: 'jumpJet';
  /** Added/removed through chassis controls rather than the equipment catalog. */
  managed?: boolean;
}

function weapon(
  id: string,
  name: string,
  category: EquipmentCategory,
  tons: number,
  slots: number,
  heat: number,
  damage: string,
  range: [number, number, number, number],
  ammoPerTon?: number,
): Equipment {
  const [min, short, medium, long] = range;
  return {
    id, name, category, tons, slots, heat, damage,
    range: { min, short, medium, long },
    ammoPerTon, isWeapon: true,
  };
}

/** Introductory Inner Sphere (3025) weapons. */
export const WEAPONS: readonly Equipment[] = [
  weapon('small-laser', 'Small Laser', 'Energy', 0.5, 1, 1, '3', [0, 1, 2, 3]),
  weapon('medium-laser', 'Medium Laser', 'Energy', 1, 1, 3, '5', [0, 3, 6, 9]),
  weapon('large-laser', 'Large Laser', 'Energy', 5, 2, 8, '8', [0, 5, 10, 15]),
  weapon('ppc', 'PPC', 'Energy', 7, 3, 10, '10', [3, 6, 12, 18]),
  weapon('flamer', 'Flamer', 'Energy', 1, 1, 3, '2', [0, 1, 2, 3]),
  weapon('machine-gun', 'Machine Gun', 'Ballistic', 0.5, 1, 0, '2', [0, 1, 2, 3], 200),
  weapon('ac-2', 'AC/2', 'Ballistic', 6, 1, 1, '2', [4, 8, 16, 24], 45),
  weapon('ac-5', 'AC/5', 'Ballistic', 8, 4, 1, '5', [3, 6, 12, 18], 20),
  weapon('ac-10', 'AC/10', 'Ballistic', 12, 7, 3, '10', [0, 5, 10, 15], 10),
  weapon('ac-20', 'AC/20', 'Ballistic', 14, 10, 7, '20', [0, 3, 6, 9], 5),
  weapon('lrm-5', 'LRM 5', 'Missile', 2, 1, 2, '1/missile', [6, 7, 14, 21], 24),
  weapon('lrm-10', 'LRM 10', 'Missile', 5, 2, 4, '1/missile', [6, 7, 14, 21], 12),
  weapon('lrm-15', 'LRM 15', 'Missile', 7, 3, 5, '1/missile', [6, 7, 14, 21], 8),
  weapon('lrm-20', 'LRM 20', 'Missile', 10, 5, 6, '1/missile', [6, 7, 14, 21], 6),
  weapon('srm-2', 'SRM 2', 'Missile', 1, 1, 2, '2/missile', [0, 3, 6, 9], 50),
  weapon('srm-4', 'SRM 4', 'Missile', 2, 1, 3, '2/missile', [0, 3, 6, 9], 25),
  weapon('srm-6', 'SRM 6', 'Missile', 3, 2, 4, '2/missile', [0, 3, 6, 9], 15),
];

export const AMMO: readonly Equipment[] = WEAPONS.filter((w) => w.ammoPerTon).map((w) => ({
  id: `ammo-${w.id}`,
  name: `${w.name} Ammo (${w.ammoPerTon})`,
  category: 'Ammo' as const,
  tons: 1,
  slots: 1,
  heat: 0,
  ammoFor: w.id,
  isWeapon: false,
}));

export const HEAT_SINK_ID = 'heat-sink';
export const JUMP_JET_ID = 'jump-jet';

export const OTHER_EQUIPMENT: readonly Equipment[] = [
  { id: HEAT_SINK_ID, name: 'Heat Sink', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, managed: true },
  {
    id: JUMP_JET_ID, name: 'Jump Jet', category: 'Other', tons: 0, slots: 1, heat: 0,
    isWeapon: false, managed: true, variableWeight: 'jumpJet',
    allowedLocations: ['CT', 'LT', 'RT', 'LL', 'RL'],
  },
];

export const ALL_EQUIPMENT: readonly Equipment[] = [...WEAPONS, ...AMMO, ...OTHER_EQUIPMENT];

const BY_ID = new Map(ALL_EQUIPMENT.map((e) => [e.id, e]));

export function getEquipment(id: string): Equipment | undefined {
  return BY_ID.get(id);
}

export function allowedLocations(eq: Equipment): readonly Location[] {
  return eq.allowedLocations ?? LOCATIONS;
}

/** Only weapons in a torso location may be mounted rear-facing. */
export function canRearMount(eq: Equipment, location: Location | null): boolean {
  return eq.isWeapon && (location === 'CT' || location === 'LT' || location === 'RT');
}
