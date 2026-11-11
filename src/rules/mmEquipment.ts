/**
 * Battle armor and infantry equipment extracted from MegaMek's equipment definitions (GPL) by
 * tools/extract-megamek-equipment.ts: BA weapons, infantry (personal and support) weapons, BA ammunition,
 * BA and infantry miscellaneous equipment, and BA armor.
 */
import RAW from '../data/megamek-equipment.json';
import type { EraId } from './eras';
import { ERAS, isAvailableIn } from './eras';
import type { TechBase } from './types';

export interface MMItem {
  id: string;
  name: string;
  kind: 'baWeapon' | 'infantryWeapon' | 'misc' | 'ammo' | 'baArmor';
  techBase: TechBase | 'Both';
  introIS: number | null;
  introClan: number | null;
  flags: string[];
  lookups?: string[];
  tonnage?: number | 'variable';
  criticalSlots?: number | 'variable';
  bv?: number | 'variable';
  cost?: number | 'variable';
  heat?: number;
  rackSize?: number;
  damage?: number | string;
  ammoType?: string;
  /** [minimum, short, medium, long, extreme] range. */
  range?: [number, number, number, number, number];
  parent?: string;
  kgPerShot?: number;
  shots?: number;
  damagePerShot?: number;
  // Infantry weapons
  infantryDamage?: number;
  infantryRange?: number;
  crew?: number;
  ammoWeight?: number;
  ammoCost?: number;
  bursts?: number;
  // BA armor / infantry armor kits
  weightPerPoint?: number;
  armorType?: string;
  damageDivisor?: number;
  damageShort?: number;
  damageMedium?: number;
  damageLong?: number;
}

export const MM_EQUIPMENT: readonly MMItem[] = RAW as MMItem[];
const BY_ID = new Map(MM_EQUIPMENT.map((e) => [e.id, e]));
const BY_NAME = new Map<string, MMItem>();
for (const e of MM_EQUIPMENT) {
  for (const n of [e.id, e.name, ...(e.lookups ?? [])]) {
    const k = n.toLowerCase();
    if (!BY_NAME.has(k)) BY_NAME.set(k, e);
  }
}

export function getMM(id: string): MMItem | undefined {
  return BY_ID.get(id);
}

/** Look up by internal name, display name or any MegaMek lookup name (case-insensitive). */
export function findMM(name: string, techBase?: TechBase): MMItem | undefined {
  const k = name.trim().toLowerCase();
  const prefix = techBase === 'Clan' ? 'clan ' : 'is ';
  return BY_NAME.get(k) ?? BY_NAME.get(prefix + k) ?? BY_NAME.get((techBase === 'Clan' ? 'is ' : 'clan ') + k);
}

export const has = (e: MMItem | undefined, flag: string) => !!e?.flags.includes(flag);
export const mmNum = (v: number | 'variable' | undefined) => (typeof v === 'number' ? v : 0);

/** Era an intro year falls in (years before 3020 count as the first era). */
export function eraForYear(year: number): EraId {
  let id: EraId = ERAS[0].id;
  for (const e of ERAS) if (year >= e.year) id = e.id;
  return id;
}

/** Whether an item exists for a tech base in an era (mixed tech allows either tech base). */
export function mmAvailable(e: MMItem, era: EraId, techBase: TechBase, mixedTech = false): boolean {
  if (e.introIS === null && e.introClan === null) return e.techBase === 'Both' || e.techBase === techBase || mixedTech;
  const years = [
    ...(techBase === 'IS' || mixedTech ? [e.introIS] : []),
    ...(techBase === 'Clan' || mixedTech ? [e.introClan] : []),
  ].filter((y): y is number => typeof y === 'number');
  return years.some((y) => isAvailableIn(eraForYear(y), era));
}

/** Short display name: MegaMek's bracketed BA manipulator names become "Battle Claw" etc. */
export function mmName(e: MMItem): string {
  const m = /^BA (?:Manipulators|Manipulator Adaptation) \[(.+)\]$/.exec(e.name);
  return m ? m[1] : e.name.replace(/^BA /, '');
}
