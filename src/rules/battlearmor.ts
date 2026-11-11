/**
 * Battle armor construction (TechManual pp. 158–169, as implemented by MegaMek's TestBattleArmor), Battle Value
 * (BattleArmorBVCalculator) and cost (BattleArmorCostCalculator).
 */
import type { EraId } from './eras';
import { getEra } from './eras';
import type { TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { MMItem } from './mmEquipment';
import { MM_EQUIPMENT, getMM, has, mmAvailable, mmName, mmNum } from './mmEquipment';

export type BAMount = 'body' | 'LA' | 'RA' | 'turret';
export const BA_MOUNTS: readonly BAMount[] = ['body', 'LA', 'RA', 'turret'];
export const BA_MOUNT_NAMES: Record<BAMount, string> = { body: 'Body', LA: 'Left Arm', RA: 'Right Arm', turret: 'Turret' };
export type BAMotion = 'leg' | 'jump' | 'vtol' | 'umu';
export const BA_MOTION_NAMES: Record<BAMotion, string> = { leg: 'Ground only', jump: 'Jump', vtol: 'VTOL', umu: 'UMU' };
export type BAChassis = 'biped' | 'quad';
/** 0 PA(L), 1 Light, 2 Medium, 3 Heavy, 4 Assault. */
export type BAWeightClass = 0 | 1 | 2 | 3 | 4;
export const BA_WEIGHT_CLASS_NAMES = ['PA(L)', 'Light', 'Medium', 'Heavy', 'Assault'] as const;
/** Maximum suit weight (tons) per weight class. */
export const BA_WEIGHT_LIMITS = [0.4, 0.75, 1, 1.5, 2] as const;

export interface BAItem {
  uid: string;
  equipmentId: string;
  mount: BAMount | null;
  /** Mounted on one trooper only (1-based); squad-wide when absent. */
  trooper?: number;
  /** An anti-personnel weapon carried in the preceding AP mount or armored glove (weightless, slotless). */
  apm?: boolean;
  /** Squad support weapon mount (reduced ammo weight, one per squad). */
  ssw?: boolean;
  /** Carried in a detachable weapon pack (ammo weighs 25% less). */
  dwp?: boolean;
  /** Ammunition: shots carried (up to 4 per slot, 8 for tube artillery). */
  shots?: number;
}

export interface BattleArmorDesign {
  schemaVersion: 1;
  unitType: 'battlearmor';
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  weightClass: BAWeightClass;
  chassisType: BAChassis;
  squadSize: number;
  motion: BAMotion;
  walkMP: number;
  /** Jump, VTOL or UMU MP. */
  jumpMP: number;
  /** Armor type: internal name of a BA armor entry, e.g. "IS BA Standard (Basic)". */
  armorId: string;
  /** Armor points per trooper. */
  armor: number;
  exoskeleton?: boolean;
  /** Quad suits may carry a turret (a modular one can be reconfigured). */
  turret?: { size: number; modular: boolean } | null;
  equipment: BAItem[];
}

let uidCounter = 0;
export const newBAUid = () => `ba${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const isBattleArmor = (d: unknown): d is BattleArmorDesign => (d as { unitType?: string })?.unitType === 'battlearmor';

// ---------------------------------------------------------------------------------------------------------------
// Tables (TestBattleArmor)
// ---------------------------------------------------------------------------------------------------------------

const CHASSIS_WEIGHT = { IS: [0.08, 0.1, 0.175, 0.3, 0.55], Clan: [0.13, 0.15, 0.25, 0.4, 0.7] };
const EXTRA_GROUND_MP_WEIGHT = [0.025, 0.03, 0.04, 0.08, 0.16];
/** Weight per MP (kg) of jump jets, VTOL rotors and UMU propulsion, by weight class. */
const MOTIVE_KG: Record<Exclude<BAMotion, 'leg'>, number[]> = {
  jump: [25, 25, 50, 125, 250], vtol: [30, 40, 60], umu: [45, 45, 85, 160, 250],
};
const MAX_ARMOR = [2, 6, 10, 14, 18];

export const maxArmor = (d: Pick<BattleArmorDesign, 'weightClass'>) => MAX_ARMOR[d.weightClass];

export function maxWalkMP(d: Pick<BattleArmorDesign, 'weightClass' | 'chassisType'>): number {
  return 3 - (d.weightClass >= 3 ? 1 : 0) + (d.chassisType === 'quad' ? 2 : 0);
}

export function maxJumpMP(d: Pick<BattleArmorDesign, 'weightClass' | 'chassisType' | 'motion'>): number {
  if (d.motion === 'leg') return 0;
  if (d.chassisType === 'quad') return 0;
  if (d.motion === 'vtol') return d.weightClass > 2 ? 0 : 7 - d.weightClass;
  if (d.motion === 'umu') return Math.min(5, 6 - d.weightClass);
  return maxWalkMP(d);
}

/** Critical slots per mount location. */
export function mountSlots(d: Pick<BattleArmorDesign, 'weightClass' | 'chassisType' | 'turret'>, mount: BAMount): number {
  const wc = d.weightClass;
  const turret = d.chassisType === 'quad' && d.turret?.size ? d.turret : null;
  if (mount === 'turret') return turret?.size ?? 0;
  // A turret takes one body slot (two if modular).
  if (d.chassisType === 'quad') return mount === 'body' ? Math.max(0, [0, 5, 7, 9, 11][wc] - (turret ? (turret.modular ? 2 : 1) : 0)) : 0;
  if (mount === 'body') return [2, 4, 4, 6, 6][wc];
  return [2, 2, 3, 3, 4][wc];
}

/** Anti-'Mech weapons allowed per location (arms 1; body 2, quad 4). */
export const antiMekLimit = (d: Pick<BattleArmorDesign, 'chassisType'>, m: BAMount) => (m === 'body' ? (d.chassisType === 'quad' ? 4 : 2) : 1);

// ---------------------------------------------------------------------------------------------------------------
// Equipment helpers
// ---------------------------------------------------------------------------------------------------------------

export const baArmorTypes = (): MMItem[] => MM_EQUIPMENT.filter((e) => e.kind === 'baArmor');
export const isManipulator = (e: MMItem | undefined) => has(e, 'F_BA_MANIPULATOR');
export const isAPMount = (e: MMItem | undefined) => has(e, 'F_AP_MOUNT') || has(e, 'F_ARMORED_GLOVE');
export const isWeapon = (e: MMItem | undefined) => e?.kind === 'baWeapon' || e?.kind === 'infantryWeapon';
const isMotive = (e: MMItem | undefined) => !!e && ['BAJumpJet', 'BAVTOL', 'BAUMU'].includes(e.id);

/** Equipment a battle armor squad can carry (the catalog in the editor). */
export function isBAEquipment(e: MMItem): boolean {
  if (e.kind === 'baWeapon') return true;
  if (e.kind === 'misc') return (has(e, 'F_BA_EQUIPMENT') || has(e, 'F_BA_MANIPULATOR')) && !isMotive(e);
  return false;
}

/** Ammunition that feeds a BA weapon: same ammo type and rack size, BA ammo first. */
export function ammoFor(weapon: MMItem): MMItem[] {
  if (!weapon.ammoType) return [];
  return MM_EQUIPMENT.filter((a) => a.kind === 'ammo' && a.ammoType === weapon.ammoType && a.rackSize === weapon.rackSize && a.kgPerShot)
    .sort((a, b) => Number(has(b, 'F_BATTLEARMOR')) - Number(has(a, 'F_BATTLEARMOR')));
}

/** Weight (tons) of one mounted item on one trooper. */
export function baItemWeight(d: BattleArmorDesign, item: BAItem, e = getMM(item.equipmentId)): number {
  if (!e || item.apm) return 0;
  // Equipment assigned to one trooper but not mounted is not carried (MegaMek ignores it).
  if (item.trooper && !item.mount && !item.dwp && !isManipulator(e)) return 0;
  if (e.kind === 'baArmor') return 0; // counted with the armor
  if (e.kind === 'ammo') {
    const mod = item.dwp ? 0.75 : item.ssw ? (d.techBase === 'Clan' ? 0.4 : 0.5) : 1;
    return ((e.kgPerShot ?? 0) * (item.shots ?? 1)) / 1000 * mod;
  }
  if (has(e, 'F_MECHANICAL_JUMP_BOOSTER')) return 2 * [0.025, 0.025, 0.05, 0.125, 0.25][d.weightClass];
  if (e.id === 'BACargoLifter') return 0.03 * 2; // a half-ton lifter by default
  // Weapons carried in a detachable weapon pack weigh 25% less; a squad support weapon is shared
  // (each trooper carries 40% of it in a Clan point, 50% in an Inner Sphere squad).
  const mod = item.dwp ? 0.75 : item.ssw ? (d.techBase === 'Clan' ? 0.4 : 0.5) : 1;
  return Math.round(mmNum(e.tonnage) * mod * 1000) / 1000;
}

/** Slots one item occupies (armor pieces, manipulators and AP-mounted weapons as MegaMek counts them). */
export function baItemSlots(item: BAItem, e = getMM(item.equipmentId)): number {
  // AP-mounted weapons, manipulators and weapons carried in a detachable weapon pack use no slots.
  if (!e || item.apm || isManipulator(e) || (item.dwp && e.kind !== 'misc')) return 0;
  if (e.kind === 'baArmor') return 1;
  if (e.kind === 'ammo') return Math.ceil((item.shots ?? 1) / (e.ammoType === 'BA_TUBE' ? 8 : 4));
  return mmNum(e.criticalSlots);
}

const onTrooper = (item: BAItem, t: number) => item.trooper === undefined || item.trooper === t;

// ---------------------------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------------------------

export interface BASummary {
  trooperLimit: number;
  weights: { chassis: number; groundMP: number; motive: number; armor: number; turret: number; equipment: number; total: number };
  /** Heaviest trooper (troopers may carry individual equipment). */
  heaviestTrooper: number;
  slots: Record<BAMount, { used: number; capacity: number; antiMek: number; antiPersonnel: number }>;
  armorSlots: number;
  maxArmor: number;
  maxWalk: number;
  maxJump: number;
}

export function computeBattleArmor(d: BattleArmorDesign): BASummary {
  const wc = d.weightClass;
  const chassis = (d.techBase === 'Clan' ? CHASSIS_WEIGHT.Clan : CHASSIS_WEIGHT.IS)[wc];
  const freeMP = d.chassisType === 'quad' ? 2 : 1;
  const groundMP = Math.max(0, d.walkMP - freeMP) * EXTRA_GROUND_MP_WEIGHT[wc];
  const motive = d.motion === 'leg' ? 0 : (d.jumpMP * (MOTIVE_KG[d.motion][wc] ?? 0)) / 1000;
  const armorType = getMM(d.armorId);
  const armor = (armorType?.weightPerPoint ?? 0.05) * d.armor;
  const trooperEquipment = (t: number) => d.equipment.filter((i) => onTrooper(i, t)).reduce((a, i) => a + baItemWeight(d, i), 0);
  const troopers = Array.from({ length: d.squadSize }, (_, i) => trooperEquipment(i + 1));
  const equipment = round3(Math.max(0, ...troopers));
  const turret = d.chassisType === 'quad' && d.turret?.size ? d.turret.size * 0.01 + 0.03 + (d.turret.modular ? 0.02 : 0) : 0;
  const total = round3(chassis + groundMP + motive + armor + turret + equipment);

  const slots = Object.fromEntries(BA_MOUNTS.map((m) => [m, { used: 0, capacity: mountSlots(d, m), antiMek: 0, antiPersonnel: 0 }])) as BASummary['slots'];
  // Count slots for the most loaded trooper per location (squad items plus that trooper's own).
  for (const m of BA_MOUNTS) {
    let worst = { used: 0, antiMek: 0, antiPersonnel: 0 };
    for (let t = 1; t <= Math.max(1, d.squadSize); t++) {
      const here = d.equipment.filter((i) => i.mount === m && onTrooper(i, t));
      const c = {
        used: here.reduce((a, i) => a + baItemSlots(i), 0),
        antiMek: here.filter((i) => getMM(i.equipmentId)?.kind === 'baWeapon').length,
        antiPersonnel: here.filter((i) => isAPMount(getMM(i.equipmentId)) && !has(getMM(i.equipmentId), 'F_ARMORED_GLOVE')).length,
      };
      if (c.used >= worst.used) worst = c;
    }
    Object.assign(slots[m], worst);
  }
  return {
    trooperLimit: BA_WEIGHT_LIMITS[wc],
    weights: { chassis, groundMP, motive, armor, turret, equipment, total },
    heaviestTrooper: total,
    slots,
    armorSlots: mmNum(armorType?.criticalSlots),
    maxArmor: maxArmor(d),
    maxWalk: maxWalkMP(d),
    maxJump: maxJumpMP(d),
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------

export interface BAIssue { severity: 'error' | 'warning'; message: string }

export function validateBattleArmor(d: BattleArmorDesign, s = computeBattleArmor(d)): BAIssue[] {
  const issues: BAIssue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const kg = (t: number) => `${Math.round(t * 1000)} kg`;
  const era = getEra(d.era);

  if (d.squadSize < 1 || d.squadSize > 6) error('A squad has 1–6 troopers.');
  if (s.weights.total > s.trooperLimit + 1e-9) {
    error(`Each trooper weighs ${kg(s.weights.total)}; a ${BA_WEIGHT_CLASS_NAMES[d.weightClass]} suit may weigh at most ${kg(s.trooperLimit)}.`);
  }
  if (d.weightClass > 0 && s.weights.total <= BA_WEIGHT_LIMITS[d.weightClass - 1] + 1e-9) {
    warn(`At ${kg(s.weights.total)} this suit would fit the ${BA_WEIGHT_CLASS_NAMES[d.weightClass - 1]} class.`);
  }
  if (d.walkMP < 1) error('Ground MP must be at least 1.');
  if (d.walkMP > s.maxWalk) error(`Ground MP ${d.walkMP} exceeds the maximum of ${s.maxWalk}.`);
  if (d.motion !== 'leg' && d.jumpMP > s.maxJump) {
    error(s.maxJump === 0
      ? `${BA_WEIGHT_CLASS_NAMES[d.weightClass]} ${d.chassisType} suits cannot use ${BA_MOTION_NAMES[d.motion]} movement.`
      : `${BA_MOTION_NAMES[d.motion]} MP ${d.jumpMP} exceeds the maximum of ${s.maxJump}.`);
  }
  if (d.armor > s.maxArmor) error(`At most ${s.maxArmor} armor points per trooper (has ${d.armor}).`);
  const armorType = getMM(d.armorId);
  if (!armorType) error('Unknown armor type.');
  else {
    const placed = d.equipment.filter((i) => i.equipmentId === d.armorId).length;
    if (placed !== s.armorSlots) error(`${mmName(armorType)} armor needs ${s.armorSlots} slots (has ${placed}).`);
    const armorTech = armorType.techBase === 'Both' ? d.techBase : armorType.techBase;
    if (!mmAvailable(armorType, d.era, armorTech, d.mixedTech)) error(`${mmName(armorType)} armor is not available in the ${era?.name ?? d.era} era.`);
  }

  if (d.turret?.size && d.chassisType !== 'quad') error('Only quad battle armor can mount a turret.');
  for (const m of BA_MOUNTS) {
    const c = s.slots[m];
    if (c.used > c.capacity) error(`${BA_MOUNT_NAMES[m]} needs ${c.used} slots but has ${c.capacity}.`);
    if (m === 'turret') continue;
    // Turret weapons count against the body's limits.
    if (m === 'body') c.antiMek += s.slots.turret.antiMek;
    if (c.antiMek > antiMekLimit(d, m)) error(`${BA_MOUNT_NAMES[m]} may carry ${antiMekLimit(d, m)} anti-'Mech weapon(s) (has ${c.antiMek}).`);
    const apLimit = m === 'body' ? (d.chassisType === 'quad' ? 4 : 2) : c.antiMek ? 1 : 2;
    if (c.antiPersonnel > apLimit) error(`${BA_MOUNT_NAMES[m]} may carry ${apLimit} anti-personnel mount(s) (has ${c.antiPersonnel}).`);
  }

  // Manipulators: one per arm, arms only, none on quads; pair-mounted types must match.
  const manip: Partial<Record<BAMount, MMItem>> = {};
  for (const i of d.equipment) {
    const e = getMM(i.equipmentId);
    if (!isManipulator(e)) continue;
    if (d.chassisType === 'quad') error('Quad battle armor cannot use manipulators.');
    else if (i.mount !== 'LA' && i.mount !== 'RA') error(`${mmName(e!)} must be mounted in an arm.`);
    else if (manip[i.mount]) error(`${BA_MOUNT_NAMES[i.mount]}: only one manipulator per arm.`);
    else manip[i.mount] = e;
  }
  const pair = (e?: MMItem) => !!e && /Magnet|MineClearance|CargoLifter/.test(e.id);
  if ((pair(manip.LA) || pair(manip.RA)) && manip.LA?.id !== manip.RA?.id) error('Magnetic, mine-clearance and cargo-lifter manipulators must be fitted to both arms.');

  let ssw = 0;
  const unavailable = new Set<string>();
  for (const i of d.equipment) {
    const e = getMM(i.equipmentId);
    if (!e) { error(`Unknown equipment "${i.equipmentId}".`); continue; }
    if (e.kind === 'baArmor') { if (!i.mount) error(`Place the ${mmName(e)} armor slots.`); continue; }
    if (!i.mount && !isManipulator(e) && !i.apm && !i.dwp) {
      if (i.trooper) warn(`${mmName(e)} (trooper ${i.trooper}) is not mounted and is not counted.`);
      else error(`${mmName(e)} is not placed.`);
    }
    if (i.ssw && isWeapon(e)) ssw++;
    if (e.kind === 'infantryWeapon' && !i.apm) error(`${mmName(e)} is an infantry weapon and needs an anti-personnel mount or armored glove.`);
    if (e.kind === 'ammo' && !i.dwp) {
      const max = (e.ammoType === 'BA_TUBE' ? 8 : 4) * baItemSlots(i, e);
      if ((i.shots ?? 1) > max) error(`${mmName(e)}: at most ${max} shots.`);
    }
    if (!mmAvailable(e, d.era, d.techBase, d.mixedTech) && !unavailable.has(e.id)) {
      unavailable.add(e.id);
      error(`${mmName(e)} is not available to ${TECH_BASE_NAMES[d.techBase]} designs in the ${era?.name ?? d.era} era.`);
    }
  }
  if (ssw > 1) error('Only one squad support weapon mount per squad.');
  if (ssw && d.chassisType === 'quad') error('Quad battle armor cannot use squad support weapon mounts.');
  if (d.equipment.some((i) => has(getMM(i.equipmentId), 'F_JUMP_BOOSTER') && i.mount !== 'body')) error('Jump boosters must be mounted in the body.');
  if (d.equipment.some((i) => has(getMM(i.equipmentId), 'F_JUMP_BOOSTER')) && (d.motion !== 'jump' || d.jumpMP < 1)) {
    error('Jump boosters need jump jets with at least 1 MP.');
  }
  if (d.equipment.filter((i) => has(getMM(i.equipmentId), 'F_MASC')).length > 3) error('Only one myomer booster.');
  if (d.equipment.some((i) => i.dwp) && d.walkMP < 2) error('A detachable weapon pack would reduce ground MP below 1.');
  return issues;
}

// ---------------------------------------------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------------------------------------------

export function newBattleArmor(era: EraId = '3050', techBase: TechBase = 'IS'): BattleArmorDesign {
  const armorId = techBase === 'Clan' ? 'Clan BA Standard (Basic)' : 'IS BA Standard (Basic)';
  return {
    schemaVersion: 1, unitType: 'battlearmor', era, techBase, mixedTech: false,
    chassis: 'New Battle Armor', model: '', weightClass: 2, chassisType: 'biped',
    squadSize: techBase === 'Clan' ? 5 : 4, motion: 'jump', walkMP: 1, jumpMP: 3, armorId, armor: 5,
    equipment: [
      { uid: newBAUid(), equipmentId: 'BABasicManipulator', mount: 'LA' },
      { uid: newBAUid(), equipmentId: 'BABasicManipulator', mount: 'RA' },
    ],
  };
}

/** Keep the number of armor slot pieces equal to what the armor type needs (new ones go to free slots). */
export function syncArmorSlots(d: BattleArmorDesign): BattleArmorDesign {
  const need = mmNum(getMM(d.armorId)?.criticalSlots);
  let equipment = d.equipment.filter((i) => getMM(i.equipmentId)?.kind !== 'baArmor' || i.equipmentId === d.armorId);
  const have = equipment.filter((i) => i.equipmentId === d.armorId).length;
  if (have > need) {
    let drop = have - need;
    equipment = equipment.filter((i) => !(i.equipmentId === d.armorId && drop-- > 0));
  }
  const out = { ...d, equipment };
  for (let n = have; n < need; n++) {
    const s = computeBattleArmor(out);
    const mount = BA_MOUNTS.find((m) => s.slots[m].used < s.slots[m].capacity) ?? null;
    out.equipment = [...out.equipment, { uid: newBAUid(), equipmentId: d.armorId, mount }];
  }
  return out;
}

export function setBAArmorType(d: BattleArmorDesign, armorId: string): BattleArmorDesign {
  return syncArmorSlots({ ...d, armorId });
}

export function setBATechBase(d: BattleArmorDesign, techBase: TechBase): BattleArmorDesign {
  // Standard armor follows the tech base (Clan standard BA armor weighs half as much).
  const armorId = /Standard \(Basic\)/.test(d.armorId) ? (techBase === 'Clan' ? 'Clan BA Standard (Basic)' : 'IS BA Standard (Basic)') : d.armorId;
  return syncArmorSlots({ ...d, techBase, armorId });
}

export function addBAItem(d: BattleArmorDesign, equipmentId: string, mount: BAMount | null = null): BattleArmorDesign {
  const e = getMM(equipmentId);
  const item: BAItem = { uid: newBAUid(), equipmentId, mount };
  if (e?.kind === 'ammo') item.shots = 4;
  if (isManipulator(e) && !mount) {
    const used = new Set(d.equipment.filter((i) => isManipulator(getMM(i.equipmentId))).map((i) => i.mount));
    item.mount = !used.has('LA') ? 'LA' : !used.has('RA') ? 'RA' : null;
  }
  return { ...d, equipment: [...d.equipment, item] };
}

export function updateBAItem(d: BattleArmorDesign, uid: string, patch: Partial<BAItem>): BattleArmorDesign {
  return { ...d, equipment: d.equipment.map((i) => (i.uid === uid ? { ...i, ...patch } : i)) };
}

export function removeBAItem(d: BattleArmorDesign, uid: string): BattleArmorDesign {
  // Removing an AP mount also removes the weapon it carries.
  const idx = d.equipment.findIndex((i) => i.uid === uid);
  const next = d.equipment[idx + 1];
  const drop = new Set([uid]);
  if (idx >= 0 && isAPMount(getMM(d.equipment[idx].equipmentId)) && next?.apm) drop.add(next.uid);
  return { ...d, equipment: d.equipment.filter((i) => !drop.has(i.uid)) };
}

/** Put an infantry weapon into an AP mount / armored glove (it follows the mount in the list). */
export function addAPWeapon(d: BattleArmorDesign, mountUid: string, weaponId: string): BattleArmorDesign {
  const idx = d.equipment.findIndex((i) => i.uid === mountUid);
  if (idx < 0) return d;
  const mount = d.equipment[idx];
  const rest = d.equipment.filter((_, j) => !(j === idx + 1 && d.equipment[j].apm));
  const weapon: BAItem = { uid: newBAUid(), equipmentId: weaponId, mount: mount.mount, apm: true, ...(mount.trooper ? { trooper: mount.trooper } : {}) };
  const at = rest.findIndex((i) => i.uid === mountUid);
  return { ...d, equipment: [...rest.slice(0, at + 1), weapon, ...rest.slice(at + 1)] };
}

// ---------------------------------------------------------------------------------------------------------------
// Battle Value (BattleArmorBVCalculator) and cost (BattleArmorCostCalculator)
// ---------------------------------------------------------------------------------------------------------------

export interface BABreakdown { total: number; perTrooper: number; defensive: number; offensive: number; lines: [string, number][] }

function tmm(mp: number): number {
  return mp <= 2 ? 0 : mp <= 4 ? 1 : mp <= 6 ? 2 : mp <= 9 ? 3 : mp <= 17 ? 4 : mp <= 24 ? 5 : 6;
}
const speedFactor = (mp: number) => Math.round(Math.pow(1 + (mp - 5) / 10, 1.2) * 100) / 100;
const mmBV = (e?: MMItem) => mmNum(e?.bv);

/** Whether the squad can make anti-'Mech (swarm/leg) attacks. */
export function canMakeAntiMek(d: BattleArmorDesign): boolean {
  if (d.weightClass >= 3 || d.motion === 'umu' || d.chassisType === 'quad') return false;
  const items = d.equipment.map((i) => getMM(i.equipmentId));
  if (items.some((e) => has(e, 'F_MAGNETIC_CLAMP'))) return true;
  const basic = items.filter((e) => has(e, 'F_BASIC_MANIPULATOR')).length;
  const claws = items.filter((e) => has(e, 'F_BATTLE_CLAW')).length;
  const gloves = items.filter((e) => has(e, 'F_ARMORED_GLOVE')).length;
  return basic > 0 || claws > 0 || (d.weightClass <= 1 && gloves > 1);
}

function trooperBV(d: BattleArmorDesign, t: number) {
  const items = d.equipment.filter((i) => onTrooper(i, t));
  const mms = items.map((i) => ({ i, e: getMM(i.equipmentId) }));
  const armorType = getMM(d.armorId);
  const tough = /FIRE_RESIST|REFLECTIVE|REACTIVE/.test(armorType?.armorType ?? '');
  let defensive = d.armor * (tough ? 3.5 : 2.5) + 1;
  const flags = (f: string) => mms.some(({ e }) => has(e, f));
  defensive += (mms.some(({ e }) => /ImprovedSensors/.test(e?.id ?? '')) ? 1 : 0) + (flags('F_BAP') ? 1 : 0);
  if (flags('F_ECM')) defensive += flags('F_ANGEL_ECM') ? 2 : 1;
  defensive += mms.filter(({ e }) => has(e, 'F_AMS')).reduce((a, { i, e }) => a + (i.trooper ? mmBV(e) / d.squadSize : mmBV(e)), 0);
  const jumpLike = d.motion === 'jump' || d.motion === 'vtol';
  const best = Math.max(tmm(d.walkMP), jumpLike && d.jumpMP ? tmm(d.jumpMP) + 1 : 0, d.motion === 'umu' ? tmm(d.jumpMP) : 0);
  let factor = 1 + best / 10 + 0.1;
  if (flags('F_CAMO_SYSTEM') || mms.some(({ e }) => e?.id === 'Camo System')) factor += 0.2;
  const armorKind = armorType?.armorType ?? '';
  if (armorKind === 'BA_STEALTH_IMP') factor += 0.3;
  else if (/BA_STEALTH/.test(armorKind)) factor += 0.2;
  if (armorKind === 'BA_MIMETIC') factor += 0.3;
  defensive *= factor;

  // Offensive: squad weapons, squad support weapon, then anti-'Mech claws and arm weapons a second time.
  const isClaw = (e?: MMItem) => has(e, 'F_VIBROCLAW') || has(e, 'F_MAGNET_CLAW');
  const offensiveWeapon = (e?: MMItem) => isWeapon(e) && !has(e, 'F_AMS') && e!.id !== 'InfantryAssaultRifle';
  let weapons = 0;
  for (const { i, e } of mms) {
    if (offensiveWeapon(e) && !i.trooper && !i.ssw) weapons += mmBV(e);
    if (offensiveWeapon(e) && e!.kind !== 'infantryWeapon' && (i.trooper || i.ssw)) weapons += mmBV(e);
  }
  if (canMakeAntiMek(d)) {
    for (const { i, e } of mms) {
      if (isClaw(e)) weapons += mmBV(e);
      else if (offensiveWeapon(e) && e!.kind !== 'infantryWeapon' && !has(e, 'F_MISSILE') && i.mount !== 'body') weapons += mmBV(e);
    }
  }
  // Ammo: BV per shot carried, capped at the BV of the weapons it feeds.
  const ammoByType = new Map<string, number>();
  const capByType = new Map<string, number>();
  for (const { i, e } of mms) {
    if (e?.kind === 'ammo' && e.ammoType !== 'AMS') {
      const k = `${e.ammoType}:${e.rackSize}`;
      ammoByType.set(k, (ammoByType.get(k) ?? 0) + ((e.kgPerShot ?? 0) * (i.shots ?? 1)) / 1000 * mmBV(e));
    } else if (isWeapon(e) && e!.ammoType) {
      const k = `${e!.ammoType}:${e!.rackSize}`;
      capByType.set(k, (capByType.get(k) ?? 0) + mmBV(e));
    }
  }
  let ammo = 0;
  for (const [k, v] of ammoByType) ammo += Math.min(v, capByType.get(k) ?? 0);
  const equipment = mms.filter(({ i, e }) => e?.kind === 'misc' && !isClaw(e) && (!i.trooper || i.trooper === t)).reduce((a, { e }) => a + mmBV(e), 0);
  const sf = speedFactor(Math.max(d.walkMP, d.motion === 'leg' ? 0 : d.jumpMP));
  const offensive = (weapons + ammo + equipment) * sf;
  return { defensive, offensive, weapons, ammo, equipment, factor, sf };
}

export function battleArmorBV(d: BattleArmorDesign): BABreakdown {
  const n = Math.max(1, d.squadSize);
  const per = Array.from({ length: n }, (_, t) => trooperBV(d, t + 1));
  const first = per[0];
  const sum = per.reduce((a, b) => a + b.defensive + b.offensive, 0);
  const perTrooper = sum / n;
  const squadFactor = (0.9 + 0.1 * n) * n;
  const total = Math.round(perTrooper * squadFactor);
  return {
    total, perTrooper, defensive: first.defensive, offensive: first.offensive,
    lines: [
      ['Armor and defensive equipment (per trooper)', first.defensive / first.factor], [`Defensive factor`, first.factor],
      ['Weapons', first.weapons], ['Ammunition', first.ammo], ['Offensive equipment', first.equipment], ['Speed factor', first.sf],
      ['Per trooper', perTrooper], [`× squad factor (0.9 + 0.1 × ${n}) × ${n}`, squadFactor],
    ],
  };
}

export function battleArmorCost(d: BattleArmorDesign): { total: number; lines: [string, number][] } {
  const j = d.motion === 'leg' ? 0 : d.jumpMP;
  const [chassis, motive] = d.weightClass === 2 ? [100000, j * (d.motion === 'vtol' ? 100000 : 75000)]
    : d.weightClass === 3 ? [200000, j * (d.motion === 'umu' ? 100000 : 150000)]
      : d.weightClass === 4 ? [400000, j * (d.motion === 'umu' ? 150000 : 300000)]
        : [50000, 50000 * j];
  const items = d.equipment.filter((i) => onTrooper(i, 1)).map((i) => ({ i, e: getMM(i.equipmentId) }));
  const manipulators = items.filter(({ e }) => isManipulator(e)).reduce((a, { e }) => a + mmNum(e?.cost), 0);
  const armor = mmNum(getMM(d.armorId)?.cost) * d.armor;
  const equipment = items.filter(({ e }) => e && !isManipulator(e) && e.kind !== 'baArmor')
    .reduce((a, { i, e }) => a + (e!.kind === 'ammo' ? mmNum(e!.cost) * (i.shots ?? 1) : mmNum(e!.cost)), 0);
  const lines: [string, number][] = [
    ['Chassis', chassis], ['Jump / VTOL / UMU', motive], ['Ground movement', 25000 * Math.max(0, d.walkMP - 1)],
    ['Manipulators', manipulators], ['Armor', armor], ['Weapons & equipment', equipment],
  ];
  const perTrooper = lines.reduce((a, [, v]) => a + v, 0);
  lines.push([`× ${d.squadSize} troopers`, d.squadSize]);
  return { total: Math.round(perTrooper * d.squadSize), lines };
}

// ---------------------------------------------------------------------------------------------------------------
// Files and readout
// ---------------------------------------------------------------------------------------------------------------

export function parseBattleArmor(raw: unknown): BattleArmorDesign {
  const r = raw as Partial<BattleArmorDesign>;
  const base = newBattleArmor((r.era ?? '3050') as EraId, r.techBase === 'Clan' ? 'Clan' : 'IS');
  const n = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  return {
    ...base,
    mixedTech: !!r.mixedTech, chassis: String(r.chassis ?? base.chassis), model: String(r.model ?? ''),
    weightClass: Math.min(4, Math.max(0, n(r.weightClass, 2))) as BAWeightClass,
    chassisType: r.chassisType === 'quad' ? 'quad' : 'biped',
    squadSize: n(r.squadSize, base.squadSize),
    motion: (['leg', 'jump', 'vtol', 'umu'] as const).includes(r.motion as BAMotion) ? (r.motion as BAMotion) : 'leg',
    walkMP: n(r.walkMP, 1), jumpMP: n(r.jumpMP, 0),
    armorId: getMM(String(r.armorId))?.kind === 'baArmor' ? String(r.armorId) : base.armorId,
    armor: n(r.armor, 0), exoskeleton: !!r.exoskeleton,
    turret: r.turret && typeof r.turret.size === 'number' ? { size: r.turret.size, modular: !!r.turret.modular } : null,
    equipment: Array.isArray(r.equipment)
      ? r.equipment.filter((i) => i && typeof i.equipmentId === 'string').map((i) => ({ ...i, uid: newBAUid(), mount: BA_MOUNTS.includes(i.mount as BAMount) ? i.mount : null }))
      : base.equipment,
  };
}

export function baItemLabel(i: BAItem): string {
  const e = getMM(i.equipmentId);
  if (!e) return i.equipmentId;
  let s = mmName(e);
  if (e.kind === 'ammo') s += ` (${i.shots ?? 1})`;
  if (i.ssw) s += ' [SSW]';
  if (i.dwp) s += ' [DWP]';
  if (i.apm) s = `  → ${s}`;
  return s;
}

export function battleArmorReadout(d: BattleArmorDesign): string {
  const s = computeBattleArmor(d);
  const era = getEra(d.era);
  const kg = (t: number) => `${Math.round(t * 1000)} kg`;
  const lines = [
    `${d.chassis} ${d.model}`.trim(),
    '',
    `Type: ${BA_WEIGHT_CLASS_NAMES[d.weightClass]} ${d.chassisType} battle armor${d.exoskeleton ? ' (exoskeleton)' : ''}`,
    `Squad: ${d.squadSize} troopers, ${kg(s.weights.total)} each (limit ${kg(s.trooperLimit)})`,
    `Tech Base: ${d.mixedTech ? 'Mixed' : TECH_BASE_NAMES[d.techBase]}`,
    era ? `Era: ${era.name} (${era.year})` : '',
    `Battle Value: ${battleArmorBV(d).total.toLocaleString('en-US')}`,
    `Cost: ${battleArmorCost(d).total.toLocaleString('en-US')} C-bills`,
    '',
    `Movement: ${d.walkMP} ground${d.motion !== 'leg' ? `, ${d.jumpMP} ${BA_MOTION_NAMES[d.motion].toLowerCase()}` : ''}`,
    `Armor: ${d.armor} points per trooper (${mmName(getMM(d.armorId) ?? ({ name: d.armorId } as MMItem))})`,
    '',
    `Chassis ${kg(s.weights.chassis)} · ground MP ${kg(s.weights.groundMP)} · ${BA_MOTION_NAMES[d.motion].toLowerCase()} ${kg(s.weights.motive)} · armor ${kg(s.weights.armor)} · equipment ${kg(s.weights.equipment)}`,
    '',
    'Equipment                        Location   Weight',
  ];
  for (const i of d.equipment) {
    const e = getMM(i.equipmentId);
    if (!e || e.kind === 'baArmor') continue;
    const loc = (i.mount ? BA_MOUNT_NAMES[i.mount] : '—') + (i.trooper ? ` (T${i.trooper})` : '');
    lines.push(`${baItemLabel(i).padEnd(33)}${loc.padEnd(11)}${kg(baItemWeight(d, i, e))}`);
  }
  return lines.filter((l, k) => l !== '' || lines[k - 1] !== '').join('\n');
}
