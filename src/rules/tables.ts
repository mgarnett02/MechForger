import type {
  ArmorType, CockpitType, EffectiveCockpit, EngineType, GyroType, HeatSinkType, JumpJetType, Location, MyomerType, StructureType,
  TechBase, WeightClass,
} from './types';
import type { EraId } from './eras';
import { isAvailableIn } from './eras';

/**
 * Introductory-level construction tables for Inner Sphere BattleMechs
 * (standard fusion engine, standard structure, standard armor,
 * standard gyro and cockpit, single heat sinks).
 */

/** 10 and 15 tons are ultralight 'Mechs (IndustrialMechs and ultralight BattleMechs). */
export const TONNAGES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
/** Superheavy 'Mechs (Interstellar Operations): 105–200 tons. */
export const SUPERHEAVY_TONNAGES = [105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200];

export const MIN_ENGINE_RATING = 10;
/** Large engines run from 405 to 500. */
export const MAX_ENGINE_RATING = 500;
export const MAX_NORMAL_ENGINE_RATING = 400;
/** Engines rated above 400 are large engines (Tactical Operations). */
export const isLargeEngine = (rating: number) => rating > MAX_NORMAL_ENGINE_RATING;
export const COCKPIT_WEIGHT = 3;
export const HEAD_ARMOR_MAX = 9;
export const ARMOR_POINTS_PER_TON = 16;
export const FREE_HEAT_SINKS = 10;

/** Standard fusion engine weight (tons) by rating. */
const STANDARD_FUSION_WEIGHTS: Record<number, number> = {
  10: 0.5, 15: 0.5, 20: 0.5, 25: 0.5, 30: 1, 35: 1, 40: 1, 45: 1,
  50: 1.5, 55: 1.5, 60: 1.5, 65: 2, 70: 2, 75: 2, 80: 2.5, 85: 2.5,
  90: 3, 95: 3, 100: 3, 105: 3.5, 110: 3.5, 115: 4, 120: 4, 125: 4,
  130: 4.5, 135: 4.5, 140: 5, 145: 5, 150: 5.5, 155: 5.5, 160: 6, 165: 6,
  170: 6, 175: 7, 180: 7, 185: 7.5, 190: 7.5, 195: 8, 200: 8.5, 205: 8.5,
  210: 9, 215: 9.5, 220: 10, 225: 10, 230: 10.5, 235: 11, 240: 11.5, 245: 12,
  250: 12.5, 255: 13, 260: 13.5, 265: 14, 270: 14.5, 275: 15.5, 280: 16, 285: 16.5,
  290: 17.5, 295: 18, 300: 19, 305: 19.5, 310: 20.5, 315: 21.5, 320: 22.5, 325: 23.5,
  330: 24.5, 335: 25.5, 340: 27, 345: 28.5, 350: 29.5, 355: 31.5, 360: 33, 365: 34.5,
  370: 36.5, 375: 38.5, 380: 41, 385: 43.5, 390: 46, 395: 49, 400: 52.5,
  // Large engines (MegaMek's table).
  405: 56.5, 410: 61, 415: 66.5, 420: 72.5, 425: 79.5, 430: 87.5, 435: 97, 440: 107.5, 445: 119.5, 450: 133.5,
  455: 150, 460: 168.5, 465: 190, 470: 214.5, 475: 243, 480: 275.5, 485: 313, 490: 356, 495: 405.5, 500: 462.5,
};

export function standardFusionEngineWeight(rating: number): number | null {
  return STANDARD_FUSION_WEIGHTS[rating] ?? null;
}

/** Internal structure points by tonnage: [CT, side torso, arm, leg]. Head is always 3. */
const INTERNAL_STRUCTURE: Record<number, [number, number, number, number]> = {
  10: [4, 3, 1, 2],
  15: [5, 4, 2, 3],
  20: [6, 5, 3, 4],
  25: [8, 6, 4, 6],
  30: [10, 7, 5, 7],
  35: [11, 8, 6, 8],
  40: [12, 10, 6, 10],
  45: [14, 11, 7, 11],
  50: [16, 12, 8, 12],
  55: [18, 13, 9, 13],
  60: [20, 14, 10, 14],
  65: [21, 15, 10, 15],
  70: [22, 15, 11, 15],
  75: [23, 16, 12, 16],
  80: [25, 17, 13, 17],
  85: [27, 18, 14, 18],
  90: [29, 19, 15, 19],
  95: [30, 20, 16, 20],
  100: [31, 21, 17, 21],
  // Superheavy 'Mechs (head 4).
  105: [32, 22, 17, 22], 110: [33, 23, 18, 23], 115: [35, 24, 19, 24], 120: [36, 25, 20, 25], 125: [38, 26, 21, 26],
  130: [39, 27, 21, 27], 135: [41, 28, 22, 28], 140: [42, 29, 23, 29], 145: [44, 31, 24, 31], 150: [45, 32, 25, 32],
  155: [47, 33, 26, 33], 160: [48, 34, 26, 34], 165: [50, 35, 27, 35], 170: [51, 36, 28, 36], 175: [53, 37, 29, 37],
  180: [54, 38, 30, 38], 185: [56, 39, 31, 39], 190: [57, 40, 31, 40], 195: [59, 41, 32, 41], 200: [60, 42, 33, 42],
};

/** Internal structure per location. On a quad, the front legs (LA/RA) use the leg value; a tripod's center leg too. */
export function internalStructure(tonnage: number, quad = false, tripod = false): Record<Location, number> | null {
  const row = INTERNAL_STRUCTURE[tonnage];
  if (!row) return null;
  const [ct, st, arm, leg] = row;
  const front = quad ? leg : arm;
  return { HD: tonnage > 100 ? 4 : 3, CT: ct, LT: st, RT: st, LA: front, RA: front, LL: leg, RL: leg, CL: tripod ? leg : 0 };
}

/** Standard internal structure is 10% of the mech's tonnage, rounded up to the half ton. */
export function structureWeight(tonnage: number): number {
  return Math.ceil(tonnage * 0.1 * 2) / 2;
}

/** Standard gyro: engine rating / 100, rounded up to the next whole ton. */
export function gyroWeight(rating: number): number {
  return Math.ceil(rating / 100);
}

/** Weight per standard jump jet. */
/** Improved jump jets weigh and occupy twice as much as standard ones. */
export function jumpJetWeightFor(type: JumpJetType, tonnage: number): number {
  // Prototype improved jump jets weigh as standard ones (MegaMek).
  return jumpJetWeight(tonnage) * (type === 'improved' ? 2 : 1);
}

export function jumpJetWeight(tonnage: number): number {
  if (tonnage <= 55) return 0.5;
  if (tonnage <= 85) return 1;
  return 2;
}

/** Heat sinks that fit inside a fusion engine without using critical slots. */
export function engineHeatSinkCapacity(rating: number): number {
  return Math.floor(rating / 25);
}

export function weightClass(tonnage: number): WeightClass | null {
  if (tonnage < 10 || tonnage > 200) return null;
  if (tonnage > 100) return 'Superheavy';
  if (tonnage < 20) return 'Ultralight';
  if (tonnage <= 35) return 'Light';
  if (tonnage <= 55) return 'Medium';
  if (tonnage <= 75) return 'Heavy';
  return 'Assault';
}

/** Highest walking MP allowed before the engine rating exceeds the maximum (500, with a large engine). */
export function maxWalkMP(tonnage: number): number {
  return Math.floor(MAX_ENGINE_RATING / tonnage);
}

export function runMP(walkMP: number): number {
  return Math.ceil(walkMP * 1.5);
}

// ---------------------------------------------------------------------------
// Standard-level construction options (Clan Invasion era onward)
// ---------------------------------------------------------------------------

/** XL fusion engine: half the standard weight, rounded up to the half ton. */
export function xlEngineWeight(rating: number): number | null {
  const std = standardFusionEngineWeight(rating);
  return std === null ? null : Math.ceil(std) / 2;
}

/** Light fusion engine (IS): 75% of standard weight, rounded up to the half ton. */
export function lightEngineWeight(rating: number): number | null {
  const std = standardFusionEngineWeight(rating);
  return std === null ? null : Math.ceil(std * 0.75 * 2) / 2;
}

/** Compact fusion engine (IS): 150% of standard weight, rounded up to the half ton. */
export function compactEngineWeight(rating: number): number | null {
  const std = standardFusionEngineWeight(rating);
  return std === null ? null : Math.ceil(std * 1.5 * 2) / 2;
}

/** XXL fusion engine: a third of the standard weight, rounded up to the half ton. */
export function xxlEngineWeight(rating: number): number | null {
  const std = standardFusionEngineWeight(rating);
  return std === null ? null : Math.ceil((std / 3) * 2 - 1e-9) / 2;
}

/** Non-fusion engines (TechManual): I.C.E. twice standard fusion weight, fuel cell ×1.2, fission ×1.75 (at least 5 t). */
function scaledEngineWeight(rating: number, factor: number, min = 0): number | null {
  const std = standardFusionEngineWeight(rating);
  return std === null ? null : Math.max(min, Math.ceil(std * factor * 2 - 1e-9) / 2);
}

/** Heat sinks that come free with the engine: fusion 10, fission 5, fuel cell 1, I.C.E. none. */
export function freeHeatSinks(type: EngineType): number {
  return type === 'ice' ? 0 : type === 'fuel-cell' ? 1 : type === 'fission' ? 5 : FREE_HEAT_SINKS;
}

export const isFusion = (type: EngineType) => !['ice', 'fuel-cell', 'fission'].includes(type);

export function engineWeight(type: EngineType, rating: number): number | null {
  if (type === 'ice') return scaledEngineWeight(rating, 2);
  if (type === 'fuel-cell') return scaledEngineWeight(rating, 1.2);
  if (type === 'fission') return scaledEngineWeight(rating, 1.75, 5);
  if (type === 'xl') return xlEngineWeight(rating);
  if (type === 'xxl') return xxlEngineWeight(rating);
  if (type === 'light') return lightEngineWeight(rating);
  if (type === 'compact') return compactEngineWeight(rating);
  return standardFusionEngineWeight(rating);
}

/**
 * Engine critical slots in the center torso: 6, or 3 for a compact engine; a large engine takes 8.
 * In a superheavy 'Mech (two items' worth per slot) these are 3, 2 and 4 (as MegaMek).
 */
export function engineCenterSlots(type: EngineType, superheavy = false, large = false): number {
  if (type === 'compact') return superheavy ? 2 : 3;
  if (large) return superheavy ? 4 : 8;
  return superheavy ? 3 : 6;
}

/** Engine critical slots in each side torso: XL 3 (IS) / 2 (Clan), XXL 6 / 4, Light 2; superheavies half (rounded up). */
export function engineSideTorsoSlots(type: EngineType, techBase: TechBase, superheavy = false): number {
  let n = 0;
  if (type === 'light') n = 2;
  else if (type === 'xxl') n = techBase === 'Clan' ? 4 : 6;
  else if (type === 'xl') n = techBase === 'Clan' ? 2 : 3;
  return superheavy ? Math.ceil(n / 2) : n;
}

/** Gyro weight: standard = rating/100 rounded up; XL half that (to the half ton); heavy-duty double. */
export function gyroWeightFor(type: GyroType, rating: number): number {
  const base = gyroWeight(rating);
  if (type === 'xl') return Math.ceil(base) / 2;
  if (type === 'heavy-duty' || type === 'superheavy') return base * 2;
  if (type === 'compact') return Math.ceil(base * 1.5 * 2) / 2;
  if (type === 'none') return 0;
  return base;
}

export function gyroSlots(type: GyroType): number {
  if (type === 'xl') return 6;
  if (type === 'compact' || type === 'superheavy') return 2;
  if (type === 'none') return 0;
  return 4;
}

/** Cockpit weight: small 2, standard 3, torso-mounted 4, command console 6 (cockpit plus console); superheavy, tripod and QuadVee cockpits as MegaMek. */
export function cockpitWeight(type: EffectiveCockpit): number {
  return {
    small: 2, standard: COCKPIT_WEIGHT, 'torso-mounted': 4, vrrp: 3, 'command-console': 6, industrial: COCKPIT_WEIGHT, primitive: 5,
    'primitive-industrial': 5, interface: 4, superheavy: 4, 'superheavy-industrial': 4, 'superheavy-command-console': 7,
    tripod: 4, 'tripod-industrial': 4, 'superheavy-tripod': 5, 'superheavy-tripod-industrial': 5, quadvee: 4,
  }[type];
}

/** Structure weight as a share of standard structure (10% of tonnage), each rounded up to the half ton. */
const STRUCTURE_WEIGHT_SHARE: Record<StructureType, number> = {
  standard: 1, 'endo-steel': 0.5, 'endo-prototype': 0.5, 'endo-composite': 0.75, composite: 0.5, reinforced: 2, industrial: 2,
};

/**
 * Endo Steel weighs 5% of tonnage, Endo-Composite 7.5%, Composite 5%, Reinforced 20%; rounded up to the half ton.
 * Superheavies (over 100 t) double standard, Endo Steel, Endo-Composite and industrial structure; tripods add 10%.
 */
export function internalStructureWeight(type: StructureType, tonnage: number, tripod = false): number {
  const doubled = tonnage > 100 && ['standard', 'endo-steel', 'endo-composite', 'industrial'].includes(type);
  const share = STRUCTURE_WEIGHT_SHARE[type] * (doubled ? 2 : 1) * (tripod ? 1.1 : 1);
  return Math.ceil(Math.round(tonnage * 0.1 * share * 1e6) / 1e6 * 2 - 1e-9) / 2;
}

/** Critical slots spread-out structure must occupy (anywhere on the mech); superheavies need half (as MegaMek). */
export function structureSlots(type: StructureType, techBase: TechBase, superheavy = false): number {
  const clan = techBase === 'Clan';
  if (type === 'endo-steel') return superheavy ? (clan ? 4 : 7) : clan ? 7 : 14;
  if (type === 'endo-prototype') return superheavy ? 8 : 16;
  if (type === 'endo-composite') return superheavy ? (clan ? 2 : 4) : clan ? 4 : 7;
  return 0;
}

/** Stealth armor takes two fixed slots in each side torso, arm and leg (not spread freely). */
export const STEALTH_LOCATIONS = ['LT', 'RT', 'LA', 'RA', 'LL', 'RL'] as const;

/** Critical slots spread-out armor must occupy (stealth armor's fixed slots are not counted here). */
export function armorSlots(type: ArmorType, techBase: TechBase, superheavy = false): number {
  const n = baseArmorSlots(type, techBase);
  return superheavy ? Math.ceil(n / 2) : n;
}

function baseArmorSlots(type: ArmorType, techBase: TechBase): number {
  const clan = techBase === 'Clan';
  switch (type) {
    case 'ferro-fibrous': return clan ? 7 : 14;
    case 'ferro-prototype': return 16;
    case 'light-ferro': return 7;
    case 'heavy-ferro': return 21;
    case 'reactive': return clan ? 7 : 14;
    case 'reflective': return clan ? 5 : 10;
    case 'ferro-lamellor': return 12;
    case 'ballistic-reinforced': case 'impact-resistant': return 10;
    case 'anti-penetrative': case 'heat-dissipating': return 6;
    default: return 0;
  }
}

/** Slots a patchwork location needs for its armor type (MegaMek's patchwork slot counts). */
export function patchworkSlots(type: ArmorType, techBase: TechBase, superheavy = false): number {
  const n = basePatchworkSlots(type, techBase);
  return superheavy ? Math.ceil(n / 2) : n;
}

function basePatchworkSlots(type: ArmorType, techBase: TechBase): number {
  const clan = techBase === 'Clan';
  switch (type) {
    case 'ferro-fibrous': case 'reactive': case 'reflective': return clan ? 1 : 2;
    case 'ferro-prototype': return 2;
    case 'light-ferro': case 'heat-dissipating': case 'anti-penetrative': return 1;
    case 'heavy-ferro': return 3;
    case 'stealth': case 'ferro-lamellor': case 'impact-resistant': case 'ballistic-reinforced': return 2;
    default: return 0;
  }
}

const ARMOR_PPT_MULTIPLIER: Partial<Record<ArmorType, number>> = {
  'ferro-prototype': 1.12, 'light-ferro': 1.06, 'heavy-ferro': 1.24, hardened: 0.5, 'ferro-lamellor': 0.875, 'ballistic-reinforced': 0.75,
  'anti-penetrative': 0.75, 'heat-dissipating': 0.625, 'impact-resistant': 0.875, commercial: 1.5, industrial: 0.67, primitive: 0.67,
};

/** Armor points per ton: standard 16; Ferro-Fibrous ×1.12 (IS) / ×1.2 (Clan); others by their multiplier. */
export function armorPointsPerTon(type: ArmorType, techBase: TechBase): number {
  if (type === 'ferro-fibrous') return ARMOR_POINTS_PER_TON * (techBase === 'Clan' ? 1.2 : 1.12);
  return ARMOR_POINTS_PER_TON * (ARMOR_PPT_MULTIPLIER[type] ?? 1);
}

/** Display names for structure, engine and armor types. */
export const STRUCTURE_NAMES: Record<StructureType, string> = {
  standard: 'Standard', 'endo-steel': 'Endo Steel', 'endo-prototype': 'Endo Steel Prototype',
  'endo-composite': 'Endo-Composite', composite: 'Composite', reinforced: 'Reinforced', industrial: 'Industrial',
};
export const ENGINE_NAMES: Record<EngineType, string> = {
  standard: 'Fusion', xl: 'XL Fusion', xxl: 'XXL Fusion', light: 'Light Fusion', compact: 'Compact Fusion',
  ice: 'I.C.E.', 'fuel-cell': 'Fuel Cell', fission: 'Fission',
};
export const ARMOR_NAMES: Record<ArmorType, string> = {
  standard: 'Standard', 'ferro-fibrous': 'Ferro-Fibrous', 'ferro-prototype': 'Ferro-Fibrous Prototype', 'light-ferro': 'Light Ferro-Fibrous', 'heavy-ferro': 'Heavy Ferro-Fibrous',
  stealth: 'Stealth', reactive: 'Reactive', reflective: 'Reflective', hardened: 'Hardened', 'ferro-lamellor': 'Ferro-Lamellor',
  'ballistic-reinforced': 'Ballistic-Reinforced', 'anti-penetrative': 'Anti-Penetrative Ablation',
  'heat-dissipating': 'Heat-Dissipating', 'impact-resistant': 'Impact-Resistant',
  commercial: 'Commercial', industrial: 'Industrial', 'heavy-industrial': 'Heavy Industrial', primitive: 'Primitive',
};

/** MASC: IS 1 ton per 20 tons of mech, Clan 1 per 25, rounded to the nearest ton. Slots = tons. */
export function mascWeight(tonnage: number, techBase: TechBase): number {
  return Math.round(tonnage / (techBase === 'Clan' ? 25 : 20));
}

// ---------------------------------------------------------------------------
// Availability of construction options by era and tech base
// ---------------------------------------------------------------------------

export interface ComponentOption {
  /** Name used in messages, e.g. "XL engines". */
  label: string;
  techBase: TechBase | 'Both';
  firstEra: EraId;
  /** When the Clans had it earlier than the Inner Sphere. */
  firstEraClan?: EraId;
}

const opt = (label: string, techBase: TechBase | 'Both', firstEra: EraId, firstEraClan?: EraId): ComponentOption =>
  ({ label, techBase, firstEra, ...(firstEraClan ? { firstEraClan } : {}) });

export const STRUCTURE_OPTIONS: Record<StructureType, ComponentOption> = {
  standard: opt('Standard structure', 'Both', '3025'),
  'endo-steel': opt('Endo Steel structure', 'Both', '3050'),
  'endo-prototype': opt('Endo Steel Prototype structure', 'IS', '3025'),
  'endo-composite': opt('Endo-Composite structure', 'Both', '3062', '3068'),
  composite: opt('Composite structure', 'IS', '3050'),
  reinforced: opt('Reinforced structure', 'Both', '3050'),
  industrial: opt('Industrial structure', 'Both', '3025'),
};
export const ENGINE_OPTIONS: Record<EngineType, ComponentOption> = {
  standard: opt('Standard fusion engines', 'Both', '3025'),
  xl: opt('XL engines', 'Both', '3050'),
  xxl: opt('XXL engines', 'Both', '3050'),
  ice: opt('Internal combustion engines', 'Both', '3025'),
  'fuel-cell': opt('Fuel cell engines', 'Both', '3025'),
  fission: opt('Fission engines', 'Both', '3025'),
  light: opt('Light engines', 'IS', '3062'),
  compact: opt('Compact engines', 'IS', '3068'),
};
export const GYRO_OPTIONS: Record<GyroType, ComponentOption> = {
  standard: opt('Standard gyros', 'Both', '3025'),
  xl: opt('XL gyros', 'IS', '3062'),
  'heavy-duty': opt('Heavy-duty gyros', 'IS', '3062'),
  compact: opt('Compact gyros', 'IS', '3068'),
  // No gyro: only with an interface cockpit.
  none: opt('No gyro (interface cockpit)', 'Both', '3068'),
  // Required on superheavy 'Mechs.
  superheavy: opt('Superheavy gyros', 'IS', '3025'),
};
export const COCKPIT_OPTIONS: Record<CockpitType, ComponentOption> = {
  standard: opt('Standard cockpits', 'Both', '3025'),
  small: opt('Small cockpits', 'Both', '3062', '3081'), // Clan small cockpits from 3080 (as MegaMek)
  'command-console': opt('Command consoles', 'Both', '3025'),
  'torso-mounted': opt('Torso-mounted cockpits', 'Both', '3050'),
  // Virtual-reality piloting pod (Interstellar Operations, 3052): a torso-mounted cockpit, 3 t, BV ×1.4.
  vrrp: opt('Virtual-reality piloting pod', 'IS', '3050'),
  industrial: opt('Industrial cockpits', 'Both', '3025'),
  primitive: opt('Primitive cockpits', 'IS', '3025'),
  interface: opt('Interface cockpits', 'Both', '3068'),
  'primitive-industrial': opt('Primitive industrial cockpits', 'IS', '3025'),
};
export const HEAT_SINK_OPTIONS: Record<HeatSinkType, ComponentOption> = {
  single: opt('Single heat sinks', 'Both', '3025'),
  double: opt('Double heat sinks', 'Both', '3050'),
};
export const ARMOR_OPTIONS: Record<ArmorType, ComponentOption> = {
  standard: opt('Standard armor', 'Both', '3025'),
  'ferro-fibrous': opt('Ferro-Fibrous armor', 'Both', '3050'),
  // Prototype ferro-fibrous (2557; extinct, reintroduced 3034): 16 slots, ×1.12 points per ton.
  'ferro-prototype': opt('Ferro-Fibrous Prototype armor', 'IS', '3025'),
  'light-ferro': opt('Light Ferro-Fibrous armor', 'IS', '3062'),
  'heavy-ferro': opt('Heavy Ferro-Fibrous armor', 'IS', '3068'),
  stealth: opt('Stealth armor', 'IS', '3050'),
  reactive: opt('Reactive armor', 'Both', '3062'),
  reflective: opt('Reflective armor', 'Both', '3050'),
  hardened: opt('Hardened armor', 'Both', '3025', '3050'),
  'ferro-lamellor': opt('Ferro-Lamellor armor', 'Clan', '3068'),
  'impact-resistant': opt('Impact-Resistant armor', 'IS', '3081'),
  'anti-penetrative': opt('Anti-Penetrative Ablation armor', 'IS', '3081'),
  'ballistic-reinforced': opt('Ballistic-Reinforced armor', 'IS', '3101'),
  'heat-dissipating': opt('Heat-Dissipating armor', 'Both', '3101'),
  commercial: opt('Commercial armor', 'Both', '3025'),
  primitive: opt('Primitive armor', 'IS', '3025'),
  industrial: opt('Industrial armor', 'Both', '3025'),
  'heavy-industrial': opt('Heavy industrial armor', 'Both', '3025'),
};
export const JUMP_JET_OPTIONS: Record<JumpJetType, ComponentOption> = {
  standard: opt('Standard jump jets', 'Both', '3025'),
  // Clan improved jump jets date from the 3020s; the Inner Sphere's from the Jihad.
  improved: opt('Improved jump jets', 'Both', '3068', '3050'),
  // Prototype jump jets (2464, extinct by 2471): built as standard jets; +3 to the landing piloting roll.
  prototype: opt('Prototype jump jets', 'Both', '3025'),
  // Prototype improved jump jets (3020; extinct 3069): standard weight, 1 slot, jump to running MP, heat 2 per MP (min 6).
  'prototype-improved': opt('Prototype improved jump jets', 'IS', '3025'),
};
/** Large engines (rated over 400; Tactical Operations). Compact, fuel cell and fission engines have no large version. */
export const LARGE_ENGINE_OPTION = opt('Large engines', 'Both', '3068');
export const LARGE_ICE_OPTION = opt('Large internal combustion engines', 'Both', '3025');
/** Superheavy BattleMechs (IS, 3077); superheavy IndustrialMechs and tripods are older. */
export const SUPERHEAVY_OPTION = opt('Superheavy BattleMechs', 'IS', '3068');
export const SUPERHEAVY_INDUSTRIAL_OPTION = opt('Superheavy IndustrialMechs', 'IS', '3025');
export const TRIPOD_OPTION = opt('Tripod \'Mechs', 'IS', '3025');
export const QUADVEE_OPTION = opt('QuadVees', 'Clan', '3131');

/** Compact heat sinks (Inner Sphere, 3058). */
export const COMPACT_HS_OPTION: ComponentOption = opt('Compact heat sinks', 'IS', '3050');

export const MYOMER_OPTIONS: Record<MyomerType, ComponentOption> = {
  standard: opt('Standard myomer', 'Both', '3025'),
  tsm: opt('Triple-Strength Myomer', 'IS', '3050'),
  'industrial-tsm': opt('Industrial Triple-Strength Myomer', 'IS', '3025'),
  // RISC super-cooled myomer (3133): 6 slots, no movement heat.
  'super-cooled': opt('Super-Cooled Myomer', 'IS', '3131'),
};

export function componentFirstEra(o: ComponentOption, techBase: TechBase = 'IS'): EraId {
  return techBase === 'Clan' && o.firstEraClan ? o.firstEraClan : o.firstEra;
}

export function componentEraOk(o: ComponentOption, era: EraId, techBase: TechBase = 'IS'): boolean {
  return isAvailableIn(componentFirstEra(o, techBase), era);
}

export function componentTechOk(o: ComponentOption, techBase: TechBase, mixedTech: boolean): boolean {
  return o.techBase === 'Both' || o.techBase === techBase || mixedTech;
}

export function componentAvailable(o: ComponentOption, era: EraId, techBase: TechBase, mixedTech: boolean): boolean {
  return componentEraOk(o, era, techBase) && componentTechOk(o, techBase, mixedTech);
}
