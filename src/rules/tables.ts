import type {
  ArmorType, CockpitType, EngineType, GyroType, HeatSinkType, Location, MyomerType, StructureType, TechBase,
  WeightClass,
} from './types';
import type { EraId } from './eras';
import { isAvailableIn } from './eras';

/**
 * Introductory-level construction tables for Inner Sphere BattleMechs
 * (standard fusion engine, standard structure, standard armor,
 * standard gyro and cockpit, single heat sinks).
 */

export const TONNAGES = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

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

export function internalStructure(tonnage: number): Record<Location, number> | null {
  const row = INTERNAL_STRUCTURE[tonnage];
  if (!row) return null;
  const [ct, st, arm, leg] = row;
  return { HD: 3, CT: ct, LT: st, RT: st, LA: arm, RA: arm, LL: leg, RL: leg };
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
  if (tonnage < 20 || tonnage > 100) return null;
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

export function engineWeight(type: EngineType, rating: number): number | null {
  if (type === 'xl') return xlEngineWeight(rating);
  if (type === 'light') return lightEngineWeight(rating);
  return standardFusionEngineWeight(rating);
}

/** Engine critical slots in each side torso: XL 3 (IS) / 2 (Clan), Light 2. */
export function engineSideTorsoSlots(type: EngineType, techBase: TechBase): number {
  if (type === 'light') return 2;
  if (type !== 'xl') return 0;
  return techBase === 'Clan' ? 2 : 3;
}

/** Gyro weight: standard = rating/100 rounded up; XL half that (to the half ton); heavy-duty double. */
export function gyroWeightFor(type: GyroType, rating: number): number {
  const base = gyroWeight(rating);
  if (type === 'xl') return Math.ceil(base) / 2;
  if (type === 'heavy-duty') return base * 2;
  return base;
}

export function gyroSlots(type: GyroType): number {
  return type === 'xl' ? 6 : 4;
}

export function cockpitWeight(type: CockpitType): number {
  return type === 'small' ? 2 : COCKPIT_WEIGHT;
}

/** Endo Steel weighs 5% of tonnage, rounded up to the half ton. */
export function internalStructureWeight(type: StructureType, tonnage: number): number {
  return type === 'endo-steel' ? Math.ceil(tonnage * 0.05 * 2) / 2 : structureWeight(tonnage);
}

/** Critical slots Endo Steel / Ferro-Fibrous must occupy (spread anywhere on the mech). */
export function structureSlots(type: StructureType, techBase: TechBase): number {
  if (type !== 'endo-steel') return 0;
  return techBase === 'Clan' ? 7 : 14;
}

export function armorSlots(type: ArmorType, techBase: TechBase): number {
  if (type === 'light-ferro') return 7;
  if (type !== 'ferro-fibrous') return 0;
  return techBase === 'Clan' ? 7 : 14;
}

/** Armor points per ton: standard 16; Ferro-Fibrous ×1.12 (IS) / ×1.2 (Clan); Light Ferro ×1.06. */
export function armorPointsPerTon(type: ArmorType, techBase: TechBase): number {
  if (type === 'light-ferro') return ARMOR_POINTS_PER_TON * 1.06;
  if (type !== 'ferro-fibrous') return ARMOR_POINTS_PER_TON;
  return ARMOR_POINTS_PER_TON * (techBase === 'Clan' ? 1.2 : 1.12);
}

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
}

const opt = (label: string, techBase: TechBase | 'Both', firstEra: EraId): ComponentOption => ({ label, techBase, firstEra });

export const STRUCTURE_OPTIONS: Record<StructureType, ComponentOption> = {
  standard: opt('Standard structure', 'Both', '3025'),
  'endo-steel': opt('Endo Steel structure', 'Both', '3050'),
};
export const ENGINE_OPTIONS: Record<EngineType, ComponentOption> = {
  standard: opt('Standard fusion engines', 'Both', '3025'),
  xl: opt('XL engines', 'Both', '3050'),
  light: opt('Light engines', 'IS', '3062'),
};
export const GYRO_OPTIONS: Record<GyroType, ComponentOption> = {
  standard: opt('Standard gyros', 'Both', '3025'),
  xl: opt('XL gyros', 'IS', '3062'),
  'heavy-duty': opt('Heavy-duty gyros', 'IS', '3062'),
};
export const COCKPIT_OPTIONS: Record<CockpitType, ComponentOption> = {
  standard: opt('Standard cockpits', 'Both', '3025'),
  small: opt('Small cockpits', 'IS', '3062'),
};
export const HEAT_SINK_OPTIONS: Record<HeatSinkType, ComponentOption> = {
  single: opt('Single heat sinks', 'Both', '3025'),
  double: opt('Double heat sinks', 'Both', '3050'),
};
export const ARMOR_OPTIONS: Record<ArmorType, ComponentOption> = {
  standard: opt('Standard armor', 'Both', '3025'),
  'ferro-fibrous': opt('Ferro-Fibrous armor', 'Both', '3050'),
  'light-ferro': opt('Light Ferro-Fibrous armor', 'IS', '3062'),
};
export const MYOMER_OPTIONS: Record<MyomerType, ComponentOption> = {
  standard: opt('Standard myomer', 'Both', '3025'),
  tsm: opt('Triple-Strength Myomer', 'IS', '3050'),
};

export function componentEraOk(o: ComponentOption, era: EraId): boolean {
  return isAvailableIn(o.firstEra, era);
}

export function componentTechOk(o: ComponentOption, techBase: TechBase, mixedTech: boolean): boolean {
  return o.techBase === 'Both' || o.techBase === techBase || mixedTech;
}

export function componentAvailable(o: ComponentOption, era: EraId, techBase: TechBase, mixedTech: boolean): boolean {
  return componentEraOk(o, era) && componentTechOk(o, techBase, mixedTech);
}
