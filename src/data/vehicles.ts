import type { EraId } from '../rules/eras';
import type { TechBase } from '../rules/types';
import type { VehicleDesign, VehicleItem, VehicleLocation } from '../rules/vehicle';
import { newVehicleUid } from '../rules/vehicle';

/**
 * Original MechForger sample vehicles (not canon designs), one per motive type,
 * each built to exactly its tonnage. Also used as test fixtures.
 */

type Mount = [equipmentId: string, location: VehicleLocation, count?: number];

const items = (list: Mount[]): VehicleItem[] =>
  list.flatMap(([equipmentId, location, count = 1]) =>
    Array.from({ length: count }, () => ({ uid: newVehicleUid(), equipmentId, location })),
  );

const BASE = {
  schemaVersion: 1, unitType: 'vehicle', mixedTech: false, structureType: 'standard', armorType: 'standard',
} as const;

export interface VehiclePreset {
  key: string;
  era: EraId;
  techBase: TechBase;
  build: () => VehicleDesign;
}

export const VEHICLE_PRESETS: VehiclePreset[] = [
  {
    key: 'Bastion Tank (tracked)', era: '3025', techBase: 'IS',
    build: () => ({
      ...BASE, era: '3025', techBase: 'IS', chassis: 'Bastion', model: 'Tank',
      motive: 'tracked', tonnage: 50, cruiseMP: 4, engineType: 'ice', turret: true, heatSinks: 0,
      armor: { FR: 32, LS: 24, RS: 24, RR: 16, TU: 16, RO: 0 },
      equipment: items([['ac-10', 'TU'], ['ammo-ac-10', 'BD', 2], ['lrm-5', 'FR'], ['ammo-lrm-5', 'BD']]),
    }),
  },
  {
    key: 'Courier Armored Car (wheeled)', era: '3025', techBase: 'IS',
    build: () => ({
      ...BASE, era: '3025', techBase: 'IS', chassis: 'Courier', model: 'Armored Car',
      motive: 'wheeled', tonnage: 30, cruiseMP: 6, engineType: 'ice', turret: true, heatSinks: 0,
      armor: { FR: 30, LS: 22, RS: 22, RR: 16, TU: 22, RO: 0 },
      equipment: items([
        ['srm-6', 'TU'], ['ammo-srm-6', 'BD'], ['machine-gun', 'FR', 2], ['ammo-machine-gun', 'BD'],
      ]),
    }),
  },
  {
    key: 'Skimmer Hovercraft (hover)', era: '3025', techBase: 'IS',
    build: () => ({
      ...BASE, era: '3025', techBase: 'IS', chassis: 'Skimmer', model: 'Hovercraft',
      motive: 'hover', tonnage: 20, cruiseMP: 8, engineType: 'standard', turret: false, heatSinks: 10,
      armor: { FR: 28, LS: 20, RS: 20, RR: 20, TU: 0, RO: 0 },
      equipment: items([
        ['medium-laser', 'FR', 2], ['small-laser', 'FR'], ['srm-4', 'FR'], ['ammo-srm-4', 'BD'],
      ]),
    }),
  },
  {
    key: 'Gadfly VTOL (VTOL)', era: '3025', techBase: 'IS',
    build: () => ({
      ...BASE, era: '3025', techBase: 'IS', chassis: 'Gadfly', model: 'VTOL',
      motive: 'vtol', tonnage: 20, cruiseMP: 10, engineType: 'standard', turret: false, heatSinks: 10,
      armor: { FR: 28, LS: 20, RS: 20, RR: 18, TU: 0, RO: 2 },
      equipment: items([['medium-laser', 'FR'], ['lrm-5', 'FR'], ['ammo-lrm-5', 'BD']]),
    }),
  },
  {
    key: 'Harbor Guard Patrol Boat (naval)', era: '3025', techBase: 'IS',
    build: () => ({
      ...BASE, era: '3025', techBase: 'IS', chassis: 'Harbor Guard', model: 'Patrol Boat',
      motive: 'naval', tonnage: 60, cruiseMP: 5, engineType: 'standard', turret: true, heatSinks: 10,
      armor: { FR: 40, LS: 32, RS: 32, RR: 24, TU: 32, RO: 0 },
      equipment: items([
        ['lrm-15', 'TU'], ['ammo-lrm-15', 'BD', 2], ['medium-laser', 'FR', 2],
        ['srm-6', 'FR'], ['ammo-srm-6', 'BD'], ['lrm-5', 'RR'], ['ammo-lrm-5', 'BD'],
      ]),
    }),
  },
  {
    key: 'Hellforge Tank (Clan, tracked)', era: '3050', techBase: 'Clan',
    build: () => ({
      ...BASE, structureType: 'endo-steel', armorType: 'ferro-fibrous',
      era: '3050', techBase: 'Clan', chassis: 'Hellforge', model: 'Tank',
      motive: 'tracked', tonnage: 40, cruiseMP: 5, engineType: 'xl', turret: true, heatSinks: 10,
      armor: { FR: 45, LS: 30, RS: 30, RR: 18, TU: 30, RO: 0 },
      equipment: items([
        ['clan-lb-10x', 'TU'], ['ammo-clan-lb-10x', 'BD'],
        ['clan-srm-6', 'FR'], ['ammo-clan-srm-6', 'BD'],
        ['clan-er-medium-laser', 'FR'], ['clan-er-small-laser', 'FR'],
        ['clan-streak-srm-4', 'FR'], ['ammo-clan-streak-srm-4', 'BD'],
        ['clan-lrm-5', 'FR'], ['ammo-clan-lrm-5', 'BD'],
      ]),
    }),
  },
];
