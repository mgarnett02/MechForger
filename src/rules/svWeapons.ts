/**
 * Infantry weapons mounted on support vehicles (TechManual p.130, as MegaMek): each weighs what the
 * weapon does, carries one ammunition clip for free, and buys more clips at the weapon's ammo weight
 * and cost. Small support vehicles can mount nothing else. Figures come from MegaMek's equipment data.
 */
import type { Equipment, EquipmentCategory } from './equipment';
import type { ItemValue } from './values';
import { MM_EQUIPMENT, eraForYear, mmNum } from './mmEquipment';
import type { MMItem } from './mmEquipment';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** MechForger id of a MegaMek infantry weapon. */
export const svWeaponId = (mmId: string) => `inf-${slug(mmId)}`;

const category = (e: MMItem): EquipmentCategory =>
  e.flags.includes('F_ENERGY') ? 'Energy' : e.flags.includes('F_MISSILE') ? 'Missile' : 'Ballistic';

const firstYear = (e: MMItem) => Math.min(...[e.introIS, e.introClan].filter((y): y is number => typeof y === 'number'), 9999);

/** Archaic (melee and muscle-powered) weapons cannot be vehicle-mounted (as MegaMek). */
const SOURCE = MM_EQUIPMENT.filter((e) => e.kind === 'infantryWeapon' && !e.flags.includes('F_INF_ARCHAIC'));

export const SV_INFANTRY_WEAPONS: Equipment[] = SOURCE.map((e): Equipment => {
  const r = e.range ?? [0, 0, 0, 0];
  return {
    id: svWeaponId(e.id),
    name: e.name,
    category: category(e),
    tons: mmNum(e.tonnage),
    slots: 1,
    heat: 0,
    isWeapon: true,
    damage: e.infantryDamage !== undefined ? `${e.infantryDamage} (inf.)` : undefined,
    range: { min: 0, short: r[1] ?? 0, medium: r[2] ?? 0, long: r[3] ?? 0 },
    techBase: e.techBase === 'Both' ? 'Both' : e.techBase === 'Clan' ? 'Clan' : 'IS',
    firstEra: eraForYear(firstYear(e)),
    infantryWeapon: true,
    ...(e.flags.includes('F_INF_SUPPORT') ? { infantrySupport: true } : {}),
  };
});

/** BV and cost of each support vehicle infantry weapon (MegaMek). */
export const SV_WEAPON_VALUES: Record<string, ItemValue> = Object.fromEntries(
  SOURCE.map((e) => [svWeaponId(e.id), { bv: mmNum(e.bv), cost: mmNum(e.cost) }]),
);

const BY_ID = new Map(SOURCE.map((e) => [svWeaponId(e.id), e]));

/** Extra ammunition clips beyond the free first one: weight (to the kilogram) and cost. */
export function svClipExtras(id: string, clips: number | undefined): { tons: number; cost: number } {
  const e = BY_ID.get(id);
  const extra = Math.max(0, Math.round(clips ?? 1) - 1);
  if (!e || !extra) return { tons: 0, cost: 0 };
  return { tons: Math.ceil(extra * (e.ammoWeight ?? 0) * 1000 - 1e-6) / 1000, cost: Math.floor(extra * (e.ammoCost ?? 0)) };
}
