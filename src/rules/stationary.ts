/**
 * Stationary units and handheld weapons, as MegaMek models them:
 *
 * - **Gun emplacements** (GunEmplacement): weapons and equipment fitted in a building, optionally in a turret.
 *   They have no armor or structure of their own (the building's CF protects them) and no movement, so their BV is
 *   defensive equipment × 0.5 plus weapons, ammunition and offensive equipment × 0.44 (speed factor for 0 MP).
 *   MegaMek gives them no cost; MechForger shows the price of the weapons and equipment.
 * - **Handheld weapons** (HandheldWeapon, TestHandheldWeapon): a self-contained weapon a 'Mech with hands can carry.
 *   Weight = armor (16 points per ton, rounded up to the half ton) + equipment + ammunition (by the shot) +
 *   one-ton heat sinks for the heat of energy weapons that use no ammunition, rounded up to the half ton.
 *   Up to six items (ammunition and weapon enhancements aside), or a single melee weapon; one ammo bin per kind.
 *   BV = armor × 2 + defensive equipment + weapons + ammunition (BV per ton × tons) + offensive equipment.
 *   Cost = twice the cost of the equipment and ammunition (structure is priced as the equipment again).
 *
 * Weapons and equipment come from MechForger's 'Mech catalog.
 */
import type { EraId } from './eras';
import { getEra, isAvailableIn } from './eras';
import type { TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { Equipment } from './equipment';
import { MML_AMMO, getEquipment, isEquipmentAvailable, targetingComputerWeight, usesAmmo } from './equipment';
import { ammoBV, ammoValue, defensiveEquipmentBV, equipmentCost, value, weaponEntries } from './battleValue';
import type { BVBreakdown, CostBreakdown } from './battleValue';
import { DEFENSIVE_IDS } from './values';

export type StationaryKind = 'emplacement' | 'handheld';
export const STATIONARY_KIND_NAMES: Record<StationaryKind, string> = { emplacement: 'Gun emplacement', handheld: 'Handheld weapon' };

export interface StationaryItem {
  uid: string;
  equipmentId: string;
  /** Handheld weapons: shots carried in an ammo bin (bought by the shot). */
  shots?: number;
}

export interface StationaryDesign {
  mulId?: number;
  schemaVersion: 1;
  unitType: 'stationary';
  kind: StationaryKind;
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  /** Gun emplacements: weapons in a turret (fire in any direction). */
  turret: boolean;
  /** Handheld weapons: tonnage. */
  tonnage: number;
  /** Handheld weapons: armor points. */
  armor: number;
  equipment: StationaryItem[];
}

let uidCounter = 0;
export const newStationaryUid = () => `st${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
export const isStationary = (d: unknown): d is StationaryDesign => (d as { unitType?: string })?.unitType === 'stationary';

const kg = (t: number) => Math.round(t * 1000) / 1000;
const halfUp = (t: number) => Math.ceil(kg(t) * 2 - 1e-9) / 2;

/** Weapon enhancements (Artemis, Apollo, PPC capacitors, laser insulators) do not count toward the six items. */
const isEnhancement = (eq: Equipment) => /artemis|apollo|ppc-capacitor|insulator|^rise/.test(eq.id);
/** Shots per ton of an ammo bin's ammunition. */
export function shotsPerTon(eq: Equipment): number {
  const mml = /^ammo-(mml-\d+)-(lrm|srm)/.exec(eq.id);
  if (mml) {
    const row = MML_AMMO.find(([w]) => w === mml[1]);
    if (row) return mml[2] === 'lrm' ? row[1] : row[2];
  }
  return (getEquipment(eq.ammoFor ?? '')?.ammoPerTon ?? 1);
}

/** Weight of one item; handheld ammunition weighs by the shot. */
export function stationaryItemWeight(d: Pick<StationaryDesign, 'kind' | 'techBase' | 'equipment'>, item: StationaryItem, eq = getEquipment(item.equipmentId)): number {
  if (!eq) return 0;
  if (eq.category === 'Ammo' && d.kind === 'handheld') return kg((item.shots ?? 0) / shotsPerTon(eq));
  if (eq.variableWeight === 'targetingComputer') return targetingComputerWeight(eq, { tonnage: 0, techBase: d.techBase, equipment: d.equipment as never });
  return eq.tons;
}

/** Heat sinks a handheld weapon needs: the heat of energy weapons without ammunition, and plasma weapons. */
export function handheldHeatSinks(d: Pick<StationaryDesign, 'equipment'>): number {
  let heat = 0;
  for (const i of d.equipment) {
    const eq = getEquipment(i.equipmentId);
    if (!eq?.isWeapon) continue;
    if ((eq.category === 'Energy' && !usesAmmo(eq)) || /plasma/.test(eq.id)) heat += eq.heat;
  }
  return heat;
}

export interface StationarySummary {
  heatSinks: number;
  weights: { armor: number; heatSinks: number; equipment: number; total: number; free: number };
  /** Handheld weapons: items counting toward the limit of six. */
  itemCount: number;
  weapons: number;
}

export function computeStationary(d: StationaryDesign): StationarySummary {
  const handheld = d.kind === 'handheld';
  let equipment = 0;
  let itemCount = 0;
  let weapons = 0;
  for (const i of d.equipment) {
    const eq = getEquipment(i.equipmentId);
    if (!eq) continue;
    equipment += stationaryItemWeight(d, i, eq);
    if (eq.category !== 'Ammo' && !isEnhancement(eq)) itemCount++;
    if (eq.isWeapon) weapons++;
  }
  const heatSinks = handheld ? handheldHeatSinks(d) : 0;
  const armor = handheld ? halfUp(d.armor / 16) : 0;
  const total = handheld ? halfUp(armor + heatSinks + equipment) : kg(equipment);
  return {
    heatSinks,
    weights: { armor, heatSinks, equipment: kg(equipment), total, free: handheld ? kg(d.tonnage - total) : 0 },
    itemCount, weapons,
  };
}

export interface StationaryIssue { severity: 'error' | 'warning'; message: string }

export function validateStationary(d: StationaryDesign, s = computeStationary(d)): StationaryIssue[] {
  const issues: StationaryIssue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const era = getEra(d.era);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(kg(n)));
  if (d.mixedTech && !isAvailableIn('3050', d.era)) error(`Mixed tech designs cannot be used in the ${era?.name ?? d.era} era.`);
  const reported = new Set<string>();
  for (const i of d.equipment) {
    const eq = getEquipment(i.equipmentId);
    if (!eq) { error(`Unknown equipment "${i.equipmentId}".`); continue; }
    if (eq.capitalClass) error(`${eq.name}: capital weapons cannot be mounted.`);
    if (!isEquipmentAvailable(eq, d.era, d.techBase, d.mixedTech) && !reported.has(eq.id)) {
      reported.add(eq.id);
      error(eq.techBase !== 'Both' && eq.techBase !== d.techBase && !d.mixedTech
        ? `${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[d.techBase]} designs.`
        : `${eq.name} is not available in the ${era?.name ?? d.era} era.`);
    }
    if (eq.category === 'Ammo' && d.kind === 'handheld' && (!Number.isInteger(i.shots) || (i.shots ?? 0) < 1)) error(`${eq.name}: choose how many shots to carry.`);
    if (eq.managed || eq.spread || (eq.variableWeight && eq.variableWeight !== 'targetingComputer')) error(`${eq.name} cannot be fitted to a ${STATIONARY_KIND_NAMES[d.kind].toLowerCase()}.`);
  }
  const items = d.equipment.map((i) => getEquipment(i.equipmentId)).filter((e): e is Equipment => !!e);
  if (d.kind === 'handheld') {
    if (!(d.tonnage > 0) || d.tonnage * 2 !== Math.round(d.tonnage * 2)) error('Handheld weapons weigh a whole or half number of tons.');
    if (!Number.isInteger(d.armor) || d.armor < 0) error('Armor must be a whole number of points.');
    if (s.weights.free < -1e-9) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
    else if (s.weights.free > 1e-9) warn(`${fmt(s.weights.free)} tons unused.`);
    const melee = items.filter((e) => e.melee);
    if (melee.length && items.length > 1) error('A handheld weapon with a melee weapon can have no other items.');
    else if (s.itemCount > 6) error(`A handheld weapon mounts up to 6 items (has ${s.itemCount}).`);
    const kinds = new Set<string>();
    for (const e of items) {
      if (e.category !== 'Ammo') continue;
      const k = e.ammoFor ?? e.id;
      if (kinds.has(k)) { error('Only one ammo bin per kind of ammunition: set its shots instead.'); break; }
      kinds.add(k);
    }
  }
  if (s.weapons === 0) warn('No weapons fitted.');
  for (const e of items) {
    if (e.category !== 'Ammo' || !e.ammoFor) continue;
    if (!items.some((w) => w.id === e.ammoFor)) warn(`${e.name} is carried but no matching weapon is fitted.`);
  }
  return issues;
}

/** Ammo BV of a handheld bin: BV per ton × its weight. */
function handheldAmmoBV(d: StationaryDesign, weapons: ReturnType<typeof weaponEntries>): number {
  const per = new Map<string, number>();
  for (const i of d.equipment) {
    const eq = getEquipment(i.equipmentId);
    if (!eq?.ammoFor || DEFENSIVE_IDS.has(eq.ammoFor)) continue;
    const perTon = ammoValue(eq).bv / (eq.tons || 1);
    per.set(eq.ammoFor, (per.get(eq.ammoFor) ?? 0) + perTon * stationaryItemWeight(d, i, eq));
  }
  let total = 0;
  for (const [id, bv] of per) total += Math.min(bv, weapons.filter((w) => w.id === id).reduce((a, w) => a + w.bv, 0));
  return total;
}

/** Offensive equipment (TAG, C3 and other non-weapon items with a BV of their own). */
function offensiveEquipmentBV(d: StationaryDesign): number {
  return d.equipment.reduce((a, i) => {
    const eq = getEquipment(i.equipmentId);
    if (!eq || eq.isWeapon || eq.category === 'Ammo' || DEFENSIVE_IDS.has(eq.id)) return a;
    return a + (value(eq.id)?.bv ?? 0);
  }, 0);
}

export function stationaryBV(d: StationaryDesign): BVBreakdown {
  const items = d.equipment.map((i) => ({ equipmentId: i.equipmentId, location: 'G' as string | null }));
  const weapons = weaponEntries(items);
  const weaponBV = weapons.reduce((a, w) => a + w.bv, 0);
  const defEquip = defensiveEquipmentBV(items);
  const offEquip = offensiveEquipmentBV(d);
  if (d.kind === 'handheld') {
    const armor = d.armor * 2;
    const ammo = handheldAmmoBV(d, weapons);
    const defensive = armor + defEquip;
    const offensive = weaponBV + ammo + offEquip;
    return {
      total: Math.round(defensive + offensive), defensive, offensive, approximate: false,
      lines: [['Armor (× 2)', armor], ...(defEquip ? [['Defensive equipment', defEquip] as [string, number]] : []), ['Weapons', weaponBV],
        ['Ammunition', ammo], ...(offEquip ? [['Offensive equipment', offEquip] as [string, number]] : [])],
    };
  }
  const ammo = ammoBV(items, weapons);
  const defensive = defEquip * 0.5;
  const sf = 0.44; // speed factor for 0 MP: (1 − 0.5)^1.2
  const offensive = (weaponBV + ammo + offEquip) * sf;
  return {
    total: Math.round(defensive + offensive), defensive, offensive, approximate: false,
    lines: [['Defensive equipment', defEquip], ['Defensive factor', 0.5], ['Weapons', weaponBV], ['Ammunition', ammo],
      ...(offEquip ? [['Offensive equipment', offEquip] as [string, number]] : []), ['Speed factor (0 MP)', sf]],
  };
}

export function stationaryCost(d: StationaryDesign): CostBreakdown {
  // MegaMek prices a handheld weapon's ammo bin at the full per-ton price, whatever its shots.
  const equipment = equipmentCost(d.equipment, (eq) => stationaryItemWeight(d, { uid: '', equipmentId: eq.id }, eq), 0);
  if (d.kind === 'handheld') {
    return { total: Math.round(equipment * 2), approximate: false, lines: [['Structure (as the equipment)', equipment], ['Weapons & equipment', equipment]] };
  }
  return { total: Math.round(equipment), approximate: false, lines: [['Weapons & equipment (the building is priced separately)', equipment]] };
}

// ---------------------------------------------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------------------------------------------

export function newStationary(era: EraId = '3025', techBase: TechBase = 'IS', kind: StationaryKind = 'emplacement'): StationaryDesign {
  return {
    schemaVersion: 1, unitType: 'stationary', kind, era, techBase, mixedTech: false,
    chassis: kind === 'handheld' ? 'New Handheld Weapon' : 'New Gun Emplacement', model: '', turret: true,
    tonnage: 2, armor: 0, equipment: [],
  };
}

export function addStationaryItem(d: StationaryDesign, equipmentId: string): StationaryDesign {
  const eq = getEquipment(equipmentId);
  const handheldAmmo = d.kind === 'handheld' && eq?.category === 'Ammo';
  if (handheldAmmo) {
    const existing = d.equipment.find((i) => getEquipment(i.equipmentId)?.ammoFor === eq!.ammoFor && getEquipment(i.equipmentId)?.category === 'Ammo');
    if (existing) return updateStationaryItem(d, existing.uid, { shots: (existing.shots ?? 0) + Math.round(shotsPerTon(eq!) * eq!.tons) });
  }
  const item: StationaryItem = { uid: newStationaryUid(), equipmentId, ...(handheldAmmo ? { shots: Math.round(shotsPerTon(eq!) * eq!.tons) } : {}) };
  return { ...d, equipment: [...d.equipment, item] };
}

export function updateStationaryItem(d: StationaryDesign, uid: string, patch: Partial<StationaryItem>): StationaryDesign {
  return { ...d, equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, ...patch } : e)) };
}

export function removeStationaryItem(d: StationaryDesign, uid: string): StationaryDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

/** Switch between emplacement and handheld; ammunition changes between bins and shots. */
export function setStationaryKind(d: StationaryDesign, kind: StationaryKind): StationaryDesign {
  if (d.kind === kind) return d;
  const equipment = d.equipment.map((i) => {
    const eq = getEquipment(i.equipmentId);
    if (eq?.category !== 'Ammo') return i;
    const { shots: _s, ...rest } = i;
    return kind === 'handheld' ? { ...rest, shots: Math.round(shotsPerTon(eq) * eq.tons) } : rest;
  });
  return { ...d, kind, equipment };
}

export function parseStationary(raw: unknown): StationaryDesign {
  if (!isStationary(raw)) throw new Error('Not a gun emplacement or handheld weapon design.');
  const r = raw as unknown as Record<string, unknown>;
  const kind: StationaryKind = r.kind === 'handheld' ? 'handheld' : 'emplacement';
  const base = newStationary((getEra(String(r.era))?.id ?? '3025') as EraId, r.techBase === 'Clan' ? 'Clan' : 'IS', kind);
  const n = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  const equipment = Array.isArray(r.equipment) ? r.equipment.flatMap((x) => {
    const e = x as Record<string, unknown>;
    if (typeof e?.equipmentId !== 'string' || !getEquipment(e.equipmentId)) return [];
    return [{ uid: newStationaryUid(), equipmentId: e.equipmentId, ...(typeof e.shots === 'number' ? { shots: e.shots } : {}) }];
  }) : [];
  return {
    ...base,
    ...(typeof r.mulId === 'number' ? { mulId: r.mulId } : {}),
    mixedTech: r.mixedTech === true, chassis: String(r.chassis ?? base.chassis), model: String(r.model ?? ''),
    turret: r.turret !== false, tonnage: n(r.tonnage, 2), armor: n(r.armor, 0), equipment,
  };
}

export function stationaryItemLabel(d: Pick<StationaryDesign, 'kind'>, i: StationaryItem): string {
  const eq = getEquipment(i.equipmentId);
  const name = eq?.name ?? i.equipmentId;
  return eq?.category === 'Ammo' && d.kind === 'handheld' ? `${name.replace(/\s*\(\d+\)$/, '')} (${i.shots ?? 0} shots)` : name;
}

export function stationaryReadout(d: StationaryDesign, s = computeStationary(d)): string {
  const era = getEra(d.era);
  const t = (n: number) => String(kg(n));
  const handheld = d.kind === 'handheld';
  const lines = [
    `${d.chassis} ${d.model}`.trim(), '',
    `Type: ${STATIONARY_KIND_NAMES[d.kind]}${handheld ? `, ${d.tonnage} tons` : d.turret ? ' (turret)' : ''}`,
    `Tech Base: ${d.mixedTech ? `Mixed (${TECH_BASE_NAMES[d.techBase]})` : TECH_BASE_NAMES[d.techBase]}`,
    era ? `Era: ${era.name} (${era.year})` : '',
    `Battle Value: ${stationaryBV(d).total.toLocaleString('en-US')}`,
    `Cost: ${stationaryCost(d).total.toLocaleString('en-US')} C-bills`, '',
    ...(handheld ? [
      `${`Armor: ${d.armor}`.padEnd(34)}${t(s.weights.armor)}`,
      `${`Heat Sinks: ${s.heatSinks}`.padEnd(34)}${t(s.weights.heatSinks)}`, '',
    ] : []),
    `Equipment${' '.repeat(26)}Tons`,
    ...d.equipment.map((i) => `${stationaryItemLabel(d, i).padEnd(35)}${t(stationaryItemWeight(d, i))}`),
  ];
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
