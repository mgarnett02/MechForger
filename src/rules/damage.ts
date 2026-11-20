import type { MechDesign } from './types';
import type { Equipment } from './equipment';
import { equipmentName, getEquipment, isDirectFire } from './equipment';

/**
 * Probable damage of a 'Mech's forward-firing weapons at every range, for the damage chart.
 *
 * Assumptions (Total Warfare): gunnery 4, no movement or terrain modifiers; range modifiers +0 / +2 / +4 at
 * short / medium / long (extreme range not used); +1 per hex inside a weapon's minimum range; pulse lasers −2
 * and a targeting computer −1 for direct-fire weapons. Missiles, cluster weapons and Ultra / Rotary autocannon
 * (at their highest rate of fire) land the average of the Cluster Hits Table; Streaks hit with every missile.
 * LB-X autocannon fire slugs; MMLs fire whichever ammunition does more. Rear-facing and unallocated weapons, melee
 * weapons and weapons that do no direct damage (artillery, Narc, TAG, AMS, machine gun arrays, …) are left out.
 */

/** Target number for the attack before range modifiers: gunnery skill 4. */
export const BASE_TO_HIT = 4;

/** Chance of rolling `target` or more on 2d6. */
export function hitChance(target: number): number {
  if (target <= 2) return 1;
  if (target > 12) return 0;
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= target) n++;
  return n / 36;
}

/** Total Warfare's Cluster Hits Table: hits for each 2d6 roll (2 … 12), by weapon size. */
const CLUSTER_TABLE: Record<number, readonly number[]> = {
  2: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
  3: [1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3],
  4: [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  5: [1, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5],
  6: [2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6],
  7: [2, 2, 3, 4, 4, 4, 4, 6, 6, 7, 7],
  8: [3, 3, 4, 4, 5, 5, 5, 6, 6, 8, 8],
  9: [3, 3, 4, 5, 5, 5, 5, 7, 7, 9, 9],
  10: [3, 3, 4, 6, 6, 6, 6, 8, 8, 10, 10],
  11: [4, 4, 5, 7, 7, 7, 7, 9, 9, 11, 11],
  12: [4, 4, 5, 8, 8, 8, 8, 10, 10, 12, 12],
  13: [4, 4, 5, 8, 8, 8, 8, 11, 11, 13, 13],
  14: [5, 5, 6, 9, 9, 9, 9, 11, 11, 14, 14],
  15: [5, 5, 6, 9, 9, 9, 9, 12, 12, 15, 15],
  16: [5, 5, 7, 10, 10, 10, 10, 13, 13, 16, 16],
  17: [5, 5, 7, 10, 10, 10, 10, 14, 14, 17, 17],
  18: [6, 6, 8, 11, 11, 11, 11, 14, 14, 18, 18],
  19: [6, 6, 8, 11, 11, 11, 11, 15, 15, 19, 19],
  20: [6, 6, 9, 12, 12, 12, 12, 16, 16, 20, 20],
  21: [7, 7, 9, 13, 13, 13, 13, 17, 17, 21, 21],
  22: [7, 7, 9, 14, 14, 14, 14, 18, 18, 22, 22],
  23: [7, 7, 10, 15, 15, 15, 15, 19, 19, 23, 23],
  24: [8, 8, 10, 16, 16, 16, 16, 20, 20, 24, 24],
  25: [8, 8, 10, 16, 16, 16, 16, 21, 21, 25, 25],
  26: [9, 9, 11, 17, 17, 17, 17, 21, 21, 26, 26],
  27: [9, 9, 11, 17, 17, 17, 17, 22, 22, 27, 27],
  28: [9, 9, 11, 17, 17, 17, 17, 23, 23, 28, 28],
  29: [10, 10, 12, 18, 18, 18, 18, 23, 23, 29, 29],
  30: [10, 10, 12, 18, 18, 18, 18, 24, 24, 30, 30],
  40: [12, 12, 18, 24, 24, 24, 24, 32, 32, 40, 40],
};
const ROLL_WAYS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

/** Average hits on the Cluster Hits Table for a weapon of `size` (larger sizes add up columns, as MegaMek). */
export function averageClusterHits(size: number): number {
  if (size <= 1) return size;
  if (size > 40) return averageClusterHits(40) + averageClusterHits(size - 40);
  const col = CLUSTER_TABLE[size] ?? (size > 30 ? CLUSTER_TABLE[40].map((h) => (h * size) / 40) : null);
  if (!col) return size;
  return col.reduce((a, h, i) => a + h * ROLL_WAYS[i], 0) / 36;
}

export type Bracket = 'short' | 'medium' | 'long';
const BRACKET_MOD: Record<Bracket, number> = { short: 0, medium: 2, long: 4 };

/** How a weapon delivers damage when it hits. */
interface Profile {
  /** Damage per hit at each range bracket (most weapons: the same at every range). */
  damage: Record<Bracket, number>;
  /** Missiles / shots per attack, 1 for a single hit; damage is per missile / shot. */
  cluster: number;
  /** Every missile hits (Streak launchers). */
  allHit?: boolean;
  range: { min: number; short: number; medium: number; long: number };
  heat: number;
}

const same = (n: number): Record<Bracket, number> => ({ short: n, medium: n, long: n });
const lastNumber = (s: string) => Number(/(\d+)(?!.*\d)/.exec(s)?.[1] ?? 1);

/** Firing modes of a weapon (an MML has two); none for weapons the chart leaves out. */
export function damageProfiles(eq: Equipment): Profile[] {
  const dmg = eq.damage ?? '';
  const range = eq.range;
  if (!eq.isWeapon || eq.melee || !range || !range.long || eq.artillery) return [];
  const base = { range, heat: eq.heat };
  let m: RegExpExecArray | null;
  if ((m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(dmg))) {
    return [{ ...base, damage: { short: +m[1], medium: +m[2], long: +m[3] }, cluster: 1 }];
  }
  if ((m = /^(\d+) or (\d+)\/missile$/.exec(dmg))) {
    // MML: LRM ammunition (1 per missile, the listed ranges) or SRM ammunition (2 per missile, 3 / 6 / 9).
    const n = lastNumber(eq.name);
    return [
      { ...base, damage: same(+m[1]), cluster: n },
      { ...base, damage: same(+m[2]), cluster: n, range: { min: 0, short: 3, medium: 6, long: 9 } },
    ];
  }
  if ((m = /^(\d+(?:\.\d+)?)\/missile$/.exec(dmg))) {
    return [{ ...base, damage: same(+m[1]), cluster: lastNumber(eq.name), allHit: /streak/.test(eq.id) }];
  }
  if ((m = /^(\d+) \(cluster\)$/.exec(dmg))) {
    // LB-X autocannon fire slugs; other cluster weapons scatter N one-point pieces (SRMs two points each).
    if (/(^|-)lb-\d+x(-prototype)?$/.test(eq.id)) return [{ ...base, damage: same(+m[1]), cluster: 1 }];
    const srm = /srm/.test(eq.id);
    return [{ ...base, damage: same(srm ? 2 : 1), cluster: +m[1], allHit: /streak/.test(eq.id) }];
  }
  if ((m = /^(\d+) \(×(\d+)\)$/.exec(dmg))) {
    // Ultra and Rotary autocannon at full rate: each shot is one hit of the listed damage, at that much heat.
    return [{ ...base, damage: same(+m[1]), cluster: +m[2], heat: eq.heat * +m[2] }];
  }
  if ((m = /^(\d+)[–-](\d+)$/.exec(dmg))) return [{ ...base, damage: same(+m[2]), cluster: 1 }];
  if ((m = /^(\d+(?:\.\d+)?)(?: \+ (?:heat|shutdown))?$/.exec(dmg))) return [{ ...base, damage: same(+m[1]), cluster: 1 }];
  return [];
}

function bracketAt(r: Profile['range'], hex: number): Bracket | null {
  if (hex <= r.short) return 'short';
  if (hex <= r.medium) return 'medium';
  if (hex <= r.long) return 'long';
  return null;
}

export interface WeaponShot {
  uid: string;
  name: string;
  /** Expected damage, and damage if every shot and missile hits. */
  expected: number;
  ideal: number;
  heat: number;
  bracket: Bracket;
}

export interface RangePoint {
  hex: number;
  expected: number;
  ideal: number;
  /** Weapons fired at this range (in heat-neutral mode, the best set the heat sinks can cool). */
  weapons: WeaponShot[];
  /** Weapons in range that were held back to stay heat-neutral. */
  heldBack: number;
  heat: number;
}

export interface DamageProfile {
  points: RangePoint[];
  /** Weapons the chart counts, and those it leaves out (no direct damage, rear-facing or unallocated). */
  counted: number;
  omitted: string[];
  heatBudget: number;
}

/** The best expected damage within the heat budget (0/1 knapsack over whole heat points). */
function bestWithinHeat(shots: WeaponShot[], budget: number): WeaponShot[] {
  const cap = Math.max(0, Math.floor(budget));
  const free = shots.filter((s) => s.heat <= 0);
  const hot = shots.filter((s) => s.heat > 0);
  const best: { value: number; picks: number[] }[] = Array.from({ length: cap + 1 }, () => ({ value: 0, picks: [] }));
  hot.forEach((s, i) => {
    const h = Math.ceil(s.heat);
    for (let c = cap; c >= h; c--) {
      const v = best[c - h].value + s.expected;
      if (v > best[c].value + 1e-9) best[c] = { value: v, picks: [...best[c - h].picks, i] };
    }
  });
  return [...free, ...best[cap].picks.map((i) => hot[i])];
}

/**
 * Expected and ideal damage at every hex from 1 to the longest weapon's long range. With `heatNeutral`, each
 * range fires only the weapons the heat sinks can dissipate (`heatBudget` per turn), picked for the most damage.
 */
export function damageByRange(d: MechDesign, heatBudget: number, heatNeutral: boolean): DamageProfile {
  const tc = d.equipment.some((e) => e.location && getEquipment(e.equipmentId)?.variableWeight === 'targetingComputer');
  const weapons: { uid: string; name: string; eq: Equipment; profiles: Profile[] }[] = [];
  const omitted: string[] = [];
  for (const item of d.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq?.isWeapon || eq.melee) continue;
    const profiles = damageProfiles(eq);
    if (!item.location || item.rear || !profiles.length) omitted.push(equipmentName(eq, d));
    else weapons.push({ uid: item.uid, name: equipmentName(eq, d), eq, profiles });
  }
  const maxRange = Math.max(0, ...weapons.flatMap((w) => w.profiles.map((p) => p.range.long)));
  const points: RangePoint[] = [];
  for (let hex = 1; hex <= maxRange; hex++) {
    const shots: WeaponShot[] = [];
    for (const w of weapons) {
      let pick: WeaponShot | null = null;
      for (const p of w.profiles) {
        const bracket = bracketAt(p.range, hex);
        if (!bracket) continue;
        const mod = BRACKET_MOD[bracket] + Math.max(0, p.range.min - hex + 1)
          + (/pulse/.test(w.eq.id) ? -2 : 0) + (tc && isDirectFire(w.eq) ? -1 : 0);
        const chance = hitChance(BASE_TO_HIT + mod);
        const perHit = p.damage[bracket];
        const hits = p.cluster > 1 && !p.allHit ? averageClusterHits(p.cluster) : p.cluster;
        const shot = { uid: w.uid, name: w.name, expected: chance * hits * perHit, ideal: p.cluster * perHit, heat: p.heat, bracket };
        if (!pick || shot.expected > pick.expected) pick = shot;
      }
      if (pick) shots.push(pick);
    }
    const fired = heatNeutral ? bestWithinHeat(shots, heatBudget) : shots;
    const sum = (k: 'expected' | 'ideal' | 'heat') => fired.reduce((a, s) => a + s[k], 0);
    points.push({
      hex, expected: sum('expected'), ideal: sum('ideal'), heat: sum('heat'),
      weapons: [...fired].sort((a, b) => b.expected - a.expected), heldBack: shots.length - fired.length,
    });
  }
  return { points, counted: weapons.length, omitted, heatBudget };
}
