/**
 * Conventional infantry platoons (TechManual pp. 147–157, Tactical Operations, as implemented by MegaMek's
 * ConvInfantry / TestInfantry), Battle Value (InfantryBVCalculator) and cost (InfantryCostCalculator).
 */
import type { EraId } from './eras';
import { getEra } from './eras';
import type { TechBase } from './types';
import { TECH_BASE_NAMES } from './types';
import type { MMItem } from './mmEquipment';
import { MM_EQUIPMENT, getMM, has, mmAvailable, mmName, mmNum } from './mmEquipment';
import { getEquipment, isEquipmentAvailable } from './equipment';
import { ITEM_VALUES } from './values';

export type InfantryMotion =
  | 'leg' | 'jump' | 'motorized' | 'wheeled' | 'tracked' | 'hover' | 'vtol' | 'microlite'
  | 'umu' | 'motorized-umu' | 'submarine' | 'beast';

export const INFANTRY_MOTION_NAMES: Record<InfantryMotion, string> = {
  leg: 'Foot', jump: 'Jump', motorized: 'Motorized', wheeled: 'Mechanized (wheeled)', tracked: 'Mechanized (tracked)',
  hover: 'Mechanized (hover)', vtol: 'Mechanized (VTOL micro-copter)', microlite: 'Mechanized (VTOL microlite)',
  umu: 'SCUBA (foot)', 'motorized-umu': 'SCUBA (motorized)', submarine: 'Mechanized (submarine)', beast: 'Beast-mounted',
};

export type Specialization =
  | 'bridge-engineers' | 'demo-engineers' | 'fire-engineers' | 'mine-engineers' | 'sensor-engineers' | 'trench-engineers'
  | 'marines' | 'mountain' | 'paramedics' | 'paratroops' | 'tag' | 'xct' | 'scuba';
/** In MegaMek's bit order. */
export const SPECIALIZATIONS: readonly Specialization[] = [
  'bridge-engineers', 'demo-engineers', 'fire-engineers', 'mine-engineers', 'sensor-engineers', 'trench-engineers',
  'marines', 'mountain', 'paramedics', 'paratroops', 'tag', 'xct', 'scuba',
];
export const SPECIALIZATION_NAMES: Record<Specialization, string> = {
  'bridge-engineers': 'Bridge engineers', 'demo-engineers': 'Demolition engineers', 'fire-engineers': 'Fire engineers',
  'mine-engineers': 'Mine engineers', 'sensor-engineers': 'Sensor engineers', 'trench-engineers': 'Trench engineers',
  marines: 'Marines', mountain: 'Mountain troops', paramedics: 'Paramedics', paratroops: 'Paratroops', tag: 'TAG troops',
  xct: 'XCT (hostile environment)', scuba: 'SCUBA',
};
const ENGINEERS = new Set<Specialization>(['bridge-engineers', 'demo-engineers', 'fire-engineers', 'mine-engineers', 'sensor-engineers', 'trench-engineers']);

/** Beast mounts (Tactical Operations; MegaMek's sample mounts). */
export interface BeastMount {
  name: string; size: 'large' | 'very-large' | 'monstrous'; weight: number; mp: number;
  mode: 'leg' | 'vtol' | 'submarine'; damageDivisor: number; secondaryGroundMP: number;
}
export const BEASTS: readonly BeastMount[] = [
  { name: 'Donkey', size: 'large', weight: 0.15, mp: 2, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Coventry Kangaroo', size: 'large', weight: 0.11, mp: 3, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Horse', size: 'large', weight: 0.5, mp: 3, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Camel', size: 'large', weight: 0.65, mp: 2, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Branth', size: 'large', weight: 0.72, mp: 6, mode: 'vtol', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Odessan Raxx', size: 'large', weight: 2.4, mp: 2, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Tabiranth', size: 'large', weight: 0.25, mp: 2, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Tariq', size: 'large', weight: 0.51, mp: 5, mode: 'leg', damageDivisor: 1, secondaryGroundMP: 0 },
  { name: 'Elephant', size: 'very-large', weight: 6, mp: 2, mode: 'leg', damageDivisor: 2, secondaryGroundMP: 0 },
  { name: 'Orca', size: 'very-large', weight: 7.2, mp: 5, mode: 'submarine', damageDivisor: 2, secondaryGroundMP: 0 },
  { name: 'Hipposaur', size: 'monstrous', weight: 35.5, mp: 2, mode: 'submarine', damageDivisor: 4, secondaryGroundMP: 1 },
];
/** troops per creature, creatures per platoon, support weapons per creature. */
const BEAST_SIZE = { large: [1, 21, 0], 'very-large': [2, 7, 2], monstrous: [4, 2, 3] } as const;

export interface FieldGun { uid: string; equipmentId: string; ammoTons?: number }

export interface InfantryDesign {
  /** Master Unit List id, for designs loaded from the canon list. */
  mulId?: number;
  schemaVersion: 1;
  unitType: 'infantry';
  era: EraId;
  techBase: TechBase;
  mixedTech: boolean;
  chassis: string;
  model: string;
  motion: InfantryMotion;
  /** Beast mount name when beast-mounted. */
  beast?: string;
  squadSize: number;
  squads: number;
  primary: string;
  secondary: string | null;
  secondaryPerSquad: number;
  /** Armor kit (internal name), or null for none. */
  armorKit: string | null;
  /** Older designs: armor described by its properties instead of a kit. */
  customArmor?: { divisor: number; encumbering: boolean; spaceSuit: boolean; dest: boolean; sneakCamo: boolean; sneakIR: boolean; sneakECM: boolean } | null;
  antiMek: boolean;
  specializations: Specialization[];
  /** Tools carried (vibro-shovels, demolition charges, bridge kits...). */
  tools: string[];
  fieldGuns: FieldGun[];
  /** Cybernetic augmentations (Interstellar Operations), by MegaMek option name. */
  augmentations?: Augmentation[];
  /** One-shot disposable weapon carried by every trooper (MegaMek internal name). */
  disposable?: string | null;
}

export type Augmentation =
  | 'dermal_armor' | 'tsm_implant' | 'artificial_pain_shunt' | 'cyber_imp_visual' | 'cyber_imp_laser'
  | 'mm_implants' | 'enh_mm_implants' | 'boost_comm_implant' | 'gas_effuser_pheromone' | 'gas_effuser_toxin' | 'suicide_implants';
export const AUGMENTATION_NAMES: Record<Augmentation, string> = {
  dermal_armor: 'Dermal armor (+1 damage divisor)', tsm_implant: 'Triple-strength myomer implants',
  artificial_pain_shunt: 'Artificial pain shunt', cyber_imp_visual: 'Cybernetic eye (visual enhancement)',
  cyber_imp_laser: 'Cybernetic eye (laser sight)', mm_implants: 'Multi-modal implants',
  enh_mm_implants: 'Enhanced multi-modal implants', boost_comm_implant: 'Boosted communications implant',
  gas_effuser_pheromone: 'Gas effuser (pheromone)', gas_effuser_toxin: 'Gas effuser (toxin)', suicide_implants: 'Explosive suicide implants',
};
export const AUGMENTATIONS = Object.keys(AUGMENTATION_NAMES) as Augmentation[];
/** Disposable weapons (Tactical Operations): hand grenades and one-shot rocket launchers. */
export const disposableWeapons = (): MMItem[] => infantryWeapons().filter((e) => /^Grenade \(|^Rocket Launcher \((V-)?LAW\)$|Disposable/.test(e.name));
const aug = (d: Pick<InfantryDesign, 'augmentations'>, a: Augmentation) => !!d.augmentations?.includes(a);

let uidCounter = 0;
export const newInfantryUid = () => `in${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
export const isInfantry = (d: unknown): d is InfantryDesign => (d as { unitType?: string })?.unitType === 'infantry';

export const infantryWeapons = (): MMItem[] => MM_EQUIPMENT.filter((e) => e.kind === 'infantryWeapon');
export const armorKits = (): MMItem[] => MM_EQUIPMENT.filter((e) => has(e, 'F_ARMOR_KIT'));
export const infantryTools = (): MMItem[] => MM_EQUIPMENT.filter((e) => e.kind === 'misc' && has(e, 'F_TOOLS'));

const mechanized = (d: Pick<InfantryDesign, 'motion'>) => ['wheeled', 'tracked', 'hover', 'vtol', 'microlite', 'submarine'].includes(d.motion);
export const beastOf = (d: Pick<InfantryDesign, 'motion' | 'beast'>) => (d.motion === 'beast' ? BEASTS.find((b) => b.name === d.beast) ?? null : null);
const isEngineers = (d: Pick<InfantryDesign, 'specializations'>) => d.specializations.some((s) => ENGINEERS.has(s));

/** Ground MP and jump / VTOL / UMU MP by motive type. */
export function infantryMP(d: Pick<InfantryDesign, 'motion' | 'beast'>): { walk: number; jump: number; umu: number } {
  const beast = beastOf(d);
  if (beast) {
    if (beast.mode === 'vtol') return { walk: 1, jump: beast.mp, umu: 0 };
    if (beast.mode === 'submarine') return { walk: beast.secondaryGroundMP, jump: 0, umu: beast.mp };
    return { walk: beast.mp, jump: 0, umu: 0 };
  }
  switch (d.motion) {
    case 'jump': return { walk: 1, jump: 3, umu: 0 };
    case 'motorized': case 'tracked': return { walk: 3, jump: 0, umu: 0 };
    case 'wheeled': return { walk: 4, jump: 0, umu: 0 };
    case 'hover': return { walk: 5, jump: 0, umu: 0 };
    case 'vtol': return { walk: 1, jump: 5, umu: 0 };
    case 'microlite': return { walk: 1, jump: 6, umu: 0 };
    case 'umu': return { walk: 1, jump: 0, umu: 1 };
    case 'motorized-umu': return { walk: 1, jump: 0, umu: 2 };
    case 'submarine': return { walk: 0, jump: 0, umu: 3 };
    default: return { walk: 1, jump: 0, umu: 0 };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Limits (TestInfantry)
// ---------------------------------------------------------------------------------------------------------------

const alt = (d: InfantryDesign) => d.motion === 'microlite' || d.motion === 'motorized-umu';

export function maxSquadSize(d: InfantryDesign): number {
  const beast = beastOf(d);
  if (beast) return BEAST_SIZE[beast.size][0] === 1 ? 10 : BEAST_SIZE[beast.size][0];
  switch (d.motion) {
    case 'hover': case 'submarine': return 5;
    case 'wheeled': return 6;
    case 'tracked': return 7;
    case 'umu': case 'motorized-umu': return alt(d) ? 6 : 10;
    case 'vtol': case 'microlite': return alt(d) ? 2 : 4;
    default: return 10;
  }
}

export function maxSquads(d: InfantryDesign): number {
  const beast = beastOf(d);
  if (beast) return beast.size === 'large' ? 5 : BEAST_SIZE[beast.size][1];
  let n = ['vtol', 'microlite', 'hover', 'wheeled', 'tracked', 'submarine'].includes(d.motion) ? 4 : alt(d) ? 2 : 4;
  if (d.motion === 'leg' || d.motion === 'jump' || d.motion === 'motorized' || d.motion === 'umu') n = 5;
  if (isEngineers(d) || d.specializations.includes('mountain')) n = Math.min(n, 2);
  if (d.specializations.includes('paratroops')) n = Math.min(n, 3);
  if (d.specializations.includes('marines')) n = Math.min(n, 4);
  return n;
}

export function maxPlatoon(d: InfantryDesign): number {
  const beast = beastOf(d);
  let max = beast ? BEAST_SIZE[beast.size][1] * BEAST_SIZE[beast.size][0]
    : ({ umu: 30, 'motorized-umu': 12, hover: 20, submarine: 20, wheeled: 24, tracked: 28, vtol: 16, microlite: 8 } as Partial<Record<InfantryMotion, number>>)[d.motion] ?? 30;
  if (isEngineers(d) || d.specializations.includes('mountain')) max = Math.min(max, 20);
  return max;
}

export function maxSecondary(d: InfantryDesign): number {
  const beast = beastOf(d);
  let max = beast ? BEAST_SIZE[beast.size][2] : d.motion === 'vtol' ? 1 : d.motion === 'microlite' ? 0
    : d.motion === 'umu' ? 1 : d.motion === 'motorized-umu' ? 2 : 2;
  if (isEngineers(d)) max = 0;
  if (d.specializations.includes('mountain') || d.specializations.includes('paramedics')) max = Math.min(max, 1);
  // Dermal armor and TSM implants each allow one more secondary weapon per squad.
  return max + (aug(d, 'dermal_armor') ? 1 : 0) + (aug(d, 'tsm_implant') ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------------------------

export interface InfantrySummary {
  troopers: number;
  weight: number;
  exactWeight: number;
  mp: { walk: number; jump: number; umu: number };
  damagePerTrooper: number;
  damageDivisor: number;
  encumbering: boolean;
  canAntiMek: boolean;
  fieldGunCrew: number;
}

export function damageDivisor(d: InfantryDesign): number {
  const kit = d.armorKit ? getMM(d.armorKit) : null;
  let base = kit ? kit.damageDivisor ?? 1 : d.customArmor?.divisor ?? 1;
  // Unarmored troopers with TSM implants take double damage; dermal armor adds one to the divisor.
  if (!kit && !d.customArmor && aug(d, 'tsm_implant')) base = 0.5;
  if (aug(d, 'dermal_armor')) base += 1;
  return base * (beastOf(d)?.damageDivisor ?? 1);
}

export function isEncumbering(d: InfantryDesign): boolean {
  const kit = d.armorKit ? getMM(d.armorKit) : null;
  return kit ? has(kit, 'S_ENCUMBERING') : !!d.customArmor?.encumbering;
}

export function damagePerTrooper(d: InfantryDesign): number {
  const p = getMM(d.primary);
  if (!p) return 0;
  const s = d.secondary ? getMM(d.secondary) : null;
  const n = s ? d.secondaryPerSquad : 0;
  // Primary weapon damage is capped at 0.6 per trooper (2021 errata).
  const dmg = Math.min(0.6, p.infantryDamage ?? 0) * (d.squadSize - n) + (s?.infantryDamage ?? 0) * n;
  return d.squadSize ? dmg / d.squadSize : 0;
}

export function computeInfantry(d: InfantryDesign): InfantrySummary {
  const troopers = d.squadSize * d.squads;
  const beast = beastOf(d);
  let weight: number;
  if (beast) {
    weight = BEAST_SIZE[beast.size][0] > 1 ? (beast.weight + 0.2 * d.squadSize) * d.squads : (beast.weight + 0.2) * troopers;
  } else {
    let per = ({ motorized: 0.195, hover: 1, tracked: 1, wheeled: 1, vtol: 1.9, microlite: 1.4, jump: 0.165, umu: 0.135, 'motorized-umu': 0.295, submarine: 0.9 } as Partial<Record<InfantryMotion, number>>)[d.motion] ?? 0.085;
    if (isEngineers(d)) per += 0.1;
    if (d.specializations.includes('paratroops')) per += 0.05;
    if (d.specializations.includes('paramedics')) per += 0.05;
    if (d.antiMek) per += 0.015;
    weight = troopers * per;
    for (const g of d.fieldGuns) weight += (getEquipment(g.equipmentId)?.tons ?? 0) + (g.ammoTons ?? 0);
  }
  const gun = d.fieldGuns[0] ? getEquipment(d.fieldGuns[0].equipmentId) : null;
  return {
    troopers,
    exactWeight: weight,
    weight: Math.ceil(weight * 2 - 1e-9) / 2,
    mp: infantryMP(d),
    damagePerTrooper: damagePerTrooper(d),
    damageDivisor: damageDivisor(d),
    encumbering: isEncumbering(d),
    canAntiMek: !mechanized(d) && !isEncumbering(d) && d.fieldGuns.length === 0,
    fieldGunCrew: gun ? d.fieldGuns.length * Math.max(2, Math.ceil(gun.tons)) : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------

export interface InfantryIssue { severity: 'error' | 'warning'; message: string }

export function validateInfantry(d: InfantryDesign, s = computeInfantry(d)): InfantryIssue[] {
  const issues: InfantryIssue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  // Infantry equipment intro dates are unreliable (MegaMek does not check them either), so availability is a warning.
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const era = getEra(d.era);
  const p = getMM(d.primary);
  if (!p) error('Choose a primary weapon.');
  if (p && has(p, 'F_INF_SUPPORT')) error(`${mmName(p)} is a support weapon and can only be a secondary weapon.`);
  if (d.squadSize < 1 || d.squads < 1) error('A platoon needs at least one squad of one trooper.');
  if (d.squadSize > maxSquadSize(d)) error(`Maximum squad size is ${maxSquadSize(d)} (has ${d.squadSize}).`);
  if (d.squads > maxSquads(d)) error(`Maximum number of squads is ${maxSquads(d)} (has ${d.squads}).`);
  if (s.troopers > maxPlatoon(d)) error(`Maximum platoon size is ${maxPlatoon(d)} troopers (has ${s.troopers}).`);
  if (d.motion === 'beast' && !beastOf(d)) error('Choose a beast mount.');
  const sec = d.secondary ? getMM(d.secondary) : null;
  if (d.secondary && !sec) error(`Unknown secondary weapon "${d.secondary}".`);
  if (sec) {
    if (d.secondaryPerSquad > maxSecondary(d)) error(`At most ${maxSecondary(d)} secondary weapon(s) per squad.`);
    let crew = sec.crew ?? 1;
    if (beastOf(d)) crew = Math.ceil(crew / 2);
    // Dermal armor and TSM implants each reduce the crew a secondary weapon needs.
    crew -= (aug(d, 'dermal_armor') ? 1 : 0) + (aug(d, 'tsm_implant') ? 1 : 0);
    if (Math.max(1, crew) * d.secondaryPerSquad > d.squadSize) error('Secondary weapon crews exceed the squad size.');
    if (sec.name === 'Particle Cannon (Support)' && d.motion !== 'motorized' && d.motion !== 'tracked') {
      error('The support particle cannon may only be carried by motorized or tracked mechanized platoons.');
    }
  } else if (d.secondaryPerSquad > 0) error('Choose a secondary weapon or set secondary weapons per squad to 0.');
  if (mechanized(d) && d.antiMek) error('Mechanized infantry may not take anti-\'Mech training.');
  if (d.fieldGuns.length) {
    const ids = new Set(d.fieldGuns.map((g) => g.equipmentId));
    if (ids.size > 1) error('All field guns must be of the same type.');
    const gun0 = getEquipment(d.fieldGuns[0].equipmentId);
    // Tube and missile artillery (not artillery cannons) is field artillery: one piece per platoon.
    if (d.fieldGuns.length > 1 && gun0?.artillery && !gun0.range) error('A platoon may use only one field artillery piece.');
    if (s.fieldGunCrew > s.troopers) error(`The field guns need ${s.fieldGunCrew} crew; the platoon has ${s.troopers} troopers.`);
    if (beastOf(d)) error('Beast-mounted infantry cannot use field guns.');
  }
  for (const id of [d.primary, d.secondary, d.armorKit, ...d.tools].filter((x): x is string => !!x)) {
    const e = getMM(id);
    if (e && !mmAvailable(e, d.era, d.techBase, d.mixedTech)) warn(`${mmName(e)} is not available to ${TECH_BASE_NAMES[d.techBase]} infantry in the ${era?.name ?? d.era} era.`);
  }
  for (const g of d.fieldGuns) {
    const e = getEquipment(g.equipmentId);
    if (!e) error(`Unknown field gun "${g.equipmentId}".`);
    else if (!isEquipmentAvailable(e, d.era, d.techBase, d.mixedTech)) warn(`${e.name} is not available in the ${era?.name ?? d.era} era.`);
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------------------------
// Editing and files
// ---------------------------------------------------------------------------------------------------------------

export function newInfantry(era: EraId = '3025', techBase: TechBase = 'IS'): InfantryDesign {
  return {
    schemaVersion: 1, unitType: 'infantry', era, techBase, mixedTech: false,
    chassis: 'Foot Platoon', model: '(Rifle)', motion: 'leg', squadSize: 7, squads: 4,
    primary: 'InfantryAssaultRifle', secondary: null, secondaryPerSquad: 0,
    armorKit: techBase === 'Clan' ? 'Clan Armor Kit (All)' : 'Generic Infantry Kit',
    customArmor: null, antiMek: false, specializations: [], tools: [], fieldGuns: [],
  };
}

export function parseInfantry(raw: unknown): InfantryDesign {
  const r = raw as Partial<InfantryDesign>;
  const base = newInfantry((r.era ?? '3025') as EraId, r.techBase === 'Clan' ? 'Clan' : 'IS');
  const n = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  return {
    ...base,
    mixedTech: !!r.mixedTech, chassis: String(r.chassis ?? base.chassis), model: String(r.model ?? ''),
    motion: (Object.keys(INFANTRY_MOTION_NAMES) as InfantryMotion[]).includes(r.motion as InfantryMotion) ? (r.motion as InfantryMotion) : 'leg',
    beast: r.beast, squadSize: n(r.squadSize, base.squadSize), squads: n(r.squads, base.squads),
    primary: getMM(String(r.primary))?.kind === 'infantryWeapon' ? String(r.primary) : base.primary,
    secondary: r.secondary && getMM(r.secondary) ? r.secondary : null, secondaryPerSquad: n(r.secondaryPerSquad, 0),
    armorKit: r.armorKit && getMM(r.armorKit) ? r.armorKit : null,
    customArmor: r.customArmor ?? null, antiMek: !!r.antiMek,
    specializations: Array.isArray(r.specializations) ? r.specializations.filter((x) => SPECIALIZATIONS.includes(x)) : [],
    tools: Array.isArray(r.tools) ? r.tools.filter((x) => typeof x === 'string') : [],
    fieldGuns: Array.isArray(r.fieldGuns) ? r.fieldGuns.filter((g) => g && getEquipment(g.equipmentId)).map((g) => ({ ...g, uid: newInfantryUid() })) : [],
    ...(Array.isArray(r.augmentations) && r.augmentations.some((a) => AUGMENTATIONS.includes(a)) ? { augmentations: r.augmentations.filter((a) => AUGMENTATIONS.includes(a)) } : {}),
    ...(typeof r.disposable === 'string' && getMM(r.disposable)?.kind === 'infantryWeapon' ? { disposable: r.disposable } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Battle Value and cost
// ---------------------------------------------------------------------------------------------------------------

function tmm(mp: number): number {
  return mp <= 2 ? 0 : mp <= 4 ? 1 : mp <= 6 ? 2 : mp <= 9 ? 3 : mp <= 17 ? 4 : mp <= 24 ? 5 : 6;
}
const speedFactor = (mp: number) => Math.round(Math.pow(1 + (mp - 5) / 10, 1.2) * 100) / 100;

export interface InfantryBreakdown { total: number; defensive: number; offensive: number; lines: [string, number][]; approximate: boolean }

export function infantryBV(d: InfantryDesign): InfantryBreakdown {
  const s = computeInfantry(d);
  const kit = d.armorKit ? getMM(d.armorKit) : null;
  const flag = (f: string, custom: boolean | undefined) => (kit ? has(kit, f) : !!custom);
  let defensive = s.troopers * 1.5 * s.damageDivisor;
  const best = Math.max(tmm(s.mp.walk), s.mp.jump ? tmm(s.mp.jump) + 1 : 0, s.mp.umu ? tmm(s.mp.umu) : 0);
  let factor = 1 + best / 10;
  if (flag('S_DEST', d.customArmor?.dest)) factor += 0.2;
  if (flag('S_SNEAK_CAMO', d.customArmor?.sneakCamo)) factor += 0.2;
  if (flag('S_SNEAK_IR', d.customArmor?.sneakIR)) factor += 0.2;
  if (flag('S_SNEAK_ECM', d.customArmor?.sneakECM)) factor += 0.1;
  defensive *= factor;

  const p = getMM(d.primary);
  const sec = d.secondary ? getMM(d.secondary) : null;
  const secShooters = sec ? d.secondaryPerSquad * d.squads : 0;
  const primShooters = s.troopers - secShooters;
  const bvOf = (e: MMItem | null | undefined) => mmNum(e?.bv);
  let weapons = bvOf(p) * primShooters + bvOf(sec) * secShooters;
  // Anti-'Mech attacks count the (non-archaic) weapons a second time.
  if (s.canAntiMek) {
    if (p && !has(p, 'F_INF_ARCHAIC')) weapons += bvOf(p) * primShooters;
    if (sec && !has(sec, 'F_INF_ARCHAIC')) weapons += bvOf(sec) * secShooters;
  }
  let fieldGuns = 0;
  let ammo = 0;
  for (const g of d.fieldGuns) {
    const v = ITEM_VALUES[g.equipmentId];
    fieldGuns += v?.bv ?? 0;
    ammo += (v?.ammoBV ?? 0) * (g.ammoTons ?? 0);
  }
  ammo = Math.min(ammo, fieldGuns);
  // Disposable weapons: 0.2 × their BV per trooper. Implants per trooper: TSM +0.1, suicide +0.12, toxin effuser +0.23.
  const disposable = d.disposable ? bvOf(getMM(d.disposable)) * s.troopers * 0.2 : 0;
  const implants = s.troopers * ((aug(d, 'tsm_implant') ? 0.1 : 0) + (aug(d, 'suicide_implants') ? 0.12 : 0) + (aug(d, 'gas_effuser_toxin') ? 0.23 : 0));
  if (aug(d, 'gas_effuser_pheromone')) defensive += s.troopers * 0.05;
  const sf = speedFactor(Math.max(s.mp.walk, s.mp.jump, s.mp.umu));
  const offensive = (weapons + fieldGuns + ammo + disposable + implants) * sf;
  let type = 1;
  if (isEngineers(d)) type += 0.1;
  if (d.specializations.includes('marines')) type += 0.3;
  if (d.specializations.includes('mountain')) type += 0.2;
  if (d.specializations.includes('paratroops')) type += 0.1;
  if (d.specializations.includes('scuba')) type += 0.1;
  if (d.specializations.includes('xct')) type += 0.1;
  const lines: [string, number][] = [
    [`Troopers × 1.5 × damage divisor ${s.damageDivisor}`, s.troopers * 1.5 * s.damageDivisor], ['Defensive factor', factor],
    ['Weapons (incl. anti-\'Mech)', weapons], ...(disposable ? [['Disposable weapons (× 0.2)', disposable] as [string, number]] : []),
    ...(implants ? [['Implants', implants] as [string, number]] : []), ...(fieldGuns ? [['Field guns and ammo', fieldGuns + ammo] as [string, number]] : []),
    ['Speed factor', sf], ...(type !== 1 ? [['Specialization modifier', type] as [string, number]] : []),
  ];
  return { total: Math.round((defensive + offensive) * type), defensive, offensive, lines, approximate: false };
}

export function infantryCost(d: InfantryDesign): { total: number; lines: [string, number][]; approximate: boolean } {
  const s = computeInfantry(d);
  const p = getMM(d.primary);
  const sec = d.secondary ? getMM(d.secondary) : null;
  const secShooters = sec ? d.secondaryPerSquad * d.squads : 0;
  const disposable = d.disposable ? s.troopers * mmNum(getMM(d.disposable)?.cost) : 0;
  const weapons = (s.troopers - secShooters) * Math.sqrt(mmNum(p?.cost)) * 2000 + secShooters * Math.sqrt(mmNum(sec?.cost)) * 2000 + disposable;
  let armorEach = 0;
  const kit = d.armorKit ? getMM(d.armorKit) : null;
  if (kit) armorEach = mmNum(kit.cost);
  else if (d.customArmor) {
    const c = d.customArmor;
    if (c.divisor > 1) armorEach += c.encumbering ? 1600 : 4300;
    const sneaks = [c.sneakCamo, c.sneakECM, c.sneakIR].filter(Boolean).length;
    armorEach += c.dest ? 50000 : [0, 7000, 21000, 28000][sneaks];
    if (c.spaceSuit) armorEach += 5000;
  }
  let mult = d.antiMek ? 5 : 1;
  mult *= ({ umu: 2, 'motorized-umu': 2.5, motorized: 1.6, jump: 2.6, hover: 3.2, wheeled: 3.2, tracked: 3.2, submarine: 3.2, vtol: 4.5, microlite: 4 } as Partial<Record<InfantryMotion, number>>)[d.motion] ?? 1;
  if (isEngineers(d)) mult *= 5;
  if (d.specializations.includes('marines')) mult *= 3;
  if (d.specializations.includes('mountain')) mult *= 2;
  if (d.specializations.includes('paratroops')) mult *= 3;
  if (d.specializations.includes('xct')) mult *= 5;
  const fieldGuns = d.fieldGuns.reduce((a, g) => a + (ITEM_VALUES[g.equipmentId]?.cost ?? 0), 0);
  const mount = beastOf(d) ? 5000 * s.weight : 0;
  const total = Math.round((weapons + armorEach * s.troopers) * mult + fieldGuns + mount);
  return {
    total, approximate: false,
    lines: [['Weapons', weapons], ['Armor kits', armorEach * s.troopers], ['× motive, training and specialization', mult], ['Field guns', fieldGuns], ['Beast mounts', mount]],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------------------------------------------

/** Platoon damage by the number of troopers still standing (rounded, as on the record sheet). */
export function damageTable(d: InfantryDesign): number[] {
  const s = computeInfantry(d);
  return Array.from({ length: s.troopers }, (_, i) => Math.round(s.damagePerTrooper * (i + 1)));
}

export function infantryReadout(d: InfantryDesign): string {
  const s = computeInfantry(d);
  const era = getEra(d.era);
  const p = getMM(d.primary);
  const sec = d.secondary ? getMM(d.secondary) : null;
  const kit = d.armorKit ? getMM(d.armorKit) : null;
  const mp = s.mp;
  return [
    `${d.chassis} ${d.model}`.trim(), '',
    `Type: ${INFANTRY_MOTION_NAMES[d.motion]}${beastOf(d) ? ` (${d.beast})` : ''} platoon`,
    `Platoon: ${d.squads} squads of ${d.squadSize} (${s.troopers} troopers), ${s.weight} tons`,
    `Tech Base: ${d.mixedTech ? 'Mixed' : TECH_BASE_NAMES[d.techBase]}`,
    era ? `Era: ${era.name} (${era.year})` : '',
    `Battle Value: ${infantryBV(d).total.toLocaleString('en-US')}`,
    `Cost: ${infantryCost(d).total.toLocaleString('en-US')} C-bills`, '',
    `Movement: ${mp.walk} ground${mp.jump ? `, ${mp.jump} ${d.motion === 'jump' ? 'jump' : 'VTOL'}` : ''}${mp.umu ? `, ${mp.umu} UMU` : ''}`,
    `Primary weapon: ${p ? mmName(p) : '—'}`,
    sec ? `Secondary weapons: ${d.secondaryPerSquad} ${mmName(sec)} per squad` : 'Secondary weapons: none',
    `Damage per trooper: ${s.damagePerTrooper.toFixed(2)} · range ${Math.max(p?.infantryRange ?? 0, sec?.infantryRange ?? 0)} hexes per bracket`,
    `Armor: ${kit ? mmName(kit) : d.customArmor ? 'custom' : 'none'} (damage divisor ${s.damageDivisor}${s.encumbering ? ', encumbering' : ''})`,
    d.disposable ? `Disposable weapon: ${mmName(getMM(d.disposable) ?? ({ name: d.disposable } as MMItem))} (one per trooper)` : '',
    d.augmentations?.length ? `Augmentations: ${d.augmentations.map((a) => AUGMENTATION_NAMES[a]).join(', ')}` : '',
    d.antiMek ? 'Anti-\'Mech training' : '',
    d.specializations.length ? `Specializations: ${d.specializations.map((x) => SPECIALIZATION_NAMES[x]).join(', ')}` : '',
    d.fieldGuns.length ? `Field guns: ${d.fieldGuns.length} × ${getEquipment(d.fieldGuns[0].equipmentId)?.name} (crew ${s.fieldGunCrew})` : '',
    d.tools.length ? `Equipment: ${d.tools.map((t) => mmName(getMM(t) ?? ({ name: t } as MMItem))).join(', ')}` : '',
  ].filter((l, k, a) => l !== '' || (a[k - 1] !== '' && k < 9)).join('\n');
}
