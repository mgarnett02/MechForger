import type { Location, MechDesign, TechBase, MechConfig } from './types';
import { LOCATIONS } from './types';
import type { EraId } from './eras';
import { isAvailableIn } from './eras';
import { engineWeight, jumpJetWeight, mascWeight } from './tables';

export type EquipmentCategory = 'Energy' | 'Ballistic' | 'Missile' | 'Ammo' | 'Physical' | 'Capital' | 'Other' | 'Utility';

/** Large-craft weapon classes: which vessels may mount them. */
export type CapitalClass = 'capital' | 'sub-capital' | 'capital-missile' | 'screen' | 'mass-driver';

/** Physical (melee) weapons. Their weight, slots, damage, BV and cost mostly scale with the mech's tonnage. */
export type MeleeKind = 'hatchet' | 'sword' | 'mace' | 'claw' | 'retractable-blade' | 'chain-whip' | 'talons' | 'spikes';

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
  /** Weight in tons (variable-weight items use itemWeight() instead). */
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
  /** Weight (and for MASC / targeting computers, slots) depends on the mech. */
  variableWeight?: 'jumpJet' | 'improvedJumpJet' | 'masc' | 'supercharger' | 'targetingComputer';
  /** LRM/SRM launchers that can be linked to an Artemis IV fire-control system. */
  artemisCapable?: boolean;
  /** Ammo bins: Artemis IV-capable ammunition. */
  artemisAmmo?: boolean;
  /** Can only be fixed equipment on an OmniMech (never pod-mounted). */
  fixedOnly?: boolean;
  /** Added/removed through chassis controls rather than the equipment catalog. */
  managed?: boolean;
  /** Physical (melee) weapon. */
  melee?: MeleeKind;
  /** Arm-mounted only (so not available to quads, whose front legs share the arm locations). */
  armOnly?: boolean;
  /** Land-Air 'Mech equipment only. */
  lamOnly?: boolean;
  /** Artillery: tube or missile artillery (indirect fire, range in mapsheets) or an artillery cannon. */
  artillery?: boolean;
  /** Explodes when hit (counts like ammunition for Battle Value). */
  explosive?: boolean;
  /** Explosive, but only −1 BV per slot (improved heavy lasers, PPC capacitors). */
  explosiveLow?: boolean;
  /** Capital-scale and sub-capital weapons (and their ammunition). */
  capitalClass?: CapitalClass;
  /** Capital ammunition is counted per shot: `tons` is the weight of one shot, with this BV and cost. */
  shotBV?: number;
  shotCost?: number;
  /** Which tech base can mount it ('Both' = generic, e.g. jump jets). */
  techBase: TechBase | 'Both';
  /** First era in which the item is available. */
  firstEra: EraId;
}

interface Avail {
  techBase: TechBase | 'Both';
  firstEra: EraId;
}
const IS_3025: Avail = { techBase: 'IS', firstEra: '3025' };
const IS_3050: Avail = { techBase: 'IS', firstEra: '3050' };
const CLAN_3050: Avail = { techBase: 'Clan', firstEra: '3050' };
const IS_3062: Avail = { techBase: 'IS', firstEra: '3062' };
const CLAN_3062: Avail = { techBase: 'Clan', firstEra: '3062' };
const IS_3068: Avail = { techBase: 'IS', firstEra: '3068' };
const CLAN_3068: Avail = { techBase: 'Clan', firstEra: '3068' };
const ANY_3025: Avail = { techBase: 'Both', firstEra: '3025' };
const ANY_3068: Avail = { techBase: 'Both', firstEra: '3068' };
const ANY_3050: Avail = { techBase: 'Both', firstEra: '3050' };
const IS_3081: Avail = { techBase: 'IS', firstEra: '3081' };
const CLAN_3081: Avail = { techBase: 'Clan', firstEra: '3081' };

const TORSO: readonly Location[] = ['CT', 'LT', 'RT'];
const NOT_HEAD: readonly Location[] = ['CT', 'LT', 'RT', 'LA', 'RA', 'LL', 'RL'];

function weapon(
  avail: Avail,
  id: string,
  name: string,
  category: EquipmentCategory,
  tons: number,
  slots: number,
  heat: number,
  damage: string,
  range: [number, number, number, number] | null,
  ammoPerTon?: number,
): Equipment {
  const r = range && { min: range[0], short: range[1], medium: range[2], long: range[3] };
  return {
    id, name, category, tons, slots, heat, damage, ammoPerTon, isWeapon: true,
    ...(r ? { range: r } : {}),
    ...avail,
  };
}

/** Introductory Inner Sphere (3025) weapons. */
const IS_INTRO_WEAPONS: Equipment[] = [
  weapon(IS_3025, 'small-laser', 'Small Laser', 'Energy', 0.5, 1, 1, '3', [0, 1, 2, 3]),
  weapon(IS_3025, 'medium-laser', 'Medium Laser', 'Energy', 1, 1, 3, '5', [0, 3, 6, 9]),
  weapon(IS_3025, 'large-laser', 'Large Laser', 'Energy', 5, 2, 8, '8', [0, 5, 10, 15]),
  weapon(IS_3025, 'ppc', 'PPC', 'Energy', 7, 3, 10, '10', [3, 6, 12, 18]),
  weapon(IS_3025, 'flamer', 'Flamer', 'Energy', 1, 1, 3, '2', [0, 1, 2, 3]),
  weapon(IS_3025, 'machine-gun', 'Machine Gun', 'Ballistic', 0.5, 1, 0, '2', [0, 1, 2, 3], 200),
  weapon(IS_3025, 'ac-2', 'AC/2', 'Ballistic', 6, 1, 1, '2', [4, 8, 16, 24], 45),
  weapon(IS_3025, 'ac-5', 'AC/5', 'Ballistic', 8, 4, 1, '5', [3, 6, 12, 18], 20),
  weapon(IS_3025, 'ac-10', 'AC/10', 'Ballistic', 12, 7, 3, '10', [0, 5, 10, 15], 10),
  weapon(IS_3025, 'ac-20', 'AC/20', 'Ballistic', 14, 10, 7, '20', [0, 3, 6, 9], 5),
  weapon(IS_3025, 'lrm-5', 'LRM 5', 'Missile', 2, 1, 2, '1/missile', [6, 7, 14, 21], 24),
  weapon(IS_3025, 'lrm-10', 'LRM 10', 'Missile', 5, 2, 4, '1/missile', [6, 7, 14, 21], 12),
  weapon(IS_3025, 'lrm-15', 'LRM 15', 'Missile', 7, 3, 5, '1/missile', [6, 7, 14, 21], 8),
  weapon(IS_3025, 'lrm-20', 'LRM 20', 'Missile', 10, 5, 6, '1/missile', [6, 7, 14, 21], 6),
  weapon(IS_3025, 'srm-2', 'SRM 2', 'Missile', 1, 1, 2, '2/missile', [0, 3, 6, 9], 50),
  weapon(IS_3025, 'srm-4', 'SRM 4', 'Missile', 2, 1, 3, '2/missile', [0, 3, 6, 9], 25),
  weapon(IS_3025, 'srm-6', 'SRM 6', 'Missile', 3, 2, 4, '2/missile', [0, 3, 6, 9], 15),
  // Tube and missile artillery: indirect fire, range in mapsheets (Arrow IV 8, Long Tom 30, Sniper 18, Thumper 21).
  { ...weapon(IS_3025, 'arrow-iv', 'Arrow IV', 'Missile', 15, 15, 10, '20 art.', null, 5), artillery: true },
  { ...weapon(ANY_3025, 'long-tom', 'Long Tom', 'Ballistic', 30, 30, 20, '25 art.', null, 5), artillery: true },
  { ...weapon(ANY_3025, 'sniper', 'Sniper', 'Ballistic', 20, 20, 10, '20 art.', null, 10), artillery: true },
  { ...weapon(ANY_3025, 'thumper', 'Thumper', 'Ballistic', 15, 15, 5, '15 art.', null, 20), artillery: true },
];

/** Inner Sphere Standard-level weapons recovered or developed by the Clan Invasion era. */
const IS_3050_WEAPONS: Equipment[] = [
  weapon(IS_3050, 'er-small-laser', 'ER Small Laser', 'Energy', 0.5, 1, 2, '3', [0, 2, 4, 5]),
  weapon(IS_3050, 'er-medium-laser', 'ER Medium Laser', 'Energy', 1, 1, 5, '5', [0, 4, 8, 12]),
  weapon(IS_3050, 'er-large-laser', 'ER Large Laser', 'Energy', 5, 2, 12, '8', [0, 7, 14, 19]),
  weapon(IS_3050, 'small-pulse-laser', 'Small Pulse Laser', 'Energy', 1, 1, 2, '3', [0, 1, 2, 3]),
  weapon(IS_3050, 'medium-pulse-laser', 'Medium Pulse Laser', 'Energy', 2, 1, 4, '6', [0, 2, 4, 6]),
  weapon(IS_3050, 'large-pulse-laser', 'Large Pulse Laser', 'Energy', 7, 2, 10, '9', [0, 3, 7, 10]),
  weapon(IS_3050, 'er-ppc', 'ER PPC', 'Energy', 7, 3, 15, '10', [0, 7, 14, 23]),
  weapon(IS_3050, 'gauss-rifle', 'Gauss Rifle', 'Ballistic', 15, 7, 1, '15', [2, 7, 15, 22], 8),
  weapon(IS_3050, 'lb-2x', 'LB 2-X AC', 'Ballistic', 6, 4, 1, '2 (cluster)', [4, 9, 18, 27], 45),
  weapon(IS_3050, 'lb-5x', 'LB 5-X AC', 'Ballistic', 8, 5, 1, '5 (cluster)', [3, 7, 14, 21], 20),
  weapon(IS_3050, 'lb-10x', 'LB 10-X AC', 'Ballistic', 11, 6, 2, '10 (cluster)', [0, 6, 12, 18], 10),
  weapon(IS_3050, 'lb-20x', 'LB 20-X AC', 'Ballistic', 14, 11, 6, '20 (cluster)', [0, 4, 8, 12], 5),
  weapon(IS_3050, 'uac-2', 'Ultra AC/2', 'Ballistic', 7, 3, 1, '2 (×2)', [3, 8, 17, 25], 45),
  weapon(IS_3050, 'uac-5', 'Ultra AC/5', 'Ballistic', 9, 5, 1, '5 (×2)', [2, 6, 13, 20], 20),
  weapon(IS_3050, 'uac-10', 'Ultra AC/10', 'Ballistic', 13, 7, 4, '10 (×2)', [0, 6, 12, 18], 10),
  weapon(IS_3050, 'uac-20', 'Ultra AC/20', 'Ballistic', 15, 10, 8, '20 (×2)', [0, 3, 7, 10], 7),
  weapon(IS_3050, 'streak-srm-2', 'Streak SRM 2', 'Missile', 1.5, 1, 2, '2/missile', [0, 3, 6, 9], 50),
  weapon(IS_3050, 'streak-srm-4', 'Streak SRM 4', 'Missile', 3, 1, 3, '2/missile', [0, 3, 6, 9], 25),
  weapon(IS_3050, 'streak-srm-6', 'Streak SRM 6', 'Missile', 4.5, 2, 4, '2/missile', [0, 3, 6, 9], 15),
  weapon(IS_3050, 'mrm-10', 'MRM 10', 'Missile', 3, 2, 4, '1/missile', [0, 3, 8, 15], 24),
  weapon(IS_3050, 'mrm-20', 'MRM 20', 'Missile', 7, 3, 6, '1/missile', [0, 3, 8, 15], 12),
  weapon(IS_3050, 'mrm-30', 'MRM 30', 'Missile', 10, 5, 10, '1/missile', [0, 3, 8, 15], 8),
  weapon(IS_3050, 'mrm-40', 'MRM 40', 'Missile', 12, 7, 12, '1/missile', [0, 3, 8, 15], 6),
  weapon(IS_3050, 'narc', 'Narc Missile Beacon', 'Missile', 3, 2, 0, 'beacon', [0, 3, 6, 9], 6),
  weapon(IS_3050, 'ams', 'Anti-Missile System', 'Other', 0.5, 1, 1, 'defensive', null, 12),
  // Introduced 3056–3061, so available by the end of the Clan Invasion era.
  weapon(IS_3050, 'light-gauss-rifle', 'Light Gauss Rifle', 'Ballistic', 12, 5, 1, '8', [3, 8, 17, 25], 16),
  weapon(IS_3050, 'heavy-gauss-rifle', 'Heavy Gauss Rifle', 'Ballistic', 18, 11, 2, '25/20/10', [4, 6, 13, 20], 4),
  weapon(IS_3050, 'tag', 'TAG', 'Other', 1, 1, 0, 'designator', [0, 5, 9, 15]),
  // X-Pulse lasers (3057): −2 to hit like other pulse lasers, longer reach, more heat.
  weapon(IS_3050, 'small-x-pulse-laser', 'Small X-Pulse Laser', 'Energy', 1, 1, 3, '3', [0, 2, 4, 5]),
  weapon(IS_3050, 'medium-x-pulse-laser', 'Medium X-Pulse Laser', 'Energy', 2, 1, 6, '6', [0, 3, 6, 9]),
  weapon(IS_3050, 'large-x-pulse-laser', 'Large X-Pulse Laser', 'Energy', 7, 2, 14, '9', [0, 5, 10, 15]),
];

/** Inner Sphere weapons of the Civil War era (3062–3067). */
const IS_3062_WEAPONS: Equipment[] = [
  weapon(IS_3062, 'rac-2', 'Rotary AC/2', 'Ballistic', 8, 3, 1, '2 (×6)', [0, 6, 12, 18], 45),
  weapon(IS_3062, 'rac-5', 'Rotary AC/5', 'Ballistic', 10, 6, 1, '5 (×6)', [0, 5, 10, 15], 20),
  weapon(IS_3062, 'inarc', 'iNarc Launcher', 'Missile', 5, 3, 0, 'beacon', [0, 4, 9, 15], 4),
  // Introduced 3067.
  weapon(IS_3062, 'light-ppc', 'Light PPC', 'Energy', 3, 2, 5, '5', [3, 6, 12, 18]),
  weapon(IS_3062, 'heavy-ppc', 'Heavy PPC', 'Energy', 10, 4, 15, '15', [3, 6, 12, 18]),
  weapon(IS_3062, 'snub-nose-ppc', 'Snub-Nose PPC', 'Energy', 6, 2, 10, '10/8/5', [0, 9, 13, 15]),
  weapon(IS_3062, 'er-flamer', 'ER Flamer', 'Energy', 1, 1, 4, '2', [0, 3, 5, 7]),
  weapon(CLAN_3062, 'clan-er-flamer', 'ER Flamer', 'Energy', 1, 1, 4, '2', [0, 3, 5, 7]),
];

/** Jihad era (3068–3080) weapons. */
const JIHAD_WEAPONS: Equipment[] = [
  weapon(IS_3068, 'light-machine-gun', 'Light Machine Gun', 'Ballistic', 0.5, 1, 0, '1', [0, 2, 4, 6], 200),
  weapon(IS_3068, 'heavy-machine-gun', 'Heavy Machine Gun', 'Ballistic', 1, 1, 0, '3', [0, 1, 2, 0], 100),
  weapon(IS_3068, 'magshot', 'Magshot Gauss Rifle', 'Ballistic', 0.5, 2, 1, '2', [0, 3, 6, 9], 50),
  weapon(IS_3068, 'plasma-rifle', 'Plasma Rifle', 'Energy', 6, 2, 10, '10 + heat', [0, 5, 10, 15], 10),
  // Multi-Missile Launchers fire LRM (shown) or SRM ammunition; ammo is listed separately below.
  weapon(IS_3068, 'mml-3', 'MML 3', 'Missile', 1.5, 2, 2, '1 or 2/missile', [6, 7, 14, 21]),
  weapon(IS_3068, 'mml-5', 'MML 5', 'Missile', 3, 3, 3, '1 or 2/missile', [6, 7, 14, 21]),
  weapon(IS_3068, 'mml-7', 'MML 7', 'Missile', 4.5, 4, 4, '1 or 2/missile', [6, 7, 14, 21]),
  weapon(IS_3068, 'mml-9', 'MML 9', 'Missile', 6, 5, 5, '1 or 2/missile', [6, 7, 14, 21]),
  weapon(IS_3068, 'thunderbolt-5', 'Thunderbolt 5', 'Missile', 3, 1, 3, '5', [5, 6, 12, 18], 12),
  weapon(IS_3068, 'thunderbolt-10', 'Thunderbolt 10', 'Missile', 7, 2, 5, '10', [5, 6, 12, 18], 6),
  weapon(IS_3068, 'thunderbolt-15', 'Thunderbolt 15', 'Missile', 11, 3, 7, '15', [5, 6, 12, 18], 4),
  weapon(IS_3068, 'thunderbolt-20', 'Thunderbolt 20', 'Missile', 15, 5, 8, '20', [5, 6, 12, 18], 3),
  weapon(CLAN_3068, 'clan-plasma-cannon', 'Plasma Cannon', 'Energy', 3, 1, 7, 'heat (2d6)', [0, 6, 12, 18], 10),
  weapon(CLAN_3068, 'clan-ap-gauss-rifle', 'AP Gauss Rifle', 'Ballistic', 0.5, 1, 1, '3', [0, 3, 6, 9], 40),
  weapon(CLAN_3068, 'clan-hag-20', 'Hyper-Assault Gauss 20', 'Ballistic', 10, 6, 4, '20 (cluster)', [2, 8, 16, 24], 6),
  weapon(CLAN_3068, 'clan-hag-30', 'Hyper-Assault Gauss 30', 'Ballistic', 13, 8, 6, '30 (cluster)', [2, 8, 16, 24], 4),
  weapon(CLAN_3068, 'clan-hag-40', 'Hyper-Assault Gauss 40', 'Ballistic', 16, 10, 8, '40 (cluster)', [2, 8, 16, 24], 3),
  // Improved heavy lasers (3069): explosive when critically hit.
  { ...weapon(CLAN_3068, 'clan-small-improved-heavy-laser', 'Improved Heavy Small Laser', 'Energy', 0.5, 1, 3, '6', [0, 1, 2, 3]), explosiveLow: true },
  { ...weapon(CLAN_3068, 'clan-medium-improved-heavy-laser', 'Improved Heavy Medium Laser', 'Energy', 1, 2, 7, '10', [0, 3, 6, 9]), explosiveLow: true },
  { ...weapon(CLAN_3068, 'clan-large-improved-heavy-laser', 'Improved Heavy Large Laser', 'Energy', 4, 3, 18, '16', [0, 5, 10, 15]), explosiveLow: true },
  // Variable Speed Pulse lasers (3070): damage falls with range.
  weapon(IS_3068, 'small-vsp-laser', 'Small VSP Laser', 'Energy', 2, 1, 3, '5/4/3', [0, 2, 4, 6]),
  weapon(IS_3068, 'medium-vsp-laser', 'Medium VSP Laser', 'Energy', 4, 2, 7, '9/7/5', [0, 2, 5, 9]),
  weapon(IS_3068, 'large-vsp-laser', 'Large VSP Laser', 'Energy', 9, 4, 10, '11/9/7', [0, 4, 8, 15]),
  // Light autocannons and rocket launchers (Civil War era prototypes, 3062–3064).
  weapon(IS_3062, 'lac-2', 'Light AC/2', 'Ballistic', 4, 1, 1, '2', [0, 6, 12, 18], 45),
  weapon(IS_3062, 'lac-5', 'Light AC/5', 'Ballistic', 5, 2, 1, '5', [0, 5, 10, 15], 20),
  // Rocket launchers are one-shot (no ammunition) and fire at +1 to hit.
  weapon(IS_3062, 'rl-10', 'Rocket Launcher 10', 'Missile', 0.5, 1, 3, '1/missile', [0, 5, 11, 18]),
  weapon(IS_3062, 'rl-15', 'Rocket Launcher 15', 'Missile', 1, 2, 4, '1/missile', [0, 4, 9, 15]),
  weapon(IS_3062, 'rl-20', 'Rocket Launcher 20', 'Missile', 1.5, 3, 5, '1/missile', [0, 3, 7, 12]),
  // Artillery cannons (direct or indirect fire).
  { ...weapon(ANY_3068, 'thumper-cannon', 'Thumper Cannon', 'Ballistic', 10, 7, 5, '5 art.', [3, 4, 9, 14], 20), artillery: true },
  { ...weapon(ANY_3068, 'sniper-cannon', 'Sniper Cannon', 'Ballistic', 15, 10, 10, '10 art.', [2, 4, 8, 12], 10), artillery: true },
  { ...weapon(ANY_3068, 'long-tom-cannon', 'Long Tom Cannon', 'Ballistic', 20, 15, 20, '20 art.', [4, 6, 13, 20], 5), artillery: true },
];

/** MML ammunition: [launcher, LRM shots per ton, SRM shots per ton]. */
const MML_AMMO: [string, number, number][] = [
  ['mml-3', 40, 33], ['mml-5', 24, 20], ['mml-7', 17, 14], ['mml-9', 13, 11],
];

/** Clan weapons (Clan Invasion era). */
const CLAN_WEAPONS: Equipment[] = [
  weapon(CLAN_3050, 'clan-er-small-laser', 'ER Small Laser', 'Energy', 0.5, 1, 2, '5', [0, 2, 4, 6]),
  weapon(CLAN_3050, 'clan-er-medium-laser', 'ER Medium Laser', 'Energy', 1, 1, 5, '7', [0, 5, 10, 15]),
  weapon(CLAN_3050, 'clan-er-large-laser', 'ER Large Laser', 'Energy', 4, 1, 12, '10', [0, 8, 15, 25]),
  weapon(CLAN_3050, 'clan-small-pulse-laser', 'Small Pulse Laser', 'Energy', 1, 1, 2, '3', [0, 2, 4, 6]),
  weapon(CLAN_3050, 'clan-medium-pulse-laser', 'Medium Pulse Laser', 'Energy', 2, 1, 4, '7', [0, 4, 8, 12]),
  weapon(CLAN_3050, 'clan-large-pulse-laser', 'Large Pulse Laser', 'Energy', 6, 2, 10, '10', [0, 6, 14, 20]),
  weapon(CLAN_3050, 'clan-er-ppc', 'ER PPC', 'Energy', 6, 2, 15, '15', [0, 7, 14, 23]),
  weapon(CLAN_3050, 'clan-flamer', 'Flamer', 'Energy', 0.5, 1, 3, '2', [0, 1, 2, 3]),
  weapon(CLAN_3050, 'clan-machine-gun', 'Machine Gun', 'Ballistic', 0.25, 1, 0, '2', [0, 1, 2, 3], 200),
  weapon(CLAN_3050, 'clan-gauss-rifle', 'Gauss Rifle', 'Ballistic', 12, 6, 1, '15', [2, 7, 15, 22], 8),
  weapon(CLAN_3050, 'clan-lb-2x', 'LB 2-X AC', 'Ballistic', 5, 3, 1, '2 (cluster)', [4, 10, 20, 30], 45),
  weapon(CLAN_3050, 'clan-lb-5x', 'LB 5-X AC', 'Ballistic', 7, 4, 1, '5 (cluster)', [3, 8, 15, 24], 20),
  weapon(CLAN_3050, 'clan-lb-10x', 'LB 10-X AC', 'Ballistic', 10, 5, 2, '10 (cluster)', [0, 6, 12, 18], 10),
  weapon(CLAN_3050, 'clan-lb-20x', 'LB 20-X AC', 'Ballistic', 12, 9, 6, '20 (cluster)', [0, 4, 8, 12], 5),
  weapon(CLAN_3050, 'clan-uac-2', 'Ultra AC/2', 'Ballistic', 5, 2, 1, '2 (×2)', [2, 9, 18, 27], 45),
  weapon(CLAN_3050, 'clan-uac-5', 'Ultra AC/5', 'Ballistic', 7, 3, 1, '5 (×2)', [0, 7, 14, 21], 20),
  weapon(CLAN_3050, 'clan-uac-10', 'Ultra AC/10', 'Ballistic', 10, 4, 3, '10 (×2)', [0, 6, 12, 18], 10),
  weapon(CLAN_3050, 'clan-uac-20', 'Ultra AC/20', 'Ballistic', 12, 8, 7, '20 (×2)', [0, 4, 8, 12], 5),
  weapon(CLAN_3050, 'clan-lrm-5', 'LRM 5', 'Missile', 1, 1, 2, '1/missile', [0, 7, 14, 21], 24),
  weapon(CLAN_3050, 'clan-lrm-10', 'LRM 10', 'Missile', 2.5, 1, 4, '1/missile', [0, 7, 14, 21], 12),
  weapon(CLAN_3050, 'clan-lrm-15', 'LRM 15', 'Missile', 3.5, 2, 5, '1/missile', [0, 7, 14, 21], 8),
  weapon(CLAN_3050, 'clan-lrm-20', 'LRM 20', 'Missile', 5, 4, 6, '1/missile', [0, 7, 14, 21], 6),
  weapon(CLAN_3050, 'clan-srm-2', 'SRM 2', 'Missile', 0.5, 1, 2, '2/missile', [0, 3, 6, 9], 50),
  weapon(CLAN_3050, 'clan-srm-4', 'SRM 4', 'Missile', 1, 1, 3, '2/missile', [0, 3, 6, 9], 25),
  weapon(CLAN_3050, 'clan-srm-6', 'SRM 6', 'Missile', 1.5, 1, 4, '2/missile', [0, 3, 6, 9], 15),
  weapon(CLAN_3050, 'clan-streak-srm-2', 'Streak SRM 2', 'Missile', 1, 1, 2, '2/missile', [0, 4, 8, 12], 50),
  weapon(CLAN_3050, 'clan-streak-srm-4', 'Streak SRM 4', 'Missile', 2, 1, 3, '2/missile', [0, 4, 8, 12], 25),
  weapon(CLAN_3050, 'clan-streak-srm-6', 'Streak SRM 6', 'Missile', 3, 2, 4, '2/missile', [0, 4, 8, 12], 15),
  weapon(CLAN_3050, 'clan-atm-3', 'ATM 3', 'Missile', 1.5, 2, 2, '2/missile', [4, 5, 10, 15], 20),
  weapon(CLAN_3050, 'clan-atm-6', 'ATM 6', 'Missile', 3.5, 3, 4, '2/missile', [4, 5, 10, 15], 10),
  weapon(CLAN_3050, 'clan-atm-9', 'ATM 9', 'Missile', 5, 4, 6, '2/missile', [4, 5, 10, 15], 7),
  weapon(CLAN_3050, 'clan-atm-12', 'ATM 12', 'Missile', 7, 5, 8, '2/missile', [4, 5, 10, 15], 5),
  weapon(CLAN_3050, 'clan-narc', 'Narc Missile Beacon', 'Missile', 2, 1, 0, 'beacon', [0, 4, 8, 12], 6),
  weapon(CLAN_3050, 'clan-ams', 'Anti-Missile System', 'Other', 0.5, 1, 1, 'defensive', null, 24),
  // Introduced 3054–3060, so available by the end of the Clan Invasion era.
  weapon(CLAN_3050, 'clan-er-micro-laser', 'ER Micro Laser', 'Energy', 0.25, 1, 1, '2', [0, 1, 2, 4]),
  weapon(CLAN_3050, 'clan-micro-pulse-laser', 'Micro Pulse Laser', 'Energy', 0.5, 1, 1, '3', [0, 1, 2, 3]),
  weapon(CLAN_3050, 'clan-small-heavy-laser', 'Small Heavy Laser', 'Energy', 0.5, 1, 3, '6', [0, 1, 2, 3]),
  weapon(CLAN_3050, 'clan-medium-heavy-laser', 'Medium Heavy Laser', 'Energy', 1, 2, 7, '10', [0, 3, 6, 9]),
  weapon(CLAN_3050, 'clan-large-heavy-laser', 'Large Heavy Laser', 'Energy', 4, 3, 18, '16', [0, 5, 10, 15]),
  weapon(CLAN_3050, 'clan-light-machine-gun', 'Light Machine Gun', 'Ballistic', 0.25, 1, 0, '1', [0, 2, 4, 6], 200),
  weapon(CLAN_3050, 'clan-heavy-machine-gun', 'Heavy Machine Gun', 'Ballistic', 0.5, 1, 0, '3', [0, 1, 2, 0], 100),
  weapon(CLAN_3050, 'clan-tag', 'TAG', 'Other', 1, 1, 0, 'designator', [0, 5, 9, 15]),
  weapon(CLAN_3050, 'clan-light-tag', 'Light TAG', 'Other', 0.5, 1, 0, 'designator', [0, 3, 6, 9]),
  { ...weapon(CLAN_3050, 'clan-arrow-iv', 'Arrow IV', 'Missile', 12, 12, 10, '20 art.', null, 5), artillery: true },
];

const ALL_WEAPONS = [...IS_INTRO_WEAPONS, ...IS_3050_WEAPONS, ...IS_3062_WEAPONS, ...JIHAD_WEAPONS, ...CLAN_WEAPONS];
// Standard LRM / SRM launchers (not Streak) can take Artemis IV.
for (const w of ALL_WEAPONS) {
  if (/^(clan-)?(lrm|srm|mml)-\d+$/.test(w.id)) w.artemisCapable = true;
}
export const WEAPONS: readonly Equipment[] = ALL_WEAPONS;

const ammoBase = (w: Equipment) => ({
  category: 'Ammo' as const, slots: 1, heat: 0, ammoFor: w.id, isWeapon: false, techBase: w.techBase,
});

export const AMMO: readonly Equipment[] = [
  ...WEAPONS.filter((w) => w.ammoPerTon).map((w) => ({
    ...ammoBase(w),
    id: `ammo-${w.id}`,
    name: `${w.name} Ammo (${w.ammoPerTon})`,
    tons: 1,
    firstEra: w.firstEra,
  })),
  // Artemis IV ammunition (Standard rules, from the Clan Invasion era).
  ...WEAPONS.filter((w) => w.artemisCapable && !w.id.includes('mml')).map((w) => ({
    ...ammoBase(w),
    id: `ammo-${w.id}-artemis`,
    name: `${w.name} Artemis IV Ammo (${w.ammoPerTon})`,
    tons: 1,
    artemisAmmo: true,
    firstEra: '3050' as const,
  })),
  ...MML_AMMO.flatMap(([id, lrm, srm]) => {
    const w = ALL_WEAPONS.find((x) => x.id === id)!;
    return [
      { ...ammoBase(w), id: `ammo-${id}-lrm`, name: `${w.name} LRM Ammo (${lrm})`, tons: 1, firstEra: w.firstEra },
      { ...ammoBase(w), id: `ammo-${id}-srm`, name: `${w.name} SRM Ammo (${srm})`, tons: 1, firstEra: w.firstEra },
    ];
  }),
  // Half-ton machine gun ammunition (Standard rules).
  ...WEAPONS.filter((w) => w.id.endsWith('machine-gun')).map((w) => ({
    ...ammoBase(w),
    id: `ammo-${w.id}-half`,
    name: `${w.name} Ammo, Half (${(w.ammoPerTon ?? 0) / 2})`,
    tons: 0.5,
    firstEra: '3050' as const,
  })),
];

export const HEAT_SINK_ID = 'heat-sink';
export const DOUBLE_HEAT_SINK_ID = 'double-heat-sink';
export const CLAN_DOUBLE_HEAT_SINK_ID = 'clan-double-heat-sink';
export const HEAT_SINK_IDS: readonly string[] = [HEAT_SINK_ID, DOUBLE_HEAT_SINK_ID, CLAN_DOUBLE_HEAT_SINK_ID];
export const JUMP_JET_ID = 'jump-jet';
export const IMPROVED_JUMP_JET_ID = 'improved-jump-jet';
export const JUMP_JET_IDS: readonly string[] = [JUMP_JET_ID, IMPROVED_JUMP_JET_ID];
export const ENDO_STEEL_ID = 'endo-steel';
export const FERRO_FIBROUS_ID = 'ferro-fibrous';
export const TSM_ID = 'tsm';
/** IndustrialMech environmental sealing: one slot in every location. */
export const ENV_SEAL_ID = 'environmental-sealing';
/** Single-slot placeholders for spread-out structure / armor / myomer. */
export const FILLER_IDS: readonly string[] = [ENDO_STEEL_ID, FERRO_FIBROUS_ID, TSM_ID, ENV_SEAL_ID];

const managed = (avail: Avail, id: string, name: string, tons: number, slots: number): Equipment => ({
  id, name, category: 'Other', tons, slots, heat: 0, isWeapon: false, managed: true, ...avail,
});

export const OTHER_EQUIPMENT: readonly Equipment[] = [
  managed(ANY_3025, HEAT_SINK_ID, 'Heat Sink', 1, 1),
  managed(IS_3050, DOUBLE_HEAT_SINK_ID, 'Double Heat Sink', 1, 3),
  managed(CLAN_3050, CLAN_DOUBLE_HEAT_SINK_ID, 'Double Heat Sink', 1, 2),
  {
    ...managed(ANY_3025, JUMP_JET_ID, 'Jump Jet', 0, 1),
    variableWeight: 'jumpJet',
    allowedLocations: ['CT', 'LT', 'RT', 'LL', 'RL'],
  },
  {
    ...managed(ANY_3050, IMPROVED_JUMP_JET_ID, 'Improved Jump Jet', 0, 2),
    variableWeight: 'improvedJumpJet',
    allowedLocations: ['CT', 'LT', 'RT', 'LL', 'RL'],
  },
  managed(ANY_3050, ENDO_STEEL_ID, 'Endo Steel', 0, 1),
  managed(ANY_3050, FERRO_FIBROUS_ID, 'Ferro-Fibrous', 0, 1),
  {
    ...managed(IS_3050, TSM_ID, 'Triple-Strength Myomer', 0, 1),
  },
  managed(ANY_3025, ENV_SEAL_ID, 'Environmental Sealing', 0, 1),
  // Catalog items
  {
    id: 'case', name: 'CASE', category: 'Other', tons: 0.5, slots: 1, heat: 0, isWeapon: false,
    allowedLocations: TORSO, ...IS_3050,
  },
  // CASE II: fits in any location and also protects the head, center torso and legs (and XL side torsos).
  { id: 'case-ii', name: 'CASE II', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...IS_3062 },
  { id: 'clan-case-ii', name: 'CASE II', category: 'Other', tons: 0.5, slots: 1, heat: 0, isWeapon: false, ...CLAN_3062 },
  {
    id: 'masc', name: 'MASC', category: 'Other', tons: 0, slots: 0, heat: 0, isWeapon: false,
    variableWeight: 'masc', allowedLocations: NOT_HEAD, fixedOnly: true, ...IS_3050,
  },
  {
    id: 'clan-masc', name: 'MASC', category: 'Other', tons: 0, slots: 0, heat: 0, isWeapon: false,
    variableWeight: 'masc', allowedLocations: NOT_HEAD, fixedOnly: true, ...CLAN_3050,
  },
  // Physical (melee) weapons
  ...([
    [IS_3025, 'hatchet', 'Hatchet', true],
    [IS_3050, 'sword', 'Sword', true],
    [IS_3050, 'mace', 'Mace', true],
    [ANY_3050, 'claw', 'Claw', true],
    [IS_3050, 'retractable-blade', 'Retractable Blade', true],
    [IS_3081, 'chain-whip', 'Chain Whip', true],
    [CLAN_3081, 'talons', 'Talons', false],
    [IS_3050, 'spikes', 'Spikes', false],
  ] as const).map(([avail, id, name, armOnly]): Equipment => ({
    id, name, category: 'Physical', tons: 0, slots: 0, heat: 0, isWeapon: false, melee: id, ...avail,
    ...(armOnly ? { armOnly: true, allowedLocations: ['LA', 'RA'] as const } : {}),
    ...(id === 'talons' ? { allowedLocations: ['LL', 'RL'] as const } : {}),
  })),
  // Land-Air 'Mech equipment (Interstellar Operations)
  {
    id: 'bomb-bay', name: 'Bomb Bay', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false,
    lamOnly: true, explosive: true, allowedLocations: TORSO, ...ANY_3025,
  },
  {
    id: 'lam-fuel-tank', name: 'LAM Fuel Tank', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false,
    lamOnly: true, explosive: true, allowedLocations: NOT_HEAD, ...ANY_3025,
  },
  { id: 'artemis-iv', name: 'Artemis IV FCS', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...IS_3050 },
  { id: 'clan-artemis-iv', name: 'Artemis IV FCS', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...CLAN_3050 },
  {
    // The Inner Sphere version arrives in the Civil War era (3062).
    id: 'targeting-computer', name: 'Targeting Computer', category: 'Other', tons: 0, slots: 0, heat: 0,
    isWeapon: false, variableWeight: 'targetingComputer', techBase: 'IS', firstEra: '3062',
  },
  {
    id: 'clan-targeting-computer', name: 'Targeting Computer', category: 'Other', tons: 0, slots: 0, heat: 0,
    isWeapon: false, variableWeight: 'targetingComputer', ...CLAN_3050,
  },
  { id: 'c3-master', name: 'C3 Master Computer', category: 'Other', tons: 5, slots: 5, heat: 0, isWeapon: false, ...IS_3050 },
  { id: 'c3-slave', name: 'C3 Slave Unit', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...IS_3050 },
  { id: 'improved-c3', name: 'Improved C3 Computer', category: 'Other', tons: 2.5, slots: 2, heat: 0, isWeapon: false, ...IS_3062 },
  { id: 'beagle-active-probe', name: 'Beagle Active Probe', category: 'Other', tons: 1.5, slots: 2, heat: 0, isWeapon: false, ...IS_3050 },
  { id: 'guardian-ecm', name: 'Guardian ECM Suite', category: 'Other', tons: 1.5, slots: 2, heat: 0, isWeapon: false, ...IS_3050 },
  { id: 'clan-active-probe', name: 'Active Probe', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...CLAN_3050 },
  { id: 'clan-ecm', name: 'ECM Suite', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false, ...CLAN_3050 },
  { id: 'angel-ecm', name: 'Angel ECM Suite', category: 'Other', tons: 2, slots: 2, heat: 0, isWeapon: false, ...ANY_3050 },
  // Supercharger: 10% of the engine's weight, one slot in a location holding engine slots; ×2 walking MP to run.
  {
    id: 'supercharger', name: 'Supercharger', category: 'Other', tons: 0, slots: 1, heat: 0, isWeapon: false,
    variableWeight: 'supercharger', allowedLocations: TORSO, techBase: 'Both', firstEra: '3025',
  },
  // PPC Capacitor: linked to a PPC in the same location, +5 damage and +5 heat when charged.
  {
    id: 'ppc-capacitor', name: 'PPC Capacitor', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false,
    explosive: true, explosiveLow: true, ...IS_3050,
  },
  {
    id: 'clan-ppc-capacitor', name: 'PPC Capacitor', category: 'Other', tons: 1, slots: 1, heat: 0, isWeapon: false,
    explosive: true, explosiveLow: true, techBase: 'Clan', firstEra: '3101',
  },
];

/** 'Mech critical slots for industrial equipment (vehicles use one item slot per item). */
const MECH_UTILITY_SLOTS: Record<string, number> = {
  'lift-hoist': 3, backhoe: 6, chainsaw: 5, 'dual-saw': 7, 'rock-cutter': 5, combine: 4, 'salvage-arm': 2,
  'spot-welder': 1, 'pile-driver': 8, 'mining-drill': 4, 'cargo-container': 10,
};
/** Industrial and utility equipment carried by vehicles and IndustrialMechs (not BattleMechs). */
const utility = (id: string, name: string, tons: number): Equipment => ({
  id, name, category: 'Utility', tons, slots: MECH_UTILITY_SLOTS[id] ?? 1, heat: 0, isWeapon: false, techBase: 'Both', firstEra: '3025',
});
export const UTILITY_EQUIPMENT: readonly Equipment[] = [
  utility('searchlight', 'Searchlight (Mounted)', 0.5),
  utility('searchlight-handheld', 'Searchlight (Handheld)', 0.005),
  utility('lift-hoist', 'Lift Hoist / Arresting Hoist', 3),
  utility('paramedic-equipment', 'Paramedic Equipment', 0.25),
  utility('cargo-container', 'Cargo Container (10 tons)', 10),
  utility('communications-equipment', 'Communications Equipment (1 ton)', 1),
  utility('bulldozer', 'Bulldozer', 2),
  utility('backhoe', 'Backhoe', 5),
  utility('chainsaw', 'Chainsaw', 5),
  utility('dual-saw', 'Dual Saw', 7),
  utility('rock-cutter', 'Rock Cutter', 5),
  utility('combine', 'Combine', 2.5),
  utility('salvage-arm', 'Salvage Arm', 3),
  utility('spot-welder', 'Spot Welder', 2),
  utility('pile-driver', 'Heavy-Duty Pile Driver', 10),
  utility('field-kitchen', 'Field Kitchen', 3),
  utility('mobile-field-base', 'Mobile Field Base', 20),
  utility('lifeboat-maritime', 'Lifeboat (Maritime)', 1),
  utility('lifeboat-atmospheric', 'Lifeboat (Atmospheric)', 1),
  utility('refueling-drogue', 'Refueling Drogue', 1),
  utility('mast-mount', 'Mast Mount', 0.5),
  utility('trailer-hitch', 'Trailer Hitch', 0),
  utility('mine-dispenser', 'Vehicular Mine Dispenser', 0.5),
  utility('mine-sweeper', 'Mine Sweeper', 3),
  utility('remote-sensor-dispenser', 'Remote Sensors / Dispenser', 0.5),
  utility('manipulator', 'Manipulator (industrial)', 0.01),
  utility('recon-camera', 'Recon Camera', 0.5),
  utility('mining-drill', 'Mining Drill', 3),
  utility('sprayer', 'Sprayer', 0.5),
  utility('im-ejection-seat', 'IM Ejection Seat', 0.5),
  // Cargo space and liquid storage, a ton (one slot) or half a ton (one slot) at a time.
  utility('cargo-1', 'Cargo (1 ton)', 1),
  utility('cargo-half', 'Cargo (½ ton)', 0.5),
  utility('liquid-storage-1', 'Liquid Storage (1 ton)', 1),
  utility('liquid-storage-half', 'Liquid Storage (½ ton)', 0.5),
];

// Capital and sub-capital weapons (values from MegaMek's weapon and ammo definitions)
const CAPITAL_ERA: Record<CapitalClass, Avail> = {
  capital: ANY_3025, 'capital-missile': ANY_3025, 'sub-capital': { techBase: 'Both', firstEra: '3068' },
  screen: ANY_3050, 'mass-driver': { techBase: 'Both', firstEra: '3081' },
};
/** [id, name, class, tons, heat, damage (capital), ammo: [tons per shot, BV per shot, cost per shot] | null, era override] */
const CAPITAL_DEFS: [string, string, CapitalClass, number, number, string, [number, number, number] | null, Avail?][] = [
  ['nl-35', 'Naval Laser 35', 'capital', 700, 52, '3.5', null],
  ['nl-45', 'Naval Laser 45', 'capital', 900, 70, '4.5', null],
  ['nl-55', 'Naval Laser 55', 'capital', 1100, 85, '5.5', null],
  ['nppc-light', 'Naval PPC (Light)', 'capital', 1400, 105, '7', null],
  ['nppc-medium', 'Naval PPC (Medium)', 'capital', 1800, 135, '9', null],
  ['nppc-heavy', 'Naval PPC (Heavy)', 'capital', 3000, 225, '15', null],
  ['nac-10', 'Naval Autocannon (NAC/10)', 'capital', 2000, 30, '10', [0.2, 237, 30000]],
  ['nac-20', 'Naval Autocannon (NAC/20)', 'capital', 2500, 60, '20', [0.4, 474, 60000]],
  ['nac-25', 'Naval Autocannon (NAC/25)', 'capital', 3000, 85, '25', [0.6, 593, 75000]],
  ['nac-30', 'Naval Autocannon (NAC/30)', 'capital', 3500, 100, '30', [0.8, 711, 90000]],
  ['nac-35', 'Naval Autocannon (NAC/35)', 'capital', 4000, 120, '35', [1, 620, 105000]],
  ['nac-40', 'Naval Autocannon (NAC/40)', 'capital', 4500, 135, '40', [1.2, 708, 120000]],
  ['ngauss-light', 'Naval Gauss (Light)', 'capital', 4500, 9, '15', [0.2, 378, 45000]],
  ['ngauss-medium', 'Naval Gauss (Medium)', 'capital', 5500, 15, '25', [0.4, 630, 75000]],
  ['ngauss-heavy', 'Naval Gauss (Heavy)', 'capital', 7000, 18, '30', [0.5, 756, 90000]],
  ['barracuda', 'Capital Missile Launcher (Barracuda)', 'capital-missile', 90, 10, '2', [30, 65, 8000]],
  ['white-shark', 'Capital Missile Launcher (White Shark)', 'capital-missile', 120, 15, '3', [40, 72, 14000]],
  ['killer-whale', 'Capital Missile Launcher (Killer Whale)', 'capital-missile', 150, 20, '4', [50, 96, 20000]],
  ['ar10', 'Capital Missile Launcher (AR10 Launcher)', 'capital-missile', 250, 20, '2–4', null],
  ['barracuda-t', 'Tele-operated Missile (Barracuda-T)', 'capital-missile', 100, 10, '2', [30, 65, 8000], ANY_3050],
  ['white-shark-t', 'Tele-operated Missile (White Shark-T)', 'capital-missile', 130, 15, '3', [40, 72, 14000], ANY_3050],
  ['killer-whale-t', 'Tele-operated Missile (Killer Whale-T)', 'capital-missile', 160, 20, '4', [50, 96, 20000], ANY_3050],
  ['kraken-t', 'Tele-operated Missile (Kraken T)', 'capital-missile', 220, 50, '10', [100, 288, 55000], ANY_3050],
  ['scl-1', 'Sub-Capital Laser /1', 'sub-capital', 150, 24, '1', null],
  ['scl-2', 'Sub-Capital Laser /2', 'sub-capital', 200, 28, '2', null],
  ['scl-3', 'Sub-Capital Laser /3', 'sub-capital', 250, 32, '3', null],
  ['scc-light', 'Sub-Capital Cannon (Light)', 'sub-capital', 200, 12, '2', [0.5, 47, 10000]],
  ['scc-medium', 'Sub-Capital Cannon (Medium)', 'sub-capital', 500, 30, '5', [1, 89, 18000]],
  ['scc-heavy', 'Sub-Capital Cannon (Heavy)', 'sub-capital', 700, 42, '7', [2, 124, 25000]],
  ['piranha', 'Sub-Capital Missile Launcher (Piranha)', 'sub-capital', 100, 9, '3', [10, 71, 15000]],
  ['stingray', 'Sub-Capital Missile Launcher (Stingray)', 'sub-capital', 120, 9, '3.5', [12, 62, 19000]],
  ['swordfish', 'Sub-Capital Missile Launcher (Swordfish)', 'sub-capital', 140, 15, '4', [15, 40, 25000]],
  ['manta-ray', 'Sub-Capital Missile Launcher (Manta Ray)', 'sub-capital', 160, 21, '5', [18, 50, 30000]],
  ['screen-launcher', 'Screen Launcher', 'screen', 40, 10, 'screen', [10, 20, 10000]],
  ['mass-driver-light', 'Mass Driver (Light)', 'mass-driver', 30000, 30, '60', [30, 882, 150000]],
  ['mass-driver-medium', 'Mass Driver (Medium)', 'mass-driver', 50000, 60, '100', [60, 1470, 300000]],
  ['mass-driver-heavy', 'Mass Driver (Heavy)', 'mass-driver', 100000, 90, '140', [90, 2058, 600000]],
];
/** "Naval Autocannon (NAC/20)" → "NAC/20 Ammo", "Naval Gauss (Heavy)" → "Heavy N-Gauss Ammo", "Screen Launcher" → "Screen Launcher Ammo". */
function capitalAmmoName(weapon: string): string {
  const g = /^Naval Gauss \((\w+)\)$/.exec(weapon);
  if (g) return `${g[1]} N-Gauss Ammo`;
  const m = /^Mass Driver \((\w+)\)$/.exec(weapon);
  if (m) return `${m[1]} Mass Driver Ammo`;
  const c = /^Sub-Capital Cannon \((\w+)\)$/.exec(weapon);
  if (c) return `${c[1]} SCC Ammo`;
  const p = /\((.+)\)$/.exec(weapon);
  return `${p ? p[1].replace(/ T$/, '-T') : weapon} Ammo`;
}
const CAPITAL_EQUIPMENT: Equipment[] = CAPITAL_DEFS.flatMap(([id, name, cls, tons, heat, damage, ammo, era]): Equipment[] => {
  const avail = era ?? CAPITAL_ERA[cls];
  const w: Equipment = { id, name, category: 'Capital', tons, slots: 1, heat, damage, isWeapon: true, capitalClass: cls, ...avail };
  if (!ammo) return [w];
  const [shotTons, shotBV, shotCost] = ammo;
  return [w, {
    id: `ammo-${id}`, name: capitalAmmoName(name), category: 'Ammo', tons: shotTons, slots: 0, heat: 0,
    isWeapon: false, ammoFor: id, capitalClass: cls, shotBV, shotCost, ...avail,
  }];
});
// The AR10 fires Barracuda, White Shark or Killer Whale missiles.
for (const [m, t, bv, cost] of [['Barracuda', 30, 65, 8000], ['White Shark', 40, 72, 14000], ['Killer Whale', 50, 96, 20000]] as const) {
  CAPITAL_EQUIPMENT.push({
    id: `ammo-ar10-${m.toLowerCase().replace(' ', '-')}`, name: `AR10 ${m} Ammo`, category: 'Ammo', tons: t, slots: 0, heat: 0,
    isWeapon: false, ammoFor: 'ar10', capitalClass: 'capital-missile', shotBV: bv, shotCost: cost, ...ANY_3025,
  });
}


export const ALL_EQUIPMENT: readonly Equipment[] = [...WEAPONS, ...AMMO, ...OTHER_EQUIPMENT, ...UTILITY_EQUIPMENT, ...CAPITAL_EQUIPMENT];

const BY_ID = new Map(ALL_EQUIPMENT.map((e) => [e.id, e]));
const AMMO_FED = new Set(AMMO.map((a) => a.ammoFor));

/** Weapons that need ammunition (anything some ammo bin feeds). */
export function usesAmmo(eq: Equipment): boolean {
  return AMMO_FED.has(eq.id);
}

export function getEquipment(id: string): Equipment | undefined {
  return BY_ID.get(id);
}

/**
 * Locations an item may go in. Leg-mountable items (jump jets) may use all four legs of a quad,
 * whose front legs share the arm location codes.
 */
export function allowedLocations(eq: Equipment, design?: { config?: MechConfig }): readonly Location[] {
  const locs = eq.allowedLocations ?? LOCATIONS;
  if (design?.config === 'quad' && eq.armOnly) return [];
  if (design?.config === 'quad' && locs.includes('LL')) {
    return LOCATIONS.filter((l) => locs.includes(l) || l === 'LA' || l === 'RA');
  }
  return locs;
}

/** Weapons and industrial equipment in a torso location (or in any leg of a quad) may be mounted rear-facing. */
export function canRearMount(eq: Equipment, location: Location | null, design?: { config?: MechConfig }): boolean {
  // Weapons, and industrial equipment such as lift hoists and searchlights, may face rearward.
  if ((!eq.isWeapon && eq.category !== 'Utility') || !location) return false;
  if (location === 'CT' || location === 'LT' || location === 'RT') return true;
  return design?.config === 'quad' && location !== 'HD';
}

/** PPCs that a PPC Capacitor can link to. */
export function isPPC(id: string): boolean {
  return /(^|-)(er-|light-|heavy-|snub-nose-)?ppc$/.test(id);
}

/** Mixed tech lets a design use equipment from either tech base. */
export function isEquipmentAvailable(eq: Equipment, era: EraId, techBase: TechBase, mixedTech = false): boolean {
  const baseOk = eq.techBase === 'Both' || eq.techBase === techBase || mixedTech;
  return baseOk && isAvailableIn(eq.firstEra, era);
}

/** Display name; on mixed-tech designs Clan and IS versions are told apart. */
/** Spread-out structure / armor slots are named after the design's structure or armor type. */
const FILLER_NAMES: Record<string, Record<string, string>> = {
  'endo-steel': { 'endo-prototype': 'Endo Steel Prototype', 'endo-composite': 'Endo-Composite' },
  tsm: { 'industrial-tsm': 'Industrial TSM' },
  'ferro-fibrous': {
    'light-ferro': 'Light Ferro-Fibrous', 'heavy-ferro': 'Heavy Ferro-Fibrous', reactive: 'Reactive', reflective: 'Reflective',
    'ferro-lamellor': 'Ferro-Lamellor', 'ballistic-reinforced': 'Ballistic-Reinforced', 'anti-penetrative': 'Anti-Penetrative Ablation',
    'heat-dissipating': 'Heat-Dissipating', 'impact-resistant': 'Impact-Resistant',
  },
};
const FILLER_SHORT: Record<string, string> = {
  'Light Ferro-Fibrous': 'Light Ferro', 'Heavy Ferro-Fibrous': 'Heavy Ferro', 'Anti-Penetrative Ablation': 'Ablative',
  'Ballistic-Reinforced': 'Ballistic-Reinf.', 'Endo Steel Prototype': 'Endo Steel (P)',
};
function baseName(eq: Equipment, d: object): string {
  const by = FILLER_NAMES[eq.id];
  if (!by) return eq.name;
  const kind = eq.id === 'endo-steel' ? (d as { structureType?: string }).structureType
    : eq.id === 'tsm' ? (d as { myomer?: string }).myomer : (d as { armorType?: string }).armorType;
  return (kind && by[kind]) ?? eq.name;
}

export function equipmentName(eq: Equipment, d: Pick<MechDesign, 'mixedTech'>): string {
  if (FILLER_NAMES[eq.id]) return baseName(eq, d);
  if (!d.mixedTech || eq.techBase === 'Both') return eq.name;
  return `${eq.name} (${eq.techBase === 'Clan' ? 'Clan' : 'IS'})`;
}

/** Standard short forms, always applied in compact names. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/Light Machine Gun/g, 'LMG'], [/Heavy Machine Gun/g, 'HMG'], [/Machine Gun/g, 'MG'],
  [/Anti-Missile System/g, 'AMS'], [/Narc Missile Beacon/g, 'Narc'], [/iNarc Launcher/g, 'iNarc'],
  [/Hyper-Assault Gauss/g, 'HAG'], [/Magshot Gauss Rifle/g, 'Magshot'], [/AP Gauss Rifle/g, 'AP Gauss'],
  [/Light Gauss Rifle/g, 'Light Gauss'], [/Heavy Gauss Rifle/g, 'Heavy Gauss'],
  [/Ultra AC\//g, 'UAC/'], [/Rotary AC\//g, 'RAC/'], [/(LB \d+-X) AC/g, '$1'],
  [/Artemis IV FCS/g, 'Artemis IV'], [/ Artemis IV Ammo/g, ' Art. Ammo'], [/ Ammo, Half/g, ' Ammo ½'],
  [/Improved Heavy (Small|Medium|Large) Laser/g, 'Imp. Heavy $1 L.'], [/Rocket Launcher (\d+)/g, 'RL $1'],
  [/Long Tom Cannon Ammo/g, 'LT Cannon Ammo'], [/(Sniper|Thumper) Cannon Ammo/g, '$1 C. Ammo'], [/Targeting Computer/g, 'Targeting Comp.'], [/Triple-Strength Myomer/g, 'TSM'],
  [/Beagle Active Probe/g, 'Beagle Probe'], [/Guardian ECM Suite/g, 'Guardian ECM'],
  [/C3 Master Computer/g, 'C3 Master'], [/C3 Slave Unit/g, 'C3 Slave'], [/Improved C3 Computer/g, 'C3i'],
  [/Improved Jump Jet/g, 'Imp. Jump Jet'], [/Snub-Nose PPC/g, 'SN PPC'], [/Retractable Blade/g, 'Ret. Blade'],
  [/Communications Equipment/g, 'Comms Equip.'], [/Lift Hoist \/ Arresting Hoist/g, 'Lift Hoist'],
  [/Remote Sensors \/ Dispenser/g, 'Sensor Dispenser'], [/Vehicular Mine Dispenser/g, 'Mine Dispenser'],
  [/Paramedic Equipment/g, 'Paramedic Equip.'], [/Manipulator \(industrial\)/g, 'Manipulator'],
  [/Heavy-Duty Pile Driver/g, 'HD Pile Driver'], [/Lifeboat \(Atmospheric\)/g, 'Lifeboat (Atmo)'],
  [/ \((\d+) tons?\)/g, ' ($1 t)'],
  [/^Naval Autocannon \((NAC\/\d+)\)/, '$1'], [/^Naval Laser (\d+)/, 'NL$1'], [/^Naval PPC \((\w+)\)/, '$1 NPPC'],
  [/^Naval Gauss \((\w+)\)/, '$1 N-Gauss'], [/^(Capital Missile Launcher|Tele-operated Missile) \((.+?)( Launcher)?\)/, '$2'],
  [/^Sub-Capital Laser \/(\d)/, 'SCL/$1'], [/^Sub-Capital Cannon \((\w+)\)/, '$1 SCC'],
  [/^Sub-Capital Missile Launcher \((.+)\)/, '$1'], [/^Mass Driver \((\w+)\)/, '$1 Mass Driver'],
];

/** Further short forms, used only while a name is still longer than COMPACT_LENGTH. */
const IF_LONG: [RegExp, string][] = [
  [/\bMedium\b/g, 'Med.'], [/\bLarge\b/g, 'Lg.'], [/\bSmall\b/g, 'Sm.'],
  [/Streak SRM/g, 'SSRM'], [/Thunderbolt/g, 'T-Bolt'], [/Gauss Rifle/g, 'Gauss'], [/Double Heat Sink/g, 'Dbl. Heat Sink'],
  [/Plasma (Rifle|Cannon)/g, 'Plas. $1'], [/Equipment/g, 'Equip.'],
];
export const COMPACT_LENGTH = 16;

/**
 * Abbreviated name for tight spaces (record sheets, critical slots, readouts):
 * "Machine Gun Ammo, Half (100)" → "MG Ammo ½ (100)", "Medium Pulse Laser" → "Med. Pulse Laser".
 * Mixed-tech designs tag items "(C)" or "(IS)".
 */
export function shortEquipmentName(eq: Equipment, d: Pick<MechDesign, 'mixedTech'>): string {
  if (FILLER_NAMES[eq.id]) {
    const n = baseName(eq, d);
    return FILLER_SHORT[n] ?? n;
  }
  let name = eq.name;
  for (const [re, to] of ABBREVIATIONS) name = name.replace(re, to);
  for (const [re, to] of IF_LONG) if (name.length > COMPACT_LENGTH) name = name.replace(re, to);
  if (!d.mixedTech || eq.techBase === 'Both') return name;
  return `${name} (${eq.techBase === 'Clan' ? 'C' : 'IS'})`;
}

type SizingDesign = Pick<MechDesign, 'tonnage' | 'techBase' | 'equipment'> & { config?: MechConfig } & Partial<Pick<MechDesign, 'engineType' | 'walkMP'>>;

/** Weapons a targeting computer is sized from: direct-fire energy and ballistic weapons. */
export function isDirectFire(eq: Equipment): boolean {
  // As MegaMek: lasers, PPCs, autocannon, Gauss rifles and plasma weapons are direct fire; artillery,
  // flamers, machine guns and anti-missile systems are not.
  if (!eq.isWeapon || eq.artillery || /flamer|machine-gun|(^|-)ams$/.test(eq.id)) return false;
  return eq.category === 'Energy' || eq.category === 'Ballistic';
}

/** Targeting computer: 1 ton per 4 (IS) or 5 (Clan) tons of direct-fire weapons, rounded up. */
export function targetingComputerWeight(eq: Equipment, d: SizingDesign): number {
  let tons = 0;
  for (const m of d.equipment) {
    const w = getEquipment(m.equipmentId);
    if (w && isDirectFire(w)) tons += w.tons;
  }
  return Math.max(1, Math.ceil(tons / (eq.techBase === 'Clan' ? 5 : 4) - 1e-9));
}

export function itemWeight(eq: Equipment, d: SizingDesign): number {
  if (eq.variableWeight === 'jumpJet') return jumpJetWeight(d.tonnage);
  if (eq.variableWeight === 'improvedJumpJet') return jumpJetWeight(d.tonnage) * 2;
  if (eq.variableWeight === 'masc') return mascWeight(d.tonnage, eq.techBase === 'Clan' ? 'Clan' : 'IS');
  if (eq.variableWeight === 'supercharger') {
    // 10% of the engine weight, rounded up to the half ton.
    const engine = d.walkMP && d.engineType ? engineWeight(d.engineType, d.tonnage * d.walkMP) ?? 0 : 0;
    return Math.ceil((engine / 10) * 2 - 1e-9) / 2;
  }
  if (eq.variableWeight === 'targetingComputer') return targetingComputerWeight(eq, d);
  if (eq.melee) return meleeWeight(eq.melee, d);
  return eq.tons;
}

export function itemSlots(eq: Equipment, d: SizingDesign): number {
  if (eq.melee) return meleeSlots(eq.melee, d.tonnage);
  return eq.variableWeight === 'masc' || eq.variableWeight === 'targetingComputer'
    ? itemWeight(eq, d)
    : eq.slots;
}

const upHalf = (x: number) => Math.ceil(x * 2 - 1e-9) / 2;

/** Number of legs (talons are one item per leg). */
export const legCount = (d: { config?: MechConfig }) => (d.config === 'quad' ? 4 : 2);

/** Weight of one melee item (TechManual / Tactical Operations, as implemented by MegaMek). */
export function meleeWeight(kind: MeleeKind, d: SizingDesign): number {
  const t = d.tonnage;
  switch (kind) {
    case 'hatchet': case 'claw': return Math.ceil(t / 15);
    case 'sword': return upHalf(t / 20);
    case 'mace': return Math.ceil(t / 10);
    case 'retractable-blade': return 0.5 + upHalf(t / 20);
    case 'chain-whip': return 3;
    case 'talons': return Math.ceil(t / 15) / legCount(d); // the set weighs tonnage / 15, split over the legs
    case 'spikes': return 0.5;
  }
}

export function meleeSlots(kind: MeleeKind, tonnage: number): number {
  switch (kind) {
    case 'hatchet': case 'sword': case 'claw': return Math.ceil(tonnage / 15);
    case 'mace': return Math.ceil(tonnage / 10);
    case 'retractable-blade': return 1 + Math.ceil(tonnage / 20);
    case 'chain-whip': case 'talons': return 2;
    case 'spikes': return 1;
  }
}

export function jumpJetIdFor(d: Pick<MechDesign, 'jumpJetType'>): string {
  return d.jumpJetType === 'improved' ? IMPROVED_JUMP_JET_ID : JUMP_JET_ID;
}

/** Heat sink equipment id for a design's heat sink type and tech base. */
export function heatSinkIdFor(d: Pick<MechDesign, 'heatSinkType' | 'techBase'>): string {
  if (d.heatSinkType === 'single') return HEAT_SINK_ID;
  return d.techBase === 'Clan' ? CLAN_DOUBLE_HEAT_SINK_ID : DOUBLE_HEAT_SINK_ID;
}
