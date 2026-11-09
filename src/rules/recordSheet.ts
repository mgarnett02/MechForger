/**
 * Data for printable record sheets (layout lives in src/ui/print). Kept free of
 * React so the rows can be unit-tested.
 */
import type { MechDesign } from './types';
import { LOCATIONS } from './types';
import type { Equipment } from './equipment';
import { equipmentName, getEquipment, itemWeight } from './equipment';
import type { VehicleDesign } from './vehicle';
import { VEHICLE_LOCATION_NAMES, turretName, vehicleItemWeight } from './vehicle';

export interface WeaponRow {
  qty: number;
  name: string;
  location: string;
  heat: string;
  damage: string;
  min: string;
  short: string;
  medium: string;
  long: string;
}

export interface AmmoRow {
  name: string;
  location: string;
  shots: number;
}

export interface EquipmentRow {
  qty: number;
  name: string;
  location: string;
  tons: number;
}

const dash = (n: number | undefined) => (n ? String(n) : '—');

/** Shots per bin, read from the ammo name's trailing "(N)". */
export function ammoShots(eq: Equipment): number {
  const m = /\((\d+)\)\s*$/.exec(eq.name);
  return m ? Number(m[1]) : 0;
}

const MECH_ORDER = Object.fromEntries(LOCATIONS.map((l, i) => [l, i]));

interface Grouped<T> {
  key: string;
  eq: Equipment;
  location: string;
  order: number;
  rear: boolean;
  count: number;
  sample: T;
}

function group<T extends { equipmentId: string }>(
  items: T[],
  loc: (item: T) => { label: string; order: number; rear: boolean },
): Grouped<T>[] {
  const map = new Map<string, Grouped<T>>();
  for (const item of items) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    const l = loc(item);
    const key = `${eq.id}|${l.label}|${l.rear}`;
    const g = map.get(key);
    if (g) g.count++;
    else map.set(key, { key, eq, location: l.label, order: l.order, rear: l.rear, count: 1, sample: item });
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.eq.name.localeCompare(b.eq.name));
}

function weaponRow(g: Grouped<unknown>, name: string, showHeat: boolean, vehicle: boolean): WeaponRow {
  const r = g.eq.range;
  // On vehicles only energy weapons generate heat.
  const heat = !showHeat ? '' : vehicle && g.eq.category !== 'Energy' ? '0' : String(g.eq.heat);
  return {
    qty: g.count,
    name: g.rear ? `${name} (R)` : name,
    location: g.location,
    heat,
    damage: g.eq.damage ?? '—',
    min: r ? dash(r.min) : '—',
    short: r ? String(r.short) : '—',
    medium: r ? String(r.medium) : '—',
    long: r ? dash(r.long) : '—',
  };
}

export interface SheetData {
  weapons: WeaponRow[];
  equipment: EquipmentRow[];
  ammo: AmmoRow[];
}

export function mechSheetData(d: MechDesign): SheetData {
  const placed = d.equipment.filter((e) => {
    const eq = getEquipment(e.equipmentId);
    return eq && !eq.managed;
  });
  const groups = group(placed, (e) => ({
    label: e.location ?? '—',
    order: e.location ? MECH_ORDER[e.location] : 99,
    rear: !!e.rear,
  }));
  const weapons = groups.filter((g) => g.eq.isWeapon).map((g) => weaponRow(g, equipmentName(g.eq, d), true, false));
  const equipment = groups
    .filter((g) => !g.eq.isWeapon && g.eq.category !== 'Ammo')
    .map((g) => ({ qty: g.count, name: equipmentName(g.eq, d), location: g.location, tons: itemWeight(g.eq, d) * g.count }));
  const ammo = placed
    .map((e) => ({ e, eq: getEquipment(e.equipmentId)! }))
    .filter(({ eq }) => eq.category === 'Ammo')
    .sort((a, b) => (MECH_ORDER[a.e.location ?? ''] ?? 99) - (MECH_ORDER[b.e.location ?? ''] ?? 99))
    .map(({ e, eq }) => ({ name: equipmentName(eq, d), location: e.location ?? '—', shots: ammoShots(eq) }));
  return { weapons, equipment, ammo };
}

const VEHICLE_ORDER: Record<string, number> = { FR: 0, LS: 1, RS: 2, RR: 3, TU: 4, BD: 5 };

export function vehicleSheetData(d: VehicleDesign): SheetData {
  const locName = (l: string | null) => (l === 'TU' ? turretName(d) : l ? VEHICLE_LOCATION_NAMES[l as keyof typeof VEHICLE_LOCATION_NAMES] : '—');
  const groups = group(d.equipment, (e) => ({ label: locName(e.location), order: VEHICLE_ORDER[e.location ?? ''] ?? 99, rear: false }));
  const weapons = groups.filter((g) => g.eq.isWeapon).map((g) => weaponRow(g, equipmentName(g.eq, d), true, true));
  const equipment = groups
    .filter((g) => !g.eq.isWeapon && g.eq.category !== 'Ammo')
    .map((g) => ({ qty: g.count, name: equipmentName(g.eq, d), location: g.location, tons: vehicleItemWeight(g.eq, d) * g.count }));
  const ammo = d.equipment
    .map((e) => getEquipment(e.equipmentId))
    .filter((eq): eq is Equipment => !!eq && eq.category === 'Ammo')
    .map((eq) => ({ name: equipmentName(eq, d), location: 'Body', shots: ammoShots(eq) }));
  return { weapons, equipment, ammo };
}

/** BattleMech heat scale effects (TechManual / Total Warfare heat scale). */
export const HEAT_SCALE: Record<number, string> = {
  30: 'Shutdown',
  28: 'Ammo explosion, avoid on 8+',
  26: 'Shutdown, avoid on 10+',
  25: '−5 Movement Points',
  24: '+4 Modifier to Fire',
  23: 'Ammo explosion, avoid on 6+',
  22: 'Shutdown, avoid on 8+',
  20: '−4 Movement Points',
  19: 'Ammo explosion, avoid on 4+',
  18: 'Shutdown, avoid on 6+',
  17: '+3 Modifier to Fire',
  15: '−3 Movement Points',
  14: 'Shutdown, avoid on 4+',
  13: '+2 Modifier to Fire',
  10: '−2 Movement Points',
  8: '+1 Modifier to Fire',
  5: '−1 Movement Points',
};

/** MechWarrior consciousness rolls by hits taken (6 = killed). */
export const CONSCIOUSNESS = ['3', '5', '7', '10', '11', 'Dead'];
