import type { ArmorAllocation, Location, MechDesign, MountedItem } from '../rules/types';
import { newUid } from '../rules/edit';

/**
 * Sample 3025-era designs. Tonnage, engine, heat sinks, armor totals and
 * weapon loadouts follow the published designs; critical-slot placement
 * and per-location armor are legal but may differ in detail from the
 * official record sheets.
 */

type Mount = [equipmentId: string, location: Location, count?: number, rear?: boolean];

function mounts(list: Mount[]): MountedItem[] {
  return list.flatMap(([equipmentId, location, count = 1, rear]) =>
    Array.from({ length: count }, () => ({ uid: newUid(), equipmentId, location, rear: rear || undefined })),
  );
}

function armor(
  hd: number, ct: number, ctr: number, side: number, sider: number, arm: number, leg: number,
): ArmorAllocation {
  return { HD: hd, CT: ct, CTR: ctr, LT: side, LTR: sider, RT: side, RTR: sider, LA: arm, RA: arm, LL: leg, RL: leg };
}

const FULL_ARMS = { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } };

export interface Preset {
  key: string;
  build: () => MechDesign;
}

export const PRESETS: Preset[] = [
  {
    key: 'Locust LCT-1V',
    build: () => ({
      schemaVersion: 1, chassis: 'Locust', model: 'LCT-1V', tonnage: 20, walkMP: 8,
      engineHeatSinks: 6,
      armor: armor(8, 10, 2, 8, 2, 4, 8),
      actuators: { LA: { lowerArm: false, hand: false }, RA: { lowerArm: false, hand: false } },
      equipment: mounts([
        ['medium-laser', 'CT'],
        ['ammo-machine-gun', 'CT'],
        ['machine-gun', 'LA'],
        ['machine-gun', 'RA'],
        ['heat-sink', 'LT', 2],
        ['heat-sink', 'RT', 2],
      ]),
    }),
  },
  {
    key: 'Wasp WSP-1A',
    build: () => ({
      schemaVersion: 1, chassis: 'Wasp', model: 'WSP-1A', tonnage: 20, walkMP: 6,
      engineHeatSinks: 4,
      armor: armor(5, 7, 2, 6, 2, 4, 5),
      actuators: FULL_ARMS,
      equipment: mounts([
        ['medium-laser', 'RA'],
        ['srm-2', 'LT'],
        ['ammo-srm-2', 'LT'],
        ['jump-jet', 'LL', 2],
        ['jump-jet', 'RL', 2],
        ['jump-jet', 'LT'],
        ['jump-jet', 'RT'],
        ['heat-sink', 'LT', 2],
        ['heat-sink', 'RT', 4],
      ]),
    }),
  },
  {
    key: 'Hunchback HBK-4G',
    build: () => ({
      schemaVersion: 1, chassis: 'Hunchback', model: 'HBK-4G', tonnage: 50, walkMP: 4,
      engineHeatSinks: 8,
      armor: armor(9, 26, 5, 20, 4, 16, 20),
      actuators: FULL_ARMS,
      equipment: mounts([
        ['ac-20', 'RT'],
        ['ammo-ac-20', 'RT', 2],
        ['medium-laser', 'LA'],
        ['medium-laser', 'RA'],
        ['small-laser', 'HD'],
        ['heat-sink', 'LT', 3],
        ['heat-sink', 'LL'],
        ['heat-sink', 'RL'],
      ]),
    }),
  },
  {
    key: 'Atlas AS7-D',
    build: () => ({
      schemaVersion: 1, chassis: 'Atlas', model: 'AS7-D', tonnage: 100, walkMP: 3,
      engineHeatSinks: 12,
      armor: armor(9, 47, 14, 32, 10, 34, 41),
      actuators: FULL_ARMS,
      equipment: mounts([
        ['ac-20', 'RT'],
        ['ammo-ac-20', 'RT', 2],
        ['lrm-20', 'LT'],
        ['ammo-lrm-20', 'LT', 2],
        ['srm-6', 'LT'],
        ['ammo-srm-6', 'LT'],
        ['medium-laser', 'LA'],
        ['medium-laser', 'RA'],
        ['medium-laser', 'CT', 2, true],
        ['heat-sink', 'LT', 2],
        ['heat-sink', 'LA', 3],
        ['heat-sink', 'RA', 3],
      ]),
    }),
  },
];
