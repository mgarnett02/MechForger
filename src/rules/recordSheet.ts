/**
 * Data for printable record sheets (layout lives in src/ui/print). Kept free of
 * React so the rows can be unit-tested.
 */
import type { MechDesign } from './types';
import { LOCATIONS, locationAbbr } from './types';
import type { Equipment } from './equipment';
import { getEquipment, itemWeight, shortEquipmentName } from './equipment';
import { meleeDamage } from './melee';
import type { FighterDesign } from './fighter';
import { fighterItemWeight } from './fighter';
import { AERO_AV } from './aeroAV';
import type { VesselDesign, VesselItem } from './vessel';
import { computeVessel, shotsPerBin, vesselItemWeight } from './vessel';
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
    // A set of talons spans every leg: one row.
    label: e.equipmentId === 'talons' ? 'Legs' : e.location ? locationAbbr(d, e.location) : '—',
    order: e.location ? MECH_ORDER[e.location] : 99,
    rear: !!e.rear,
  }));
  const weapons = groups.filter((g) => g.eq.isWeapon || g.eq.melee).map((g) => {
    const row = weaponRow(g, shortEquipmentName(g.eq, d), true, false);
    if (!g.eq.melee) return row;
    // Melee weapons: no heat, adjacent-hex only; a talon set is one item.
    return { ...row, qty: g.eq.melee === 'talons' ? 1 : row.qty, heat: '—', damage: meleeDamage(g.eq.melee, d.tonnage) };
  });
  const equipment = groups
    .filter((g) => !g.eq.isWeapon && !g.eq.melee && g.eq.category !== 'Ammo')
    .map((g) => ({ qty: g.count, name: shortEquipmentName(g.eq, d), location: g.location, tons: itemWeight(g.eq, d) * g.count }));
  const ammo = placed
    .map((e) => ({ e, eq: getEquipment(e.equipmentId)! }))
    .filter(({ eq }) => eq.category === 'Ammo')
    .sort((a, b) => (MECH_ORDER[a.e.location ?? ''] ?? 99) - (MECH_ORDER[b.e.location ?? ''] ?? 99))
    .map(({ e, eq }) => ({ name: shortEquipmentName(eq, d), location: e.location ? locationAbbr(d, e.location) : '—', shots: ammoShots(eq) }));
  return { weapons, equipment, ammo };
}

const VEHICLE_ORDER: Record<string, number> = { FR: 0, LS: 1, RS: 2, RR: 3, TU: 4, BD: 5 };

export function vehicleSheetData(d: VehicleDesign): SheetData {
  const locName = (l: string | null) => (l === 'TU' ? turretName(d) : l ? VEHICLE_LOCATION_NAMES[l as keyof typeof VEHICLE_LOCATION_NAMES] : '—');
  const groups = group(d.equipment, (e) => ({ label: locName(e.location), order: VEHICLE_ORDER[e.location ?? ''] ?? 99, rear: false }));
  const weapons = groups.filter((g) => g.eq.isWeapon).map((g) => weaponRow(g, shortEquipmentName(g.eq, d), true, true));
  const equipment = groups
    .filter((g) => !g.eq.isWeapon && g.eq.category !== 'Ammo')
    .map((g) => ({ qty: g.count, name: shortEquipmentName(g.eq, d), location: g.location, tons: vehicleItemWeight(g.eq, d) * g.count }));
  const ammo = d.equipment
    .map((e) => getEquipment(e.equipmentId))
    .filter((eq): eq is Equipment => !!eq && eq.category === 'Ammo')
    .map((eq) => ({ name: shortEquipmentName(eq, d), location: 'Body', shots: ammoShots(eq) }));
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

export interface FighterWeaponRow {
  qty: number;
  name: string;
  location: string;
  heat: string;
  /** Attack value per bracket: short, medium, long, extreme ("—" when out of range). */
  av: [string, string, string, string];
}

export function fighterSheetData(d: FighterDesign): { weapons: FighterWeaponRow[]; equipment: EquipmentRow[]; ammo: AmmoRow[] } {
  const order: Record<string, number> = { NOS: 0, LWG: 1, RWG: 2, AFT: 3, FUS: 4 };
  const groups = group(d.equipment, (e) => ({ label: e.location ?? '—', order: order[e.location ?? ''] ?? 9, rear: !!e.rear }));
  const weapons = groups.filter((g) => g.eq.isWeapon).map((g): FighterWeaponRow => {
    const av = AERO_AV[g.eq.id] ?? [0, 0, 0, 0];
    return {
      qty: g.count,
      name: shortEquipmentName(g.eq, d) + (g.rear ? ' (R)' : ''),
      location: g.location,
      heat: String(g.eq.heat * g.count),
      av: av.map((v) => (v ? String(v * g.count) : '—')) as FighterWeaponRow['av'],
    };
  });
  const equipment = groups
    .filter((g) => !g.eq.isWeapon && g.eq.category !== 'Ammo')
    .map((g) => ({ qty: g.count, name: shortEquipmentName(g.eq, d), location: g.location, tons: fighterItemWeight(g.eq, d) * g.count }));
  const ammo = d.equipment
    .map((e) => getEquipment(e.equipmentId))
    .filter((eq): eq is Equipment => !!eq && eq.category === 'Ammo')
    .map((eq) => ({ name: shortEquipmentName(eq, d), location: 'FUS', shots: ammoShots(eq) }));
  return { weapons, equipment, ammo };
}

export interface VesselBayRow {
  name: string;
  /** Capital-scale attack values. */
  capital: boolean;
  location: string;
  heat: number;
  av: [string, string, string, string];
}

/** One row per weapon bay: its weapons, total heat and summed attack values per bracket. */
export function vesselSheetData(d: VesselDesign): { bays: VesselBayRow[]; equipment: EquipmentRow[]; ammo: AmmoRow[] } {
  const bays = computeVessel(d).weaponBays.map((g): VesselBayRow => {
    const counts = new Map<string, number>();
    const av = [0, 0, 0, 0];
    let heat = 0;
    let capital = false;
    for (const item of g.items) {
      const eq = getEquipment(item.equipmentId)!;
      const name = shortEquipmentName(eq, d);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      heat += eq.heat;
      if (eq.capitalClass) capital = true;
      (AERO_AV[eq.id] ?? [0, 0, 0, 0]).forEach((v, i) => { av[i] += v; });
    }
    const name = [...counts].map(([n, c]) => (c > 1 ? `${c} ${n}` : n)).join(', ');
    // Capital bays are printed in capital scale (standard AV ÷ 10).
    const shown = capital ? av.map((v) => Math.round(v / 10)) : av;
    return { name, location: g.arc + (g.rear ? ' (R)' : ''), heat, capital, av: shown.map((v) => (v ? String(v) : '—')) as VesselBayRow['av'] };
  });
  const equipment = group(
    d.equipment.filter((e) => { const eq = getEquipment(e.equipmentId); return eq && !eq.isWeapon && eq.category !== 'Ammo'; }),
    (e) => ({ label: e.location ?? '—', order: 0, rear: false }),
  ).map((g) => ({ qty: g.count, name: shortEquipmentName(g.eq, d), location: g.location, tons: vesselItemWeight(g.eq, d) * g.count }));
  const ammo = d.equipment
    .map((e) => ({ e, eq: getEquipment(e.equipmentId) }))
    .filter((x): x is { e: VesselItem; eq: Equipment } => !!x.eq && x.eq.category === 'Ammo')
    .map(({ e, eq }) => ({ name: shortEquipmentName(eq, d).replace(/\s*\(\d+\)$/, ''), location: e.location ?? '—', shots: e.shots ?? shotsPerBin(eq) }))
    // Bins of the same ammunition in the same arc share one line.
    .reduce<AmmoRow[]>((rows, a) => {
      const same = rows.find((r) => r.name === a.name && r.location === a.location);
      if (same) same.shots += a.shots; else rows.push(a);
      return rows;
    }, []);
  return { bays, equipment, ammo };
}
