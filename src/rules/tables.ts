import type {
  ArmorType, CockpitType, EngineType, GyroType, HeatSinkType, JumpJetType, Location, MyomerType, StructureType,
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

export const MIN_ENGINE_RATING = 10;
export const MAX_ENGINE_RATING = 400;
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
};

/** Internal structure per location. On a quad, the front legs (LA/RA) use the leg value. */
export function internalStructure(tonnage: number, quad = false): Record<Location, number> | null {
  const row = INTERNAL_STRUCTURE[tonnage];
  if (!row) return null;
  const [ct, st, arm, leg] = row;
  const front = quad ? leg : arm;
  return { HD: 3, CT: ct, LT: st, RT: st, LA: front, RA: front, LL: leg, RL: leg };
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
  if (tonnage < 10 || tonnage > 100) return null;
  if (tonnage < 20) return 'Ultralight';
  if (tonnage <= 35) return 'Light';
  if (tonnage <= 55) return 'Medium';
  if (tonnage <= 75) return 'Heavy';
  return 'Assault';
}

/** Highest walking MP allowed before the engine rating exceeds the maximum. */
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

/** Engine critical slots in the center torso: 6, or 3 for a compact engine. */
export function engineCenterSlots(type: EngineType): number {
  return type === 'compact' ? 3 : 6;
}

/** Engine critical slots in each side torso: XL 3 (IS) / 2 (Clan), XXL 6 / 4, Light 2. */
export function engineSideTorsoSlots(type: EngineType, techBase: TechBase): number {
  if (type === 'light') return 2;
  if (type === 'xxl') return techBase === 'Clan' ? 4 : 6;
  if (type !== 'xl') return 0;
  return techBase === 'Clan' ? 2 : 3;
}

/** Gyro weight: standard = rating/100 rounded up; XL half that (to the half ton); heavy-duty double. */
export function gyroWeightFor(type: GyroType, rating: number): number {
  const base = gyroWeight(rating);
  if (type === 'xl') return Math.ceil(base) / 2;
  if (type === 'heavy-duty') return base * 2;
  if (type === 'compact') return Math.ceil(base * 1.5 * 2) / 2;
  return base;
}

export function gyroSlots(type: GyroType): number {
  if (type === 'xl') return 6;
  if (type === 'compact') return 2;
  return 4;
}

/** Cockpit weight: small 2, standard 3, torso-mounted 4, command console 6 (cockpit plus console). */
export function cockpitWeight(type: CockpitType): number {
  return { small: 2, standard: COCKPIT_WEIGHT, 'torso-mounted': 4, 'command-console': 6, industrial: COCKPIT_WEIGHT }[type];
}

/** Structure weight as a share of standard structure (10% of tonnage), each rounded up to the half ton. */
const STRUCTURE_WEIGHT_SHARE: Record<StructureType, number> = {
  standard: 1, 'endo-steel': 0.5, 'endo-prototype': 0.5, 'endo-composite': 0.75, composite: 0.5, reinforced: 2, industrial: 2,
};

/** Endo Steel weighs 5% of tonnage, Endo-Composite 7.5%, Composite 5%, Reinforced 20%; rounded up to the half ton. */
export function internalStructureWeight(type: StructureType, tonnage: number): number {
  return Math.ceil(tonnage * 0.1 * STRUCTURE_WEIGHT_SHARE[type] * 2 - 1e-9) / 2;
}

/** Critical slots spread-out structure must occupy (anywhere on the mech). */
export function structureSlots(type: StructureType, techBase: TechBase): number {
  const clan = techBase === 'Clan';
  if (type === 'endo-steel') return clan ? 7 : 14;
  if (type === 'endo-prototype') return 16;
  if (type === 'endo-composite') return clan ? 4 : 7;
  return 0;
}

/** Stealth armor takes two fixed slots in each side torso, arm and leg (not spread freely). */
export const STEALTH_LOCATIONS = ['LT', 'RT', 'LA', 'RA', 'LL', 'RL'] as const;

/** Critical slots spread-out armor must occupy (stealth armor's fixed slots are not counted here). */
export function armorSlots(type: ArmorType, techBase: TechBase): number {
  const clan = techBase === 'Clan';
  switch (type) {
    case 'ferro-fibrous': return clan ? 7 : 14;
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

const ARMOR_PPT_MULTIPLIER: Partial<Record<ArmorType, number>> = {
  'light-ferro': 1.06, 'heavy-ferro': 1.24, hardened: 0.5, 'ferro-lamellor': 0.875, 'ballistic-reinforced': 0.75,
  'anti-penetrative': 0.75, 'heat-dissipating': 0.625, 'impact-resistant': 0.875, commercial: 1.5, industrial: 0.67,
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
  standard: 'Standard', 'ferro-fibrous': 'Ferro-Fibrous', 'light-ferro': 'Light Ferro-Fibrous', 'heavy-ferro': 'Heavy Ferro-Fibrous',
  stealth: 'Stealth', reactive: 'Reactive', reflective: 'Reflective', hardened: 'Hardened', 'ferro-lamellor': 'Ferro-Lamellor',
  'ballistic-reinforced': 'Ballistic-Reinforced', 'anti-penetrative': 'Anti-Penetrative Ablation',
  'heat-dissipating': 'Heat-Dissipating', 'impact-resistant': 'Impact-Resistant',
  commercial: 'Commercial', industrial: 'Industrial', 'heavy-industrial': 'Heavy Industrial',
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
};
export const COCKPIT_OPTIONS: Record<CockpitType, ComponentOption> = {
  standard: opt('Standard cockpits', 'Both', '3025'),
  small: opt('Small cockpits', 'Both', '3062', '3081'), // Clan small cockpits from 3080 (as MegaMek)
  'command-console': opt('Command consoles', 'Both', '3025'),
  'torso-mounted': opt('Torso-mounted cockpits', 'Both', '3050'),
  industrial: opt('Industrial cockpits', 'Both', '3025'),
};
export const HEAT_SINK_OPTIONS: Record<HeatSinkType, ComponentOption> = {
  single: opt('Single heat sinks', 'Both', '3025'),
  double: opt('Double heat sinks', 'Both', '3050'),
};
export const ARMOR_OPTIONS: Record<ArmorType, ComponentOption> = {
  standard: opt('Standard armor', 'Both', '3025'),
  'ferro-fibrous': opt('Ferro-Fibrous armor', 'Both', '3050'),
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
  industrial: opt('Industrial armor', 'Both', '3025'),
  'heavy-industrial': opt('Heavy industrial armor', 'Both', '3025'),
};
export const JUMP_JET_OPTIONS: Record<JumpJetType, ComponentOption> = {
  standard: opt('Standard jump jets', 'Both', '3025'),
  // Clan improved jump jets date from the 3020s; the Inner Sphere's from the Jihad.
  improved: opt('Improved jump jets', 'Both', '3068', '3050'),
};
export const MYOMER_OPTIONS: Record<MyomerType, ComponentOption> = {
  standard: opt('Standard myomer', 'Both', '3025'),
  tsm: opt('Triple-Strength Myomer', 'IS', '3050'),
  'industrial-tsm': opt('Industrial Triple-Strength Myomer', 'IS', '3025'),
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
