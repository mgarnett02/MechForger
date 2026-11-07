import type { Location, WeightClass } from './types';

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
