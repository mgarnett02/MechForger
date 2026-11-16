/**
 * ProtoMech construction (TechManual / Interstellar Operations, as implemented by MegaMek's TestProtoMek),
 * Battle Value (ProtoMekBVCalculator) and cost (ProtoMekCostCalculator).
 *
 * Equipment comes from MegaMek's catalog (weapons flagged as ProtoMech weapons, ProtoMech equipment and
 * ammunition), read by tools/extract-megamek-equipment.ts.
 */
import type { EraId } from './eras';
import { getEra, isAvailableIn } from './eras';
import type { TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { MMItem } from './mmEquipment';
import { MM_EQUIPMENT, eraForYear, getMM, has, mmAvailable, mmName, mmNum } from './mmEquipment';
import { standardFusionEngineWeight } from './tables';
import { speedFactor, targetMovementModifier } from './battleValue';

export type ProtoMotion = 'biped' | 'quad' | 'glider';
export const PROTO_MOTION_NAMES: Record<ProtoMotion, string> = { biped: 'Biped', quad: 'Quad', glider: 'Glider (WiGE)' };

/** Head, torso, arms, legs, main gun; BD (body) holds ammo, jump jets and other slotless equipment. */
export const PROTO_LOCATIONS = ['HD', 'TO', 'RA', 'LA', 'LG', 'MG', 'BD'] as const;
export type ProtoLocation = (typeof PROTO_LOCATIONS)[number];
export type ProtoArmorLocation = Exclude<ProtoLocation, 'BD'>;
export const PROTO_ARMOR_LOCATIONS: readonly ProtoArmorLocation[] = ['HD', 'TO', 'RA', 'LA', 'LG', 'MG'];
export const PROTO_LOCATION_NAMES: Record<ProtoLocation, string> = {
  HD: 'Head', TO: 'Torso', RA: 'Right Arm', LA: 'Left Arm', LG: 'Legs', MG: 'Main Gun', BD: 'Body',
};

export const PROTO_STANDARD_ARMOR = 'Standard ProtoMech';
export const PROTO_EDP_ARMOR = 'Clan Electric Discharge ProtoMech';

export interface ProtoItem {
  uid: string;
  equipmentId: string;
  location: ProtoLocation | null;
  /** Ammunition: shots carried (ProtoMech ammo is bought by the shot). */
  shots?: number;
  /** Rear-firing (torso only). */
  rear?: boolean;
}

export interface ProtoMechDesign {
  mulId?: number;
  schemaVersion: 1;
  unitType: 'protomech';
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  /** 2–9 tons; 10–15 tons is an ultraheavy ProtoMech. */
  tonnage: number;
  motion: ProtoMotion;
  walkMP: number;
  armorId: string;
  /** Interface cockpit (an IS option for non-Clan pilots). */
  interfaceCockpit?: boolean;
  armor: Record<ProtoArmorLocation, number>;
  equipment: ProtoItem[];
}

let uidCounter = 0;
export const newProtoUid = () => `pm${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
export const isProtoMech = (d: unknown): d is ProtoMechDesign => (d as { unitType?: string })?.unitType === 'protomech';

// ---------------------------------------------------------------------------------------------------------------
// Tables (TestProtoMek, ProtoMek)
// ---------------------------------------------------------------------------------------------------------------

export const PROTO_MIN_TONNAGE = 2;
export const PROTO_MAX_STANDARD = 9;
export const PROTO_MAX_TONNAGE = 15;
const kg = (t: number) => Math.round(t * 1000) / 1000;
const kgUp = (t: number) => Math.ceil(t * 1000 - 1e-6) / 1000;

export const isUltraheavy = (d: Pick<ProtoMechDesign, 'tonnage'>) => d.tonnage > PROTO_MAX_STANDARD;
export const isQuadProto = (d: Pick<ProtoMechDesign, 'motion'>) => d.motion === 'quad';
export const isGlider = (d: Pick<ProtoMechDesign, 'motion'>) => d.motion === 'glider';
export const hasMainGun = (d: Pick<ProtoMechDesign, 'equipment'>) => d.equipment.some((e) => e.location === 'MG');

/** Engine rating: running MP (minus 2 for quads and gliders) × tonnage, rounded up to 5 above 40. */
export function protoEngineRating(d: Pick<ProtoMechDesign, 'walkMP' | 'tonnage' | 'motion'>): number {
  const move = Math.ceil(d.walkMP * 1.5) - (d.motion === 'biped' ? 0 : 2);
  const rating = move * d.tonnage;
  return rating > 40 ? Math.ceil(rating / 5) * 5 : rating;
}

/** Engine weight: 25 kg per rating point under 40, else the standard fusion table. */
export function protoEngineWeight(rating: number): number | null {
  if (rating < 40) return kg(rating * 0.025);
  return standardFusionEngineWeight(rating);
}

export function protoStructure(d: Pick<ProtoMechDesign, 'tonnage' | 'motion' | 'equipment'>): Record<ProtoArmorLocation, number> {
  const t = Math.floor(d.tonnage);
  const head = t <= 5 ? 1 : t <= 9 ? 2 : t <= 13 ? 3 : 4;
  const band = t <= 3 ? 0 : t <= 5 ? 1 : t <= 7 ? 2 : t <= 9 ? 3 : t <= 11 ? 4 : t <= 13 ? 5 : 6;
  const legs = (d.motion === 'quad' ? [4, 5, 8, 9, 12, 13, 14] : [2, 3, 4, 5, 6, 7, 8])[band];
  const arm = d.motion === 'quad' ? 0 : head;
  return { HD: head, TO: t, RA: arm, LA: arm, LG: legs, MG: hasMainGun(d) ? (d.tonnage > 9 ? 2 : 1) : 0 };
}

const MAX_ARMOR_FACTOR = [15, 17, 22, 24, 33, 35, 40, 42, 51, 53, 58, 60, 65, 67];
/** Total armor allowed: by tonnage, plus 3 (6 ultraheavy) with a main gun. */
export function protoMaxArmorTotal(d: Pick<ProtoMechDesign, 'tonnage' | 'equipment'>): number {
  const base = MAX_ARMOR_FACTOR[Math.min(Math.max(0, Math.floor(d.tonnage) - 2), MAX_ARMOR_FACTOR.length - 1)];
  return base + (hasMainGun(d) ? (d.tonnage > 9 ? 6 : 3) : 0);
}

export function protoMaxArmor(d: Pick<ProtoMechDesign, 'tonnage' | 'motion' | 'equipment'>, loc: ProtoArmorLocation): number {
  const is = protoStructure(d);
  if (loc === 'HD') return 2 + Math.floor(d.tonnage / 2);
  if (loc === 'MG') return hasMainGun(d) ? is.MG * 3 : 0;
  if (loc === 'RA' || loc === 'LA') return d.motion === 'quad' ? 0 : d.tonnage < 6 ? 2 : d.tonnage < 10 ? 4 : 6;
  return is[loc] * 2;
}

/** Equipment slots per location (ammo, jump jets, myomer booster, UMUs and the EI interface take none). */
export function protoSlotLimit(d: Pick<ProtoMechDesign, 'tonnage' | 'motion'>, loc: ProtoLocation): number {
  const quad = d.motion === 'quad';
  const ultra = d.tonnage > PROTO_MAX_STANDARD;
  if (loc === 'TO') { const s = ultra ? 3 : 2; return quad ? s * 2 : s; }
  if (loc === 'RA' || loc === 'LA') return quad ? 0 : 1;
  if (loc === 'MG') return quad && ultra ? 2 : 1;
  return 0;
}

/** Weight limit per location (the main gun has none). */
export function protoWeightLimit(d: Pick<ProtoMechDesign, 'tonnage' | 'motion'>, loc: ProtoLocation): number {
  const quad = d.motion === 'quad';
  const ultra = d.tonnage > PROTO_MAX_STANDARD;
  if (loc === 'TO') return quad ? (ultra ? 8 : 5) : ultra ? 4 : 2;
  if (loc === 'RA' || loc === 'LA') return quad ? 0 : ultra ? 1 : 0.5;
  if (loc === 'MG') return Infinity;
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------------------------------------------

export const protoArmorTypes = (): MMItem[] => MM_EQUIPMENT.filter((e) => e.kind === 'protoArmor');
export const isProtoWeapon = (e: MMItem | undefined) => has(e, 'F_PROTO_WEAPON');
const isWeapon = (e: MMItem | undefined) => !!e && (e.kind === 'protoWeapon' || e.kind === 'baWeapon' || e.kind === 'infantryWeapon');
/** Items that need no slot and go in the body. */
export const isSlotless = (e: MMItem | undefined) => !!e && (e.kind === 'ammo' || has(e, 'F_MASC') || has(e, 'F_UMU')
  || has(e, 'F_JUMP_JET') || has(e, 'F_EI_INTERFACE'));
export const isJumpJet = (e: MMItem | undefined) => has(e, 'F_JUMP_JET');

/** Weapons and equipment a ProtoMech may mount. */
export function protoEquipment(): MMItem[] {
  return MM_EQUIPMENT.filter((e) => (isWeapon(e) && isProtoWeapon(e)) || (e.kind === 'misc' && has(e, 'F_PROTOMEK_EQUIPMENT')));
}

/** Ammunition for a weapon: same ammo type and rack size. */
export function protoAmmoFor(w: MMItem): MMItem[] {
  return MM_EQUIPMENT.filter((a) => a.kind === 'ammo' && a.ammoType === w.ammoType && (a.rackSize ?? 0) === (w.rackSize ?? 0)
    && (a.kgPerShot ?? 0) > 0 && (a.techBase === 'Both' || a.techBase === w.techBase || w.techBase === 'Both'));
}

/** Weight of one item on a ProtoMech (missile launchers are lighter than on 'Mechs). */
export function protoItemWeight(d: Pick<ProtoMechDesign, 'tonnage'>, item: ProtoItem, e = getMM(item.equipmentId)): number {
  if (!e) return 0;
  if (e.kind === 'ammo') return kgUp(((e.kgPerShot ?? 0) * (item.shots ?? 0)) / 1000);
  const rack = e.rackSize ?? 0;
  const p = (e as MMItem & { parent?: string }).parent ?? '';
  if (e.kind === 'protoWeapon' || e.kind === 'baWeapon') {
    if (/^StreakLRM|StreakLRMWeapon/.test(p)) return rack * 0.4;
    if (/^StreakSRM|StreakSRMWeapon/.test(p)) return rack * 0.5;
    if (/^LRMWeapon|^LRTWeapon/.test(p)) return kg(rack * 0.2);
    if (/^SRMWeapon|^SRTWeapon/.test(p)) return rack * 0.25;
  }
  if (has(e, 'F_JUMP_JET') || has(e, 'F_UMU')) {
    const per = d.tonnage < 6 ? 0.05 : d.tonnage < 10 ? 0.1 : 0.15;
    return per * (has(e, 'S_IMPROVED') ? 2 : 1);
  }
  if (has(e, 'F_MASC')) return kg(d.tonnage * 0.025);
  if (has(e, 'F_PARTIAL_WING')) return kg(d.tonnage / 5);
  if (has(e, 'F_MAGNETIC_CLAMP')) return d.tonnage < 6 ? 0.25 : d.tonnage < 10 ? 0.5 : 1;
  return mmNum(e.tonnage);
}

/** Heat sinks needed: the heat of energy weapons that use no ammunition (lasers, PPCs, plasma, flamers). */
export function protoHeatSinks(d: Pick<ProtoMechDesign, 'equipment'>): number {
  let heat = 0;
  for (const item of d.equipment) {
    const e = getMM(item.equipmentId);
    if (!e || !isWeapon(e)) continue;
    if ((has(e, 'F_LASER') && !e.ammoType) || has(e, 'F_PPC') || has(e, 'F_PLASMA') || (has(e, 'F_FLAMER') && !e.ammoType)) heat += e.heat ?? 0;
  }
  return heat;
}

// ---------------------------------------------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------------------------------------------

export interface ProtoSummary {
  rating: number;
  runMP: number;
  /** Running MP with the myomer booster engaged. */
  boostedRunMP: number | null;
  jumpMP: number;
  umuMP: number;
  ultraheavy: boolean;
  structure: Record<ProtoArmorLocation, number>;
  armorTotal: number;
  armorMaxTotal: number;
  heatSinks: number;
  weights: {
    structure: number; engine: number; cockpit: number; heatSinks: number; armor: number; equipment: number; total: number; free: number;
  };
  slots: Record<ProtoLocation, { used: number; max: number; tons: number; maxTons: number }>;
  unallocated: ProtoItem[];
}

export function computeProtoMech(d: ProtoMechDesign): ProtoSummary {
  const rating = protoEngineRating(d);
  const items = d.equipment.map((i) => ({ i, e: getMM(i.equipmentId) }));
  const jumpMP = items.filter(({ e }) => has(e, 'F_JUMP_JET')).length;
  const umuMP = items.filter(({ e }) => has(e, 'F_UMU')).length;
  const booster = items.some(({ e }) => has(e, 'F_MASC'));
  const runMP = Math.ceil(d.walkMP * 1.5);
  const armorEntry = getMM(d.armorId);
  const armorTotal = PROTO_ARMOR_LOCATIONS.reduce((a, l) => a + (d.armor[l] ?? 0), 0);
  let equipment = 0;
  const slots = Object.fromEntries(PROTO_LOCATIONS.map((l) => [l, { used: 0, max: protoSlotLimit(d, l), tons: 0, maxTons: protoWeightLimit(d, l) }])) as ProtoSummary['slots'];
  for (const { i, e } of items) {
    const w = protoItemWeight(d, i, e);
    equipment += w;
    if (i.location && e && !isSlotless(e)) {
      slots[i.location].used++;
      slots[i.location].tons += w;
    }
  }
  // EDP armor takes a torso slot.
  slots.TO.used += mmNum(armorEntry?.criticalSlots);
  const heatSinks = protoHeatSinks(d);
  const weights = {
    structure: kg(d.tonnage * 0.1),
    engine: protoEngineWeight(rating) ?? 0,
    cockpit: d.tonnage > PROTO_MAX_STANDARD ? 0.75 : 0.5,
    heatSinks: heatSinks * 0.25,
    armor: kg(armorTotal * (armorEntry?.weightPerPoint ?? 0.05)),
    equipment: kg(equipment),
    total: 0,
    free: 0,
  };
  weights.total = kg(weights.structure + weights.engine + weights.cockpit + weights.heatSinks + weights.armor + weights.equipment);
  weights.free = kg(d.tonnage - weights.total);
  return {
    rating, runMP, boostedRunMP: booster ? d.walkMP * 2 : null, jumpMP, umuMP, ultraheavy: isUltraheavy(d),
    structure: protoStructure(d), armorTotal, armorMaxTotal: protoMaxArmorTotal(d), heatSinks, weights, slots,
    unallocated: d.equipment.filter((e) => e.location === null),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------

export interface ProtoIssue { severity: 'error' | 'warning'; message: string }

/** First year ProtoMechs of this kind can be built (MegaMek's tech advancement). */
function chassisYear(d: ProtoMechDesign): number {
  if (d.motion === 'glider') return 3075;
  if (d.motion === 'quad') return 3075;
  if (isUltraheavy(d)) return 3075;
  return 3059;
}

export function validateProtoMech(d: ProtoMechDesign, s = computeProtoMech(d)): ProtoIssue[] {
  const issues: ProtoIssue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const era = getEra(d.era);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

  if (!Number.isInteger(d.tonnage) || d.tonnage < PROTO_MIN_TONNAGE || d.tonnage > PROTO_MAX_TONNAGE) {
    error(`ProtoMechs weigh ${PROTO_MIN_TONNAGE}–${PROTO_MAX_TONNAGE} tons in whole tons (got ${d.tonnage}).`);
  }
  if (era && !isAvailableIn(eraForYear(chassisYear(d)), d.era)) {
    error(`${isUltraheavy(d) ? 'Ultraheavy' : PROTO_MOTION_NAMES[d.motion]} ProtoMechs cannot be built in the ${era.name} era.`);
  }
  if (d.techBase !== 'Clan' && !d.mixedTech) error('ProtoMechs are Clan technology (needs mixed tech on an Inner Sphere design).');
  if (!Number.isInteger(d.walkMP) || d.walkMP < 1) error('Walking MP must be a whole number of at least 1.');
  if (s.weights.free < -1e-9) error(`Overweight by ${fmt(-s.weights.free)} tons.`);
  else if (s.weights.free > 1e-9) warn(`${fmt(s.weights.free)} tons unused.`);
  if (d.motion === 'glider' && s.runMP < 4) error('Glider ProtoMechs need at least 4 flanking MP.');
  if (d.motion === 'quad' && s.runMP < 3) error('Quad ProtoMechs need at least 3 running MP.');
  const items = d.equipment.map((i) => ({ i, e: getMM(i.equipmentId) }));
  const improved = items.some(({ e }) => has(e, 'F_JUMP_JET') && has(e, 'S_IMPROVED'));
  const maxJump = improved ? Math.ceil(d.walkMP * 1.5) : d.walkMP;
  if (s.jumpMP > maxJump) error(`Jumping MP (${s.jumpMP}) cannot exceed ${improved ? 'running' : 'walking'} MP (${maxJump}).`);
  if (s.umuMP > maxJump) error(`UMU MP (${s.umuMP}) cannot exceed walking MP (${maxJump}).`);
  if (items.some(({ e }) => has(e, 'F_JUMP_JET') && has(e, 'S_IMPROVED')) && items.some(({ e }) => has(e, 'F_JUMP_JET') && !has(e, 'S_IMPROVED'))) {
    error('Standard and extended jump jets cannot be mixed.');
  }

  // Armor
  const armor = getMM(d.armorId);
  if (!armor || armor.kind !== 'protoArmor') error(`Unknown ProtoMech armor "${d.armorId}".`);
  else if (!mmAvailable(armor, d.era, d.techBase, d.mixedTech)) error(`${armor.name} armor is not available in the ${era?.name ?? d.era} era.`);
  for (const l of PROTO_ARMOR_LOCATIONS) {
    const v = d.armor[l] ?? 0;
    if (!Number.isInteger(v) || v < 0) error(`${PROTO_LOCATION_NAMES[l]} armor must be a non-negative whole number.`);
    else if (v > protoMaxArmor(d, l)) error(`${PROTO_LOCATION_NAMES[l]} has ${v} armor points; the maximum is ${protoMaxArmor(d, l)}.`);
  }
  if (s.armorTotal > s.armorMaxTotal) error(`Armor total ${s.armorTotal} exceeds the maximum of ${s.armorMaxTotal}.`);
  if (s.armorTotal === 0) warn('No armor allocated.');

  // Equipment
  let melee = 0;
  const reported = new Set<string>();
  for (const { i, e } of items) {
    if (!e) { error(`Unknown equipment "${i.equipmentId}".`); continue; }
    const name = mmName(e);
    if (e.kind !== 'ammo' && !(isWeapon(e) ? isProtoWeapon(e) : has(e, 'F_PROTOMEK_EQUIPMENT')) && !reported.has(`x${e.id}`)) {
      reported.add(`x${e.id}`);
      error(`${name} cannot be mounted on a ProtoMech.`);
    }
    if (!mmAvailable(e, d.era, d.techBase, d.mixedTech) && !reported.has(e.id)) {
      reported.add(e.id);
      error(`${name} is not available ${e.techBase !== 'Both' && e.techBase !== d.techBase && !d.mixedTech ? `to ${TECH_BASE_NAMES[d.techBase]} designs` : `in the ${era?.name ?? d.era} era`}.`);
    }
    if (i.rear && i.location !== 'TO') error(`${name}: only torso equipment can face the rear.`);
    if (i.location) {
      if (isSlotless(e) && i.location !== 'BD') error(`${name} goes in the body.`);
      if (!isSlotless(e) && i.location === 'BD') error(`${name} needs a slot (torso, arms or main gun).`);
      if (!isSlotless(e) && (i.location === 'HD' || i.location === 'LG')) error(`${name} cannot be mounted in the ${PROTO_LOCATION_NAMES[i.location].toLowerCase()}.`);
    }
    if (e.kind === 'ammo' && (!Number.isInteger(i.shots) || (i.shots ?? 0) < 1)) error(`${name}: choose how many shots to carry.`);
    if (has(e, 'F_PROTOMEK_MELEE')) {
      melee++;
      if (has(e, 'S_PROTO_QMS') && d.motion !== 'quad') error(`${name} can only be used by quad ProtoMechs.`);
      if (has(e, 'S_PROTOMEK_WEAPON') && d.motion === 'quad') error(`${name} cannot be used by quad ProtoMechs.`);
      if (has(e, 'S_PROTOMEK_WEAPON') && i.location !== 'RA' && i.location !== 'LA') error(`${name} must be mounted in an arm.`);
      if (has(e, 'S_PROTO_QMS') && i.location !== 'TO') error(`${name} must be mounted in the torso.`);
    }
    if (has(e, 'F_MAGNETIC_CLAMP')) {
      if (d.motion !== 'biped') error('Quad and glider ProtoMechs cannot use a magnetic clamp system.');
      if (i.location !== 'TO') error(`${name} must be mounted in the torso.`);
    }
  }
  if (melee > 1) error('A ProtoMech can mount only one melee weapon.');
  for (const l of PROTO_LOCATIONS) {
    const slot = s.slots[l];
    if (l === 'BD') continue;
    if (slot.used > slot.max) error(`${PROTO_LOCATION_NAMES[l]}: ${slot.used} items; the limit is ${slot.max}.`);
    if (slot.tons > slot.maxTons + 1e-9) error(`${PROTO_LOCATION_NAMES[l]}: ${fmt(slot.tons)} tons of equipment; the limit is ${fmt(slot.maxTons)}.`);
  }
  if (s.unallocated.length) error(`${s.unallocated.length} item(s) not allocated to a location.`);
  // Ammunition with no weapon to feed.
  for (const { e } of items) {
    if (e?.kind !== 'ammo') continue;
    if (!items.some(({ e: w }) => isWeapon(w) && w!.ammoType === e.ammoType && (w!.rackSize ?? 0) === (e.rackSize ?? 0))) {
      warn(`${mmName(e)} is carried but no matching weapon is mounted.`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------------------------
// Battle Value and cost
// ---------------------------------------------------------------------------------------------------------------

export interface ProtoBreakdown { total: number; defensive: number; offensive: number; lines: [string, number][] }

/** MegaMek's generic BV with the ProtoMech rules: +0.1 defensive factor, gliders +1 TMM, ammo by the shot. */
export function protoMechBV(d: ProtoMechDesign, s = computeProtoMech(d)): ProtoBreakdown {
  const items = d.equipment.map((i) => ({ i, e: getMM(i.equipmentId) })).filter((x): x is { i: ProtoItem; e: MMItem } => !!x.e);
  const armor = s.armorTotal * 2.5;
  const isPoints = PROTO_ARMOR_LOCATIONS.reduce((a, l) => a + s.structure[l], 0);
  const structure = isPoints * 1.5;
  // Defensive equipment: AMS (and its ammo, up to the AMS value), ECM and active probes.
  let defEquip = 0;
  let amsBV = 0;
  let amsAmmo = 0;
  for (const { i, e } of items) {
    if (has(e, 'F_AMS')) { amsBV += mmNum(e.bv); defEquip += mmNum(e.bv); }
    else if ((has(e, 'F_ECM') || has(e, 'F_BAP')) && e.kind === 'misc') defEquip += mmNum(e.bv);
    else if (e.kind === 'ammo' && e.ammoType === 'AMS') amsAmmo += ((e.kgPerShot ?? 0) * (i.shots ?? 0) / 1000) * mmNum(e.bv);
  }
  defEquip += Math.min(amsAmmo, amsBV);
  const run = s.boostedRunMP ?? s.runMP;
  const runTMM = targetMovementModifier(run) + (isGlider(d) ? 1 : 0);
  const jumpTMM = s.jumpMP ? targetMovementModifier(s.jumpMP) + 1 : 0;
  const umuTMM = s.umuMP ? targetMovementModifier(s.umuMP) : 0;
  const tmm = Math.max(runTMM, jumpTMM, umuTMM);
  const factor = 1 + tmm / 10 + 0.1;
  const defensive = (armor + structure + defEquip) * factor;

  // Offensive: weapons (rear ones halved if the front carries more), ammo up to its weapons' value, equipment.
  const weapons = items.filter(({ e }) => isWeapon(e) && !has(e, 'F_AMS') && mmNum(e.bv) > 0);
  const front = weapons.filter(({ i }) => !i.rear).reduce((a, { e }) => a + mmNum(e.bv), 0);
  const rear = weapons.filter(({ i }) => i.rear).reduce((a, { e }) => a + mmNum(e.bv), 0);
  const swap = rear > front;
  const weaponBV = weapons.reduce((a, { i, e }) => a + mmNum(e.bv) * ((swap ? !i.rear : i.rear) ? 0.5 : 1), 0);
  const byKey = new Map<string, { weapons: number; ammo: number }>();
  for (const { e } of weapons) {
    if (!e.ammoType) continue;
    const k = `${e.ammoType}:${e.rackSize ?? 0}`;
    const g = byKey.get(k) ?? { weapons: 0, ammo: 0 };
    g.weapons += mmNum(e.bv);
    byKey.set(k, g);
  }
  for (const { i, e } of items) {
    if (e.kind !== 'ammo' || e.ammoType === 'AMS') continue;
    const g = byKey.get(`${e.ammoType}:${e.rackSize ?? 0}`);
    if (g) g.ammo += ((e.kgPerShot ?? 0) * (i.shots ?? 0) / 1000) * mmNum(e.bv);
  }
  const ammo = [...byKey.values()].reduce((a, g) => a + Math.min(g.ammo, g.weapons), 0);
  const melee = (e: MMItem) => (has(e, 'S_PROTO_QMS') ? 2.5 : 1.25) * Math.ceil(0.2 * d.tonnage);
  const offEquip = items.reduce((a, { e }) => a + (e.kind !== 'misc' || has(e, 'F_ECM') || has(e, 'F_BAP') ? 0
    : has(e, 'F_PROTOMEK_MELEE') ? melee(e) : mmNum(e.bv)), 0)
    + mmNum(getMM(d.armorId)?.bv);
  const sf = speedFactor(run + Math.round(Math.max(s.jumpMP, s.umuMP) / 2));
  const offensive = (weaponBV + ammo + offEquip) * sf;
  const lines: [string, number][] = [
    ['Armor (× 2.5)', armor], ['Internal structure (× 1.5)', structure], ...(defEquip ? [['Defensive equipment', defEquip] as [string, number]] : []),
    [`Defensive factor (TMM ${tmm} + 0.1)`, factor], ['Weapons', weaponBV], ['Ammunition', ammo],
    ...(offEquip ? [['Offensive equipment', offEquip] as [string, number]] : []), ['Speed factor', sf],
  ];
  return { total: Math.round(defensive + offensive), defensive, offensive, lines };
}

export function protoMechCost(d: ProtoMechDesign, s = computeProtoMech(d)): { total: number; lines: [string, number][] } {
  const t = d.tonnage;
  const items = d.equipment.map((i) => ({ i, e: getMM(i.equipmentId) })).filter((x): x is { i: ProtoItem; e: MMItem } => !!x.e);
  const equipment = items.reduce((a, { i, e }) => {
    // MegaMek charges each ProtoMech ammo bin at the item's full price, whatever its shot count.
    if (e.kind === 'ammo') return a + mmNum(e.cost);
    if (has(e, 'F_EI_INTERFACE')) return a; // built in (IO:AE p.69)
    if (has(e, 'F_MASC')) return a + Math.round(s.rating * 1000 * t * 0.025);
    if (has(e, 'F_JUMP_JET') || has(e, 'F_UMU')) return a; // in the jump jet line
    if (has(e, 'F_PARTIAL_WING')) return a + protoItemWeight(d, i, e) * 50000;
    // MegaMek loads a Fusillade with two bins of iATM 3 ammunition (75,000 each).
    if (e.id === 'Fusillade') return a + mmNum(e.cost) + 2 * 75000;
    return a + mmNum(e.cost);
  }, 0);
  const jumpForCost = s.jumpMP + (items.some(({ e }) => has(e, 'F_PARTIAL_WING')) ? 2 : 0);
  const lines: [string, number][] = [
    ['Cockpit', t >= 10 ? 800000 : 500000],
    ['Life support', 75000],
    ['Sensors', 2000 * t],
    ['Musculature', 2000 * t],
    ['Internal structure', (d.motion === 'glider' ? 600 : d.motion === 'quad' ? 500 : 400) * t],
    ['Arm actuators', 2 * 180 * t],
    ['Leg actuators', 540 * t],
    ['Engine', (5000 * t * s.rating) / 75],
    // A partial wing adds 2 jump MP in a standard atmosphere, which MegaMek prices with the jump jets.
    ['Jump jets', t * jumpForCost * jumpForCost * 200],
    // MegaMek prices heat sinks for the heat of every energy weapon.
    ['Heat sinks', 2000 * items.reduce((a, { e }) => a + (isWeapon(e) && has(e, 'F_ENERGY') ? e.heat ?? 0 : 0), 0)],
    ['Armor', s.armorTotal * mmNum(getMM(d.armorId)?.cost)],
    ['Weapons & equipment', equipment],
  ];
  const subtotal = lines.reduce((a, [, v]) => a + v, 0);
  const mult = 1 + t / 100;
  lines.push([`× (1 + tonnage / 100)`, mult]);
  return { total: Math.round(subtotal * mult), lines };
}

// ---------------------------------------------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------------------------------------------

export function emptyProtoArmor(): Record<ProtoArmorLocation, number> {
  return { HD: 0, TO: 0, RA: 0, LA: 0, LG: 0, MG: 0 };
}

export function newProtoMech(era: EraId = '3062', techBase: TechBase = 'Clan'): ProtoMechDesign {
  return {
    schemaVersion: 1, unitType: 'protomech', era, techBase, mixedTech: techBase !== 'Clan',
    chassis: 'New ProtoMech', model: '1', tonnage: 5, motion: 'biped', walkMP: 5, armorId: PROTO_STANDARD_ARMOR,
    armor: emptyProtoArmor(), equipment: [],
  };
}

export function addProtoItem(d: ProtoMechDesign, equipmentId: string, location: ProtoLocation | null = null): ProtoMechDesign {
  const e = getMM(equipmentId);
  const loc: ProtoLocation | null = isSlotless(e) ? 'BD' : location;
  const shots = e?.kind === 'ammo' ? 10 : undefined;
  return { ...d, equipment: [...d.equipment, { uid: newProtoUid(), equipmentId, location: loc, ...(shots ? { shots } : {}) }] };
}

export function updateProtoItem(d: ProtoMechDesign, uid: string, patch: Partial<ProtoItem>): ProtoMechDesign {
  return { ...d, equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, ...patch } : e)) };
}

export function removeProtoItem(d: ProtoMechDesign, uid: string): ProtoMechDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

/** Set jump MP: standard or extended ProtoMech jump jets, one per MP. */
export function setProtoJumpMP(d: ProtoMechDesign, mp: number, extended = d.equipment.some((e) => e.equipmentId === 'ExtendedJumpJetSystem')): ProtoMechDesign {
  const id = extended ? 'ExtendedJumpJetSystem' : 'ProtoMechJumpJet';
  const rest = d.equipment.filter((e) => !has(getMM(e.equipmentId), 'F_JUMP_JET'));
  const jets = Array.from({ length: Math.max(0, Math.floor(mp)) }, (): ProtoItem => ({ uid: newProtoUid(), equipmentId: id, location: 'BD' }));
  return { ...d, equipment: [...rest, ...jets] };
}

/** Spread armor over the locations in proportion to their maximums. */
export function maximizeProtoArmor(d: ProtoMechDesign): ProtoMechDesign {
  const armor = emptyProtoArmor();
  let left = protoMaxArmorTotal(d);
  for (const l of ['TO', 'LG', 'MG', 'RA', 'LA', 'HD'] as ProtoArmorLocation[]) {
    armor[l] = Math.min(protoMaxArmor(d, l), left);
    left -= armor[l];
  }
  return { ...d, armor };
}

export function parseProtoMech(raw: unknown): ProtoMechDesign {
  if (!isProtoMech(raw)) throw new Error('Not a ProtoMech design.');
  const r = raw as unknown as Record<string, unknown>;
  const base = newProtoMech((getEra(String(r.era))?.id ?? '3062') as EraId, r.techBase === 'IS' ? 'IS' : 'Clan');
  const n = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  const armorIn = (r.armor ?? {}) as Record<string, unknown>;
  const armor = emptyProtoArmor();
  for (const l of PROTO_ARMOR_LOCATIONS) armor[l] = n(armorIn[l], 0);
  const equipment = Array.isArray(r.equipment) ? r.equipment.flatMap((x) => {
    const e = x as Record<string, unknown>;
    if (typeof e?.equipmentId !== 'string' || !getMM(e.equipmentId)) return [];
    const location = (PROTO_LOCATIONS as readonly string[]).includes(e.location as string) ? (e.location as ProtoLocation) : null;
    return [{ uid: newProtoUid(), equipmentId: e.equipmentId, location, ...(typeof e.shots === 'number' ? { shots: e.shots } : {}), ...(e.rear === true ? { rear: true } : {}) }];
  }) : [];
  return {
    ...base,
    ...(typeof r.mulId === 'number' ? { mulId: r.mulId } : {}),
    mixedTech: r.mixedTech === true, chassis: String(r.chassis ?? base.chassis), model: String(r.model ?? ''),
    tonnage: n(r.tonnage, 5), motion: (['biped', 'quad', 'glider'] as const).includes(r.motion as ProtoMotion) ? (r.motion as ProtoMotion) : 'biped',
    walkMP: n(r.walkMP, 5), armorId: typeof r.armorId === 'string' && getMM(r.armorId) ? r.armorId : PROTO_STANDARD_ARMOR,
    ...(r.interfaceCockpit === true ? { interfaceCockpit: true } : {}),
    armor, equipment,
  };
}

export function protoItemLabel(i: ProtoItem): string {
  const e = getMM(i.equipmentId);
  const name = e ? mmName(e) : i.equipmentId;
  return e?.kind === 'ammo' ? `${name} (${i.shots ?? 0})` : i.rear ? `${name} (R)` : name;
}

export function protoMechReadout(d: ProtoMechDesign, s = computeProtoMech(d)): string {
  const era = getEra(d.era);
  const t = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
  const row = (label: string, mass: number) => `${label.padEnd(34)}${t(mass)}`;
  const lines = [
    `${d.chassis} ${d.model}`.trim(), '',
    `Type: ${PROTO_MOTION_NAMES[d.motion]} ProtoMech, ${d.tonnage} tons${s.ultraheavy ? ' (ultraheavy)' : ''}`,
    `Tech Base: ${d.mixedTech ? `Mixed (${TECH_BASE_NAMES[d.techBase]} chassis)` : TECH_BASE_NAMES[d.techBase]}`,
    era ? `Era: ${era.name} (${era.year})` : '',
    `Battle Value: ${protoMechBV(d, s).total.toLocaleString('en-US')}`,
    `Cost: ${protoMechCost(d, s).total.toLocaleString('en-US')} C-bills`, '',
    row('Internal Structure:', s.weights.structure),
    row(`Engine: ${s.rating}`, s.weights.engine),
    `    Walking MP: ${d.walkMP}`,
    `    Running MP: ${s.runMP}${s.boostedRunMP ? ` [${s.boostedRunMP}]` : ''}`,
    `    Jumping MP: ${s.jumpMP}${s.umuMP ? ` · UMU MP: ${s.umuMP}` : ''}`,
    row(`Heat Sinks: ${s.heatSinks}`, s.weights.heatSinks),
    row('Cockpit:', s.weights.cockpit),
    row(`Armor (${mmName(getMM(d.armorId) ?? ({ name: d.armorId } as MMItem))}): ${s.armorTotal}`, s.weights.armor), '',
    `${''.padEnd(16)}Internal  Armor`,
    ...PROTO_ARMOR_LOCATIONS.filter((l) => protoMaxArmor(d, l) > 0 || s.structure[l] > 0)
      .map((l) => `    ${PROTO_LOCATION_NAMES[l].padEnd(12)}${String(s.structure[l]).padStart(5)}${String(d.armor[l]).padStart(8)}`), '',
    'Equipment                          Loc   Tons',
    ...d.equipment.map((i) => `${protoItemLabel(i).padEnd(35)}${(i.location ?? '—').padEnd(6)}${t(protoItemWeight(d, i))}`),
  ];
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
