import type { ArmorAllocation, Location, MechDesign, MountedItem, TechBase } from '../rules/types';
import type { EraId } from '../rules/eras';
import { newUid } from '../rules/edit';

/**
 * Sample designs.
 *
 * 3025: canon designs. Tonnage, engine, heat sinks, armor totals and
 * weapon loadouts follow the published designs; critical-slot placement
 * and per-location armor are legal but may differ in detail from the
 * official record sheets.
 *
 * 3050 / 3062: original MechForger designs (not canon mechs) that exercise
 * the Standard-level construction options.
 */

type Mount = [equipmentId: string, location: Location, count?: number, rear?: boolean];

function mounts(list: Mount[], pod = false): MountedItem[] {
  return list.flatMap(([equipmentId, location, count = 1, rear]) =>
    Array.from({ length: count }, () => {
      const item: MountedItem = { uid: newUid(), equipmentId, location };
      if (rear) item.rear = true;
      if (pod) item.pod = true;
      return item;
    }),
  );
}

/** Defaults for options not used by a sample. */
const PLAIN = {
  gyroType: 'standard', cockpitType: 'standard', myomer: 'standard', mixedTech: false, omni: null,
} as const;

function armor(
  hd: number, ct: number, ctr: number, side: number, sider: number, arm: number, leg: number,
): ArmorAllocation {
  return { HD: hd, CT: ct, CTR: ctr, LT: side, LTR: sider, RT: side, RTR: sider, LA: arm, RA: arm, LL: leg, RL: leg };
}

const FULL_ARMS = { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } };

const INTRO_3025 = {
  era: '3025', techBase: 'IS', structureType: 'standard', engineType: 'standard',
  heatSinkType: 'single', armorType: 'standard', ...PLAIN,
} as const;

export interface Preset {
  key: string;
  era: EraId;
  techBase: TechBase;
  /** Canon design (true) or an original MechForger sample. */
  canon: boolean;
  build: () => MechDesign;
}

export const PRESETS: Preset[] = [
  {
    key: 'Locust LCT-1V', era: '3025', techBase: 'IS', canon: true,
    build: () => ({
      schemaVersion: 1, ...INTRO_3025, chassis: 'Locust', model: 'LCT-1V', tonnage: 20, walkMP: 8,
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
    key: 'Wasp WSP-1A', era: '3025', techBase: 'IS', canon: true,
    build: () => ({
      schemaVersion: 1, ...INTRO_3025, chassis: 'Wasp', model: 'WSP-1A', tonnage: 20, walkMP: 6,
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
    key: 'Hunchback HBK-4G', era: '3025', techBase: 'IS', canon: true,
    build: () => ({
      schemaVersion: 1, ...INTRO_3025, chassis: 'Hunchback', model: 'HBK-4G', tonnage: 50, walkMP: 4,
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
    key: 'Atlas AS7-D', era: '3025', techBase: 'IS', canon: true,
    build: () => ({
      schemaVersion: 1, ...INTRO_3025, chassis: 'Atlas', model: 'AS7-D', tonnage: 100, walkMP: 3,
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
  {
    key: 'Warden WDN-1X (sample)', era: '3050', techBase: 'IS', canon: false,
    build: () => ({
      schemaVersion: 1, era: '3050', techBase: 'IS', structureType: 'endo-steel', engineType: 'xl',
      heatSinkType: 'double', armorType: 'standard', ...PLAIN,
      chassis: 'Warden', model: 'WDN-1X', tonnage: 55, walkMP: 5,
      engineHeatSinks: 11,
      armor: { HD: 9, CT: 26, CTR: 8, LT: 20, LTR: 6, RT: 20, RTR: 6, LA: 17, RA: 17, LL: 24, RL: 23 },
      actuators: FULL_ARMS,
      equipment: mounts([
        ['er-ppc', 'RA'],
        ['lb-10x', 'LT'],
        ['ammo-lb-10x', 'LT'],
        ['case', 'LT'],
        ['er-medium-laser', 'LA'],
        ['er-medium-laser', 'RT'],
        ['er-medium-laser', 'CT'],
        ['double-heat-sink', 'RT'],
        ['jump-jet', 'LT'],
        ['jump-jet', 'RT'],
        ['jump-jet', 'CT'],
        ['jump-jet', 'LL'],
        ['jump-jet', 'RL'],
        ['endo-steel', 'HD'],
        ['endo-steel', 'RT', 4],
        ['endo-steel', 'RA', 5],
        ['endo-steel', 'LA', 4],
      ]),
    }),
  },
  {
    key: 'Grimfang OmniMech (sample)', era: '3050', techBase: 'Clan', canon: false,
    build: () => ({
      schemaVersion: 1, era: '3050', techBase: 'Clan', structureType: 'endo-steel', engineType: 'xl',
      heatSinkType: 'double', armorType: 'ferro-fibrous', myomer: 'standard', mixedTech: false,
      gyroType: 'standard', cockpitType: 'standard',
      chassis: 'Grimfang', model: '', tonnage: 65, walkMP: 5,
      engineHeatSinks: 13,
      armor: armor(9, 31, 11, 22, 8, 20, 30),
      actuators: FULL_ARMS,
      // Fixed base chassis: Endo Steel and Ferro-Fibrous slots. Everything else is podded.
      equipment: [
        ...mounts([
          ['endo-steel', 'RA', 3],
          ['endo-steel', 'LA', 2],
          ['endo-steel', 'LT'],
          ['endo-steel', 'LL'],
          ['ferro-fibrous', 'RA', 2],
          ['ferro-fibrous', 'LA', 2],
          ['ferro-fibrous', 'RT', 2],
          ['ferro-fibrous', 'HD'],
        ]),
        // Prime configuration (active)
        ...mounts([
          ['clan-uac-5', 'RA'],
          ['clan-er-large-laser', 'LA'],
          ['clan-medium-pulse-laser', 'LA'],
          ['clan-er-medium-laser', 'CT', 2],
          ['clan-lrm-15', 'LT'],
          ['ammo-clan-lrm-15', 'LT'],
          ['clan-streak-srm-6', 'RT'],
          ['ammo-clan-streak-srm-6', 'RT'],
          ['ammo-clan-uac-5', 'RT', 2],
          ['clan-double-heat-sink', 'LT', 2],
          ['clan-double-heat-sink', 'RT'],
        ], true),
      ],
      omni: {
        active: 0,
        configurations: [
          { name: 'Prime', pod: [] },
          {
            name: 'A',
            pod: mounts([
              ['clan-gauss-rifle', 'RT'],
              ['ammo-clan-gauss-rifle', 'RT', 2],
              ['clan-atm-9', 'LT'],
              ['ammo-clan-atm-9', 'LT', 2],
              ['clan-targeting-computer', 'LT'],
              ['clan-er-medium-laser', 'CT', 2],
              ['clan-double-heat-sink', 'LA'],
              ['clan-er-small-laser', 'LA'],
              ['clan-double-heat-sink', 'RA'],
            ], true),
          },
        ],
      },
    }),
  },
  {
    key: 'Bulwark BWK-2X (sample)', era: '3062', techBase: 'IS', canon: false,
    build: () => ({
      schemaVersion: 1, era: '3062', techBase: 'IS', structureType: 'endo-steel', engineType: 'light',
      heatSinkType: 'double', armorType: 'standard', ...PLAIN, gyroType: 'xl',
      chassis: 'Bulwark', model: 'BWK-2X', tonnage: 60, walkMP: 5,
      engineHeatSinks: 12,
      armor: { HD: 9, CT: 30, CTR: 9, LT: 21, LTR: 6, RT: 21, RTR: 6, LA: 19, RA: 19, LL: 26, RL: 26 },
      actuators: FULL_ARMS,
      equipment: mounts([
        ['rac-5', 'RA'],
        ['endo-steel', 'RA', 2],
        ['er-large-laser', 'LA'],
        ['er-medium-laser', 'LA'],
        ['endo-steel', 'LA', 5],
        ['ammo-rac-5', 'RT', 2],
        ['targeting-computer', 'RT'],
        ['er-medium-laser', 'RT'],
        ['endo-steel', 'RT', 2],
        ['endo-steel', 'LT', 4],
        ['endo-steel', 'HD'],
      ]),
    }),
  },
  {
    key: 'Emberclaw Prime (sample)', era: '3062', techBase: 'Clan', canon: false,
    build: () => ({
      schemaVersion: 1, era: '3062', techBase: 'Clan', structureType: 'endo-steel', engineType: 'xl',
      heatSinkType: 'double', armorType: 'ferro-fibrous', ...PLAIN,
      chassis: 'Emberclaw', model: 'Prime', tonnage: 35, walkMP: 7,
      engineHeatSinks: 9,
      armor: { HD: 9, CT: 16, CTR: 5, LT: 12, LTR: 3, RT: 12, RTR: 3, LA: 12, RA: 11, LL: 16, RL: 16 },
      actuators: FULL_ARMS,
      equipment: mounts([
        ['clan-medium-heavy-laser', 'LA'],
        ['clan-er-micro-laser', 'LA'],
        ['clan-micro-pulse-laser', 'LA'],
        ['endo-steel', 'LA', 2],
        ['ferro-fibrous', 'LA', 2],
        ['clan-medium-heavy-laser', 'RA'],
        ['clan-er-micro-laser', 'RA'],
        ['clan-micro-pulse-laser', 'RA'],
        ['endo-steel', 'RA', 2],
        ['ferro-fibrous', 'RA', 2],
        ['jump-jet', 'LT'],
        ['clan-double-heat-sink', 'LT', 2],
        ['clan-heavy-machine-gun', 'LT'],
        ['ammo-clan-heavy-machine-gun-half', 'LT'],
        ['endo-steel', 'LT', 2],
        ['ferro-fibrous', 'LT'],
        ['jump-jet', 'RT'],
        ['clan-double-heat-sink', 'RT', 2],
        ['clan-heavy-machine-gun', 'RT'],
        ['clan-streak-srm-4', 'RT'],
        ['ammo-clan-streak-srm-4', 'RT'],
        ['clan-light-tag', 'RT'],
        ['endo-steel', 'RT'],
        ['jump-jet', 'CT'],
        ['ferro-fibrous', 'CT'],
        ['ferro-fibrous', 'HD'],
        ['jump-jet', 'LL', 2],
        ['jump-jet', 'RL', 2],
      ]),
    }),
  },
];
