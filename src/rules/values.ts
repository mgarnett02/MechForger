/**
 * Battle Value (BV 2.0) and C-bill cost for each item, from the TechManual
 * equipment tables. Introductory-level values are verified against canon
 * designs in the tests; later equipment uses the published table values as
 * best known and should be treated as approximate.
 */

export interface ItemValue {
  bv: number;
  cost: number;
  /** BV and C-bill cost per full ton of ammunition, for weapons that use it. */
  ammoBV?: number;
  ammoCost?: number;
}

const v = (bv: number, cost: number, ammoBV?: number, ammoCost?: number): ItemValue => ({ bv, cost, ammoBV, ammoCost });

export const ITEM_VALUES: Record<string, ItemValue> = {
  // Introductory Inner Sphere
  'small-laser': v(9, 11250),
  'medium-laser': v(46, 40000),
  'large-laser': v(123, 100000),
  ppc: v(176, 200000),
  flamer: v(6, 7500),
  'machine-gun': v(5, 5000, 1, 1000),
  'ac-2': v(37, 75000, 5, 1000),
  'ac-5': v(70, 125000, 9, 4500),
  'ac-10': v(123, 200000, 15, 6000),
  'ac-20': v(178, 300000, 22, 10000),
  'lrm-5': v(45, 30000, 6, 30000),
  'lrm-10': v(90, 100000, 11, 30000),
  'lrm-15': v(136, 175000, 17, 30000),
  'lrm-20': v(181, 250000, 23, 30000),
  'srm-2': v(21, 10000, 3, 27000),
  'srm-4': v(39, 60000, 5, 27000),
  'srm-6': v(59, 80000, 7, 27000),

  // Inner Sphere, Clan Invasion era
  'er-small-laser': v(17, 11250),
  'er-medium-laser': v(62, 80000),
  'er-large-laser': v(163, 200000),
  'small-pulse-laser': v(12, 16000),
  'medium-pulse-laser': v(48, 60000),
  'large-pulse-laser': v(119, 175000),
  'er-ppc': v(229, 300000),
  'gauss-rifle': v(320, 300000, 40, 20000),
  'lb-2x': v(42, 150000, 5, 2000),
  'lb-5x': v(83, 250000, 10, 9000),
  'lb-10x': v(148, 400000, 19, 12000),
  'lb-20x': v(237, 600000, 30, 20000),
  'uac-2': v(56, 120000, 7, 1000),
  'uac-5': v(112, 200000, 14, 9000),
  'uac-10': v(210, 320000, 26, 12000),
  'uac-20': v(281, 480000, 35, 20000),
  'streak-srm-2': v(30, 15000, 4, 54000),
  'streak-srm-4': v(59, 90000, 7, 54000),
  'streak-srm-6': v(89, 120000, 11, 54000),
  'mrm-10': v(56, 50000, 7, 5000),
  'mrm-20': v(112, 125000, 14, 5000),
  'mrm-30': v(168, 225000, 21, 5000),
  'mrm-40': v(224, 350000, 28, 5000),
  narc: v(30, 100000, 0, 6000),
  ams: v(32, 100000, 11, 2000),
  'light-gauss-rifle': v(159, 275000, 20, 20000),
  'heavy-gauss-rifle': v(346, 500000, 43, 20000),
  tag: v(0, 50000),

  // Inner Sphere, Civil War and Jihad
  'rac-2': v(118, 175000, 15, 3000),
  'rac-5': v(247, 275000, 31, 12000),
  inarc: v(75, 250000, 0, 7500),
  'light-ppc': v(88, 150000),
  'heavy-ppc': v(317, 250000),
  'snub-nose-ppc': v(165, 300000),
  'er-flamer': v(16, 15000),
  'light-machine-gun': v(5, 5000, 1, 500),
  'heavy-machine-gun': v(6, 7500, 1, 1000),
  magshot: v(15, 8500, 2, 1000),
  'plasma-rifle': v(210, 260000, 26, 10000),
  'mml-3': v(29, 45000),
  'mml-5': v(45, 75000),
  'mml-7': v(67, 105000),
  'mml-9': v(86, 125000),
  'thunderbolt-5': v(64, 50000, 8, 50000),
  'thunderbolt-10': v(127, 175000, 16, 50000),
  'thunderbolt-15': v(229, 325000, 29, 50000),
  'thunderbolt-20': v(305, 450000, 38, 50000),

  // Clan
  'clan-er-small-laser': v(31, 11250),
  'clan-er-medium-laser': v(108, 80000),
  'clan-er-large-laser': v(248, 200000),
  'clan-small-pulse-laser': v(24, 16000),
  'clan-medium-pulse-laser': v(111, 60000),
  'clan-large-pulse-laser': v(265, 175000),
  'clan-er-ppc': v(412, 300000),
  'clan-flamer': v(6, 7500),
  'clan-er-flamer': v(16, 15000),
  'clan-machine-gun': v(5, 5000, 1, 1000),
  'clan-light-machine-gun': v(5, 5000, 1, 500),
  'clan-heavy-machine-gun': v(6, 7500, 1, 1000),
  'clan-gauss-rifle': v(320, 300000, 40, 20000),
  'clan-lb-2x': v(47, 150000, 6, 2000),
  'clan-lb-5x': v(93, 250000, 12, 9000),
  'clan-lb-10x': v(148, 400000, 19, 12000),
  'clan-lb-20x': v(237, 600000, 30, 20000),
  'clan-uac-2': v(62, 120000, 8, 1000),
  'clan-uac-5': v(122, 200000, 15, 9000),
  'clan-uac-10': v(210, 320000, 26, 12000),
  'clan-uac-20': v(335, 480000, 42, 20000),
  'clan-lrm-5': v(55, 30000, 7, 30000),
  'clan-lrm-10': v(109, 100000, 14, 30000),
  'clan-lrm-15': v(164, 175000, 21, 30000),
  'clan-lrm-20': v(220, 250000, 27, 30000),
  'clan-srm-2': v(21, 10000, 3, 27000),
  'clan-srm-4': v(39, 60000, 5, 27000),
  'clan-srm-6': v(59, 80000, 7, 27000),
  'clan-streak-srm-2': v(40, 15000, 5, 54000),
  'clan-streak-srm-4': v(79, 60000, 10, 54000),
  'clan-streak-srm-6': v(118, 120000, 15, 54000),
  'clan-atm-3': v(53, 50000, 14, 75000),
  'clan-atm-6': v(105, 125000, 26, 75000),
  'clan-atm-9': v(147, 225000, 36, 75000),
  'clan-atm-12': v(212, 350000, 52, 75000),
  'clan-narc': v(30, 100000, 0, 6000),
  'clan-ams': v(32, 100000, 22, 2000),
  'clan-er-micro-laser': v(7, 10000),
  'clan-micro-pulse-laser': v(12, 12500),
  'clan-small-heavy-laser': v(15, 20000),
  'clan-medium-heavy-laser': v(76, 100000),
  'clan-large-heavy-laser': v(244, 250000),
  'clan-tag': v(0, 50000),
  'clan-light-tag': v(0, 40000),
  'clan-plasma-cannon': v(170, 320000, 21, 12000),
  'clan-ap-gauss-rifle': v(21, 10000, 3, 3000),
  'clan-hag-20': v(267, 400000, 33, 30000),
  'clan-hag-30': v(401, 500000, 50, 30000),
  'clan-hag-40': v(535, 600000, 67, 30000),

  // Equipment (variable costs such as MASC and targeting computers are computed separately)
  case: v(0, 50000),
  'artemis-iv': v(0, 100000),
  'clan-artemis-iv': v(0, 100000),
  'c3-master': v(0, 1500000),
  'c3-slave': v(0, 250000),
  'improved-c3': v(0, 750000),
  'beagle-active-probe': v(10, 200000),
  'guardian-ecm': v(61, 200000),
  'clan-active-probe': v(12, 200000),
  'clan-ecm': v(61, 200000),
  'bomb-bay': v(0, 5000),
  'lam-fuel-tank': v(0, 200),

  // Utility equipment (vehicles only)
  searchlight: v(0, 2000), 'searchlight-handheld': v(0, 500), 'lift-hoist': v(0, 50000),
  'paramedic-equipment': v(0, 7500), 'cargo-container': v(0, 0), 'communications-equipment': v(0, 10000),
  bulldozer: v(0, 50000), backhoe: v(0, 50000), chainsaw: v(0, 100000), 'dual-saw': v(0, 100000),
  'rock-cutter': v(0, 100000), combine: v(0, 75000), 'salvage-arm': v(0, 50000), 'spot-welder': v(0, 75000),
  'pile-driver': v(0, 100000), 'field-kitchen': v(0, 25000), 'mobile-field-base': v(0, 150000),
  'lifeboat-maritime': v(0, 5000), 'lifeboat-atmospheric': v(0, 6000), 'refueling-drogue': v(0, 25000),
  'mast-mount': v(0, 50000), 'trailer-hitch': v(0, 0), 'mine-dispenser': v(0, 20000), 'mine-sweeper': v(0, 40000),
  'remote-sensor-dispenser': v(0, 51000), manipulator: v(0, 7500), 'recon-camera': v(0, 20000),
};

/** MML ammo values: [LRM ammo BV, SRM ammo BV] per ton; costs as LRM / SRM ammo. */
export const MML_AMMO_BV: Record<string, [number, number]> = {
  'mml-3': [4, 4], 'mml-5': [6, 6], 'mml-7': [8, 8], 'mml-9': [11, 11],
};

/** Equipment that counts towards defensive rather than offensive BV. */
export const DEFENSIVE_IDS = new Set([
  'ams', 'clan-ams', 'guardian-ecm', 'clan-ecm', 'beagle-active-probe', 'clan-active-probe',
]);

/** Gauss-type weapons: their ammo does not explode, but the weapon itself does. */
export function isGaussType(weaponId: string): boolean {
  return /gauss|magshot|hag-/.test(weaponId);
}
