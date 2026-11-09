/**
 * Converts MegaMek unit files (.mtf BattleMechs, .blk vehicles) from the MegaMek
 * Data repository (https://github.com/MegaMek/mm-data, CC BY-NC-SA 4.0) into
 * MechForger's bundled canon unit lists.
 *
 * Usage:  npx vite-node tools/convert-megamek.ts <path-to-mm-data>
 *
 * Only units MechForger can represent are converted (biped mechs and
 * tracked / wheeled / hover / VTOL / naval vehicles using modeled equipment);
 * everything else is skipped and counted in the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  ArmorAllocation, ArmorType, CockpitType, EngineType, GyroType, HeatSinkType, Location, MechDesign, MountedItem,
  TechBase,
} from '../src/rules/types';
import type { EraId } from '../src/rules/eras';
import { ERAS } from '../src/rules/eras';
import type { Equipment } from '../src/rules/equipment';
import { ALL_EQUIPMENT, getEquipment, itemSlots } from '../src/rules/equipment';
import { computeMech } from '../src/rules/construction';
import { validate } from '../src/rules/validation';
import { mechBV, mechCost, vehicleBV, vehicleCost } from '../src/rules/battleValue';
import type { MotiveType, VehicleDesign, VehicleEngineType, VehicleLocation } from '../src/rules/vehicle';
import { computeVehicle, emptyVehicleArmor, validateVehicle } from '../src/rules/vehicle';
import { armorPointsPerTon } from '../src/rules/tables';
import { encodeMech, encodeSupport, encodeVehicle } from '../src/data/canonFormat';
import type { SVItem, SVLocation, SVType, SupportVehicleDesign, TechRating } from '../src/rules/support';
import { TECH_RATINGS, computeSupport, emptyTransport, kgPerFuelPoint, validateSupport } from '../src/rules/support';
import type { CanonEntry } from '../src/data/canonFormat';

class Unsupported extends Error {}
const fail = (why: string): never => { throw new Unsupported(why); };

// ---------------------------------------------------------------------------
// Equipment name resolution
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** MegaMek base names (normalized, tech prefix removed) → MechForger names (normalized). */
const ALIASES: Record<string, string> = {
  autocannon2: 'ac2', autocannon5: 'ac5', autocannon10: 'ac10', autocannon20: 'ac20',
  lbxac2: 'lb2xac', lbxac5: 'lb5xac', lbxac10: 'lb10xac', lbxac20: 'lb20xac',
  snppc: 'snubnoseppc', mg: 'machinegun', lightmg: 'lightmachinegun', heavymg: 'heavymachinegun',
  hag20: 'hyperassaultgauss20', hag30: 'hyperassaultgauss30', hag40: 'hyperassaultgauss40',
  heavysmalllaser: 'smallheavylaser', heavymediumlaser: 'mediumheavylaser', heavylargelaser: 'largeheavylaser',
  magshotgr: 'magshotgaussrifle', narcbeacon: 'narcmissilebeacon', improvednarc: 'inarclauncher',
  c3masterunit: 'c3mastercomputer', c3iunit: 'improvedc3computer', artemisiv: 'artemisivfcs',
  ams: 'antimissilesystem', ecmsuite: 'ecmsuite', guardianecm: 'guardianecmsuite',
  flamervehicle: 'flamer', erflamer: 'erflamer',
};

/** MegaMek names (normalized, tech prefix removed) of utility equipment. */
const UTILITY_NAMES: Record<string, string> = {
  searchlight: 'searchlight', searchlightmounted: 'searchlight', hhsearchlight: 'searchlight-handheld',
  lifthoistarrestinghoist: 'lift-hoist', lifthoist: 'lift-hoist', paramedicequipment: 'paramedic-equipment',
  cargocontainer10tons: 'cargo-container', communicationsequipment: 'communications-equipment', commsgear: 'communications-equipment',
  bulldozer: 'bulldozer', backhoe: 'backhoe', chainsaw: 'chainsaw', dualsaw: 'dual-saw', rockcutter: 'rock-cutter',
  combine: 'combine', salvagearm: 'salvage-arm', spotwelder: 'spot-welder', heavydutypiledriver: 'pile-driver',
  fieldkitchen: 'field-kitchen', mobilefieldbase: 'mobile-field-base', lifeboatmaritime: 'lifeboat-maritime',
  lifeboatatmospheric: 'lifeboat-atmospheric', refuelingdrogue: 'refueling-drogue', mastmount: 'mast-mount',
  trailerhitch: 'trailer-hitch', hitch: 'trailer-hitch', vehicularminedispenser: 'mine-dispenser',
  minesweeper: 'mine-sweeper', remotesensordispenser: 'remote-sensor-dispenser',
  manipulatornonmechnonbattlearmor: 'manipulator', reconcamera: 'recon-camera',
};

/** Structural crit names handled outside the equipment list. */
const FIXED = new Set([
  'empty', 'fusionengine', 'engine', 'gyro', 'sensors', 'lifesupport', 'cockpit', 'smallcockpit', 'shoulder',
  'upperarmactuator', 'lowerarmactuator', 'handactuator', 'hip', 'upperlegactuator', 'lowerlegactuator',
  'footactuator', 'xlgyro', 'compactgyro', 'heavydutygyro',
]);

const byKey = new Map<string, Equipment[]>();
for (const eq of ALL_EQUIPMENT) {
  if (eq.category === 'Ammo') continue;
  const k = norm(eq.name);
  byKey.set(k, [...(byKey.get(k) ?? []), eq]);
}

function splitTech(raw: string): { tech: TechBase | null; base: string } {
  let s = raw.trim();
  let tech: TechBase | null = null;
  const m = /^(Clan\s+|CL(?=[A-Z])|IS\s+|IS(?=[A-Z]))/.exec(s);
  if (m) {
    tech = m[1].startsWith('IS') ? 'IS' : 'Clan';
    s = s.slice(m[1].length);
  }
  return { tech, base: s };
}

function pick(list: Equipment[] | undefined, tech: TechBase | null, unitTech: TechBase): Equipment | undefined {
  if (!list?.length) return undefined;
  const order: (TechBase | 'Both')[] = tech ? [tech, 'Both'] : ['IS', 'Both', 'Clan'];
  if (!tech && unitTech === 'Clan') order.splice(0, 3, 'Clan', 'Both', 'IS');
  for (const t of order) {
    const hit = list.find((e) => e.techBase === t);
    if (hit) return hit;
  }
  return undefined;
}

/** Resolve an ammo name such as "IS Ammo LRM-15 Artemis-capable" to a MechForger ammo id. */
function resolveAmmo(raw: string, unitTech: TechBase): string | null {
  if (/artemis v/i.test(raw)) return null;
  const { tech } = splitTech(raw);
  const artemis = /artemis.capable/i.test(raw);
  const half = /half/i.test(raw);
  let s = norm(raw.replace(/\(clan\)/gi, '')).replace(/^(clan|is|cl)/, '').replace(/ammo|pods|full|half|artemiscapable/g, '');
  s = s.replace(/^ammo/, '');
  const families: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^ultraac(\d+)/, (m) => `uac-${m[1]}`], [/^rotaryac(\d+)/, (m) => `rac-${m[1]}`],
    [/^lb(\d+)x/, (m) => `lb-${m[1]}x`], [/^ac(\d+)/, (m) => `ac-${m[1]}`],
    [/^streaksrm(\d+)/, (m) => `streak-srm-${m[1]}`], [/^srm(\d+)/, (m) => `srm-${m[1]}`],
    [/^lrm(\d+)/, (m) => `lrm-${m[1]}`], [/^mrm(\d+)/, (m) => `mrm-${m[1]}`], [/^atm(\d+)/, (m) => `atm-${m[1]}`],
    [/^thunderbolt(\d+)/, (m) => `thunderbolt-${m[1]}`], [/^mml(\d)(lrm|srm)/, (m) => `mml-${m[1]}|${m[2]}`],
    [/^heavygauss/, () => 'heavy-gauss-rifle'], [/^lightgauss/, () => 'light-gauss-rifle'],
    [/^apgauss/, () => 'ap-gauss-rifle'], [/^hyperassaultgaussrifle(\d+)/, (m) => `hag-${m[1]}`],
    [/^gauss/, () => 'gauss-rifle'], [/^magshot/, () => 'magshot'],
    [/^light(mg|machinegun)/, () => 'light-machine-gun'], [/^heavy(mg|machinegun)/, () => 'heavy-machine-gun'],
    [/^(mg|machinegun)/, () => 'machine-gun'], [/^(ams|antimissilesystem)/, () => 'ams'],
    [/^inarc/, () => 'inarc'], [/^narc/, () => 'narc'], [/^plasmarifle/, () => 'plasma-rifle'],
    [/^plasmacannon/, () => 'plasma-cannon'],
  ];
  for (const [re, f] of families) {
    const m = re.exec(s);
    if (!m) continue;
    const [weapon, mml] = f(m).split('|');
    const clanFirst = tech === 'Clan' || (!tech && unitTech === 'Clan');
    const candidates = clanFirst ? [`clan-${weapon}`, weapon] : [weapon, `clan-${weapon}`];
    for (const w of candidates) {
      const id = mml ? `ammo-${w}-${mml}` : `ammo-${w}${artemis ? '-artemis' : ''}${half ? '-half' : ''}`;
      if (getEquipment(id)) return id;
    }
    return null;
  }
  return null;
}

type Resolved = { kind: 'fixed' } | { kind: 'item'; id: string } | { kind: 'unknown'; name: string };

function resolveName(raw: string, unitTech: TechBase): Resolved {
  const name = raw.replace(/\s*\((R|OMNIPOD|ARMORED)\)/gi, '').trim();
  const n = norm(name);
  if (FIXED.has(n) || /engine$/.test(n)) return { kind: 'fixed' };
  if (/ammo|pods$/i.test(name)) {
    const id = resolveAmmo(name, unitTech);
    return id ? { kind: 'item', id } : { kind: 'unknown', name };
  }
  const { tech, base } = splitTech(name);
  const b = norm(base);
  const structural: Record<string, string> = {
    endosteel: 'endo-steel', ferrofibrous: 'ferro-fibrous', lightferrofibrous: 'ferro-fibrous',
    heavyferrofibrous: 'ferro-fibrous', triplestrengthmyomer: 'tsm', heatsink: 'heat-sink',
    jumpjet: 'jump-jet', improvedjumpjet: 'improved-jump-jet', case: 'case',
  };
  if (structural[b]) return { kind: 'item', id: structural[b] };
  if (UTILITY_NAMES[b]) return { kind: 'item', id: UTILITY_NAMES[b] };
  if (b === 'doubleheatsink') {
    return { kind: 'item', id: (tech ?? unitTech) === 'Clan' ? 'clan-double-heat-sink' : 'double-heat-sink' };
  }
  const key = ALIASES[b] ?? b;
  const eq = pick(byKey.get(key), tech, unitTech);
  return eq ? { kind: 'item', id: eq.id } : { kind: 'unknown', name };
}

/** Point ammo at the tech base of the launcher actually mounted (MegaMek names some ammo generically). */
function fixAmmoTech(items: { equipmentId: string }[]) {
  const mounted = new Set(items.map((i) => i.equipmentId));
  for (const i of items) {
    const eq = getEquipment(i.equipmentId);
    if (!eq?.ammoFor || mounted.has(eq.ammoFor)) continue;
    const other = eq.ammoFor.startsWith('clan-') ? eq.ammoFor.slice(5) : `clan-${eq.ammoFor}`;
    const swapped = i.equipmentId.replace(eq.ammoFor, other);
    if (mounted.has(other) && getEquipment(swapped)) i.equipmentId = swapped;
  }
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

function eraForYear(year: number): EraId {
  let id: EraId = ERAS[0].id;
  for (const e of ERAS) if (year >= e.year) id = e.id;
  return id;
}

const ERA_ERROR = /cannot be used in|not available in|cannot be built in/;

/** Earliest era (from the intro year) in which the design passes the availability rules. */
function settleEra<T extends { era: EraId }>(d: T, year: number, check: (d: T) => string[]): T {
  const start = ERAS.findIndex((e) => e.id === eraForYear(year));
  for (let i = Math.max(0, start); i < ERAS.length; i++) {
    const cand = { ...d, era: ERAS[i].id };
    if (!check(cand).some((m) => ERA_ERROR.test(m))) return cand;
  }
  return { ...d, era: ERAS[Math.max(0, start)].id };
}

// ---------------------------------------------------------------------------
// MTF (BattleMechs)
// ---------------------------------------------------------------------------

const LOC_HEADERS: Record<string, Location> = {
  'Left Arm:': 'LA', 'Right Arm:': 'RA', 'Left Torso:': 'LT', 'Right Torso:': 'RT',
  'Center Torso:': 'CT', 'Head:': 'HD', 'Left Leg:': 'LL', 'Right Leg:': 'RL',
  // Quads: front legs use the arm codes, rear legs the leg codes (as in MegaMek).
  'Front Left Leg:': 'LA', 'Front Right Leg:': 'RA', 'Rear Left Leg:': 'LL', 'Rear Right Leg:': 'RL',
};

interface ParsedMech {
  design: MechDesign;
  year: number;
  rulesLevel: number;
  omni: boolean;
  mulId?: number;
  source: string;
  /** Items flagged OMNIPOD (for grouping configurations). */
  pods: Set<MountedItem>;
}

function parseMtf(text: string): ParsedMech {
  const lines = text.split(/\r?\n/);
  const kv = new Map<string, string>();
  const crits: Partial<Record<Location, string[]>> = {};
  let loc: Location | null = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith('#')) continue;
    if (LOC_HEADERS[l]) { loc = LOC_HEADERS[l]; crits[loc] = []; continue; }
    if (!l) { loc = null; continue; }
    if (loc) { crits[loc]!.push(l); continue; }
    const m = /^([^:]+):(.*)$/.exec(l);
    if (m && !kv.has(m[1].toLowerCase())) kv.set(m[1].toLowerCase(), m[2].trim());
  }
  const get = (k: string) => kv.get(k) ?? '';

  const config = get('config');
  if (!['Biped', 'Biped OmniMek', 'Quad', 'Quad OmniMek'].includes(config)) fail(`config ${config}`);
  const quad = config.startsWith('Quad');
  const tbRaw = get('techbase');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(tbRaw) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(tbRaw);
  const tonnage = Number(get('mass'));
  if (!(tonnage >= 20 && tonnage <= 100 && tonnage % 5 === 0)) fail(`tonnage ${tonnage}`);
  const walkMP = Number(get('walk mp'));

  const eng = get('engine');
  const rating = Number(/^(\d+)/.exec(eng)?.[1]);
  if (rating !== tonnage * walkMP) fail('engine rating does not match walking MP');
  const engineType: EngineType = /XXL|ICE|Fuel|Fission/.test(eng) ? fail(`engine ${eng}`)
    : /XL/.test(eng) ? 'xl' : /Light/.test(eng) ? 'light' : /Compact/.test(eng) ? 'compact' : 'standard';

  const st = get('structure');
  const structureType = /Endo Steel$/.test(st) ? 'endo-steel' : /Standard$/.test(st) || st === '' ? 'standard' : fail(`structure ${st}`);
  const ar = get('armor');
  const armorType: ArmorType = /^Standard/.test(ar) ? 'standard' : /^Ferro-Fibrous\(/.test(ar) ? 'ferro-fibrous'
    : /^Light Ferro/.test(ar) ? 'light-ferro' : /^Heavy Ferro/.test(ar) ? 'heavy-ferro' : fail(`armor ${ar}`);
  const hs = get('heat sinks');
  const hsTotal = Number(/^(\d+)/.exec(hs)?.[1]);
  const heatSinkType: HeatSinkType = /Double/.test(hs) ? 'double' : /Single/.test(hs) ? 'single' : fail(`heat sinks ${hs}`);
  const gy = get('gyro');
  const gyroType: GyroType = !gy || /^Standard/.test(gy) ? 'standard' : /^XL/.test(gy) ? 'xl'
    : /^Compact/.test(gy) ? 'compact' : /^Heavy Duty/.test(gy) ? 'heavy-duty' : fail(`gyro ${gy}`);
  const ck = get('cockpit');
  const cockpitType: CockpitType = !ck || /^Standard/.test(ck) ? 'standard' : /^Small/.test(ck) ? 'small' : fail(`cockpit ${ck}`);
  const my = get('myomer');
  const myomer = !my || my === 'Standard' ? 'standard' : my === 'Triple-Strength' ? 'tsm' : fail(`myomer ${my}`);
  if (kv.has('ejection') || kv.has('lam')) fail('special systems');

  const armor: ArmorAllocation = {
    HD: Number(get('hd armor')), CT: Number(get('ct armor')), CTR: Number(get('rtc armor')),
    LT: Number(get('lt armor')), LTR: Number(get('rtl armor')), RT: Number(get('rt armor')), RTR: Number(get('rtr armor')),
    LA: Number(get(quad ? 'fll armor' : 'la armor')), RA: Number(get(quad ? 'frl armor' : 'ra armor')),
    LL: Number(get(quad ? 'rll armor' : 'll armor')), RL: Number(get(quad ? 'rrl armor' : 'rl armor')),
  };
  for (const [k, v] of Object.entries(armor)) if (!Number.isFinite(v)) fail(`armor value ${k}`);

  const arm = (l: Location) => ({
    lowerArm: !!crits[l]?.includes('Lower Arm Actuator'),
    hand: !!crits[l]?.includes('Hand Actuator'),
  });

  const sizing = { tonnage, techBase, equipment: [] as MountedItem[] };
  const equipment: MountedItem[] = [];
  const pods = new Set<MountedItem>();
  let uid = 0;
  for (const [l, slots] of Object.entries(crits) as [Location, string[]][]) {
    let i = 0;
    while (i < slots.length) {
      const raw = slots[i];
      let j = i + 1;
      while (j < slots.length && slots[j] === raw) j++;
      const run = j - i;
      i = j;
      const r = resolveName(raw, techBase);
      if (r.kind === 'fixed') continue;
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      // Clan CASE is built in (weightless); MechForger does not list it.
      if ((r as { id: string }).id === 'case' && techBase === 'Clan' && /^CL|^Clan/.test(raw)) continue;
      const eq = getEquipment((r as { id: string }).id)!;
      const variable = eq.variableWeight === 'masc' || eq.variableWeight === 'targetingComputer';
      const size = variable ? run : itemSlots(eq, sizing);
      if (size <= 0 || run % size !== 0) fail(`split or mis-sized item "${raw}"`);
      for (let n = 0; n < run / size; n++) {
        const item: MountedItem = { uid: `c${uid++}`, equipmentId: eq.id, location: l };
        if (/\(R\)/.test(raw)) item.rear = true;
        equipment.push(item);
        if (/\(OMNIPOD\)/.test(raw)) pods.add(item);
      }
    }
  }
  fixAmmoTech(equipment);
  const externalHS = equipment.filter((e) => /heat-sink$/.test(e.equipmentId)).length;
  const jets = equipment.filter((e) => /jump-jet$/.test(e.equipmentId));
  const design: MechDesign = {
    schemaVersion: 1, era: '3025', techBase, mixedTech,
    structureType, engineType, gyroType, cockpitType, heatSinkType,
    jumpJetType: jets.some((e) => e.equipmentId === 'improved-jump-jet') ? 'improved' : 'standard',
    armorType, myomer, config: quad ? 'quad' : 'biped', omni: null,
    chassis: get('clanname') ? `${get('clanname')} (${get('chassis')})` : get('chassis'),
    model: get('model'), tonnage, walkMP,
    engineHeatSinks: hsTotal - externalHS, armor,
    actuators: quad ? { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } } : { LA: arm('LA'), RA: arm('RA') },
    equipment,
  };
  return {
    design, year: Number(get('era')) || 3025, rulesLevel: Number(get('rules level')) || 0,
    omni: config.endsWith('OmniMek'), mulId: Number(get('mul id')) || undefined,
    source: get('source'), pods,
  };
}

// ---------------------------------------------------------------------------
// BLK (vehicles)
// ---------------------------------------------------------------------------

const BLK_ENGINES: Record<string, VehicleEngineType> = { 0: 'standard', 1: 'ice', 2: 'xl', 4: 'light', 5: 'compact' };
const BLK_MOTION: Record<string, MotiveType> = {
  Tracked: 'tracked', Wheeled: 'wheeled', Hover: 'hover', VTOL: 'vtol', Naval: 'naval',
  Hydrofoil: 'hydrofoil', Submarine: 'submarine',
};
const BLK_ARMOR: Record<string, ArmorType> = { 0: 'standard', 1: 'ferro-fibrous', 5: 'light-ferro', 6: 'heavy-ferro' };

function parseBlk(text: string): { design: VehicleDesign; year: number; rulesLevel: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';

  const unitType = one('UnitType');
  if (unitType !== 'Tank' && unitType !== 'VTOL' && unitType !== 'Naval') fail(`unit type ${unitType}`);
  if (tags.has('omni')) fail('OmniVehicle');
  const motive = BLK_MOTION[one('motion_type')] ?? fail(`motion ${one('motion_type')}`);
  const typeStr = one('type');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(typeStr);
  const tonnage = Number(one('tonnage'));
  const engineType = BLK_ENGINES[one('engine_type')] ?? fail(`engine ${one('engine_type')}`);
  const armorType = BLK_ARMOR[one('armor_type')] ?? fail(`armor ${one('armor_type')}`);
  if (tags.has('internal_type') && one('internal_type') !== '-1' && one('internal_type') !== '0') fail('structure');
  for (const k of ['Front Turret Equipment', 'Rear Turret Equipment', 'Front Right Equipment', 'Front Left Equipment', 'Rear Right Equipment', 'Rear Left Equipment']) {
    if (tags.has(k)) fail(k);
  }
  const turret = tags.has('Turret Equipment');
  // Troop compartments and cargo bays (seats, quarters and handles are ignored).
  let cargo = 0;
  for (const t of tags.get('transporters') ?? []) {
    const m = /^(troopspace|cargobay|liquidcargobay|insulatedcargobay|refrigeratedcargobay):([\d.]+)/i.exec(t);
    if (m) cargo += Number(m[2]);
    else if (!/^(BattleArmorHandles|standardseats|pillionseats)/i.test(t)) fail(`transporter ${t.split(':')[0]}`);
  }
  const armorVals = (tags.get('armor') ?? []).map(Number);
  // Order: front, right, left, rear, then turret or rotor.
  const armor = emptyVehicleArmor();
  [armor.FR, armor.RS, armor.LS, armor.RR] = armorVals;
  if (motive === 'vtol') armor.RO = armorVals[4] ?? 0;
  else if (turret) armor.TU = armorVals[4] ?? 0;

  const blocks: [string, VehicleLocation][] = [
    ['Front Equipment', 'FR'], ['Right Equipment', 'RS'], ['Left Equipment', 'LS'], ['Rear Equipment', 'RR'],
    ['Turret Equipment', 'TU'], ['Body Equipment', 'BD'],
  ];
  const equipment = [];
  let uid = 0;
  for (const [tag, loc] of blocks) {
    for (const raw of tags.get(tag) ?? []) {
      const r = resolveName(raw, techBase);
      if (r.kind === 'fixed') continue;
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      const id = (r as { id: string }).id;
      const eq = getEquipment(id)!;
      if (eq.managed && id !== 'heat-sink') fail(`mech-only item ${id}`);
      if (id === 'heat-sink') continue;
      if (id === 'case' && techBase === 'Clan') continue; // Clan CASE is built in
      equipment.push({ uid: `v${uid++}`, equipmentId: id, location: eq.isWeapon ? loc : 'BD' as VehicleLocation });
    }
  }
  const design: VehicleDesign = {
    schemaVersion: 1, unitType: 'vehicle', era: '3025', techBase, mixedTech,
    chassis: one('Name'), model: one('Model'), motive, tonnage, cruiseMP: Number(one('cruiseMP')),
    engineType, structureType: 'standard', armorType, turret, heatSinks: 0, armor, equipment,
    ...(cargo > 0 ? { cargo } : {}),
  };
  fixAmmoTech(design.equipment);
  // Vehicles carry exactly the heat sinks their energy weapons need (fusion engines include 10).
  const energy = computeVehicle(design).energyHeat;
  design.heatSinks = Math.max(engineType === 'ice' ? 0 : 10, energy);
  return { design, year: Number(one('year')) || 3025, rulesLevel: Number(/Level (\d)/.exec(typeStr)?.[1]) || 0, mulId: Number(one('mul id:')) || undefined, source: one('source') };
}


// ---------------------------------------------------------------------------
// BLK support vehicles
// ---------------------------------------------------------------------------

const SV_MOTION: Record<string, SVType> = {
  Wheeled: 'wheeled', Tracked: 'tracked', Hover: 'hover', VTOL: 'vtol', Naval: 'naval', Hydrofoil: 'naval',
  Submarine: 'naval', Rail: 'rail', Maglev: 'rail', Aerodyne: 'fixed-wing', Airship: 'airship',
};
const SV_ENGINES: Record<string, SupportVehicleDesign['engineType']> = {
  0: 'fusion', 1: 'ice', 6: 'fuel-cell', 7: 'fission', 8: 'none', 9: 'maglev', 10: 'steam', 11: 'battery', 12: 'solar', 13: 'external',
};
const CHASSIS_MOD_NAMES: [RegExp, string][] = [
  [/armored/i, 'armored'], [/off-?road/i, 'off-road'], [/tractor/i, 'tractor'], [/trailer\]|trailerchassis|\[trailer/i, 'trailer'],
  [/amphibious/i, 'amphibious'], [/environmental sealing/i, 'environmental-sealing'], [/bicycle/i, 'bicycle'],
  [/ultra-?light/i, 'ultra-light'], [/vstol/i, 'vstol'], [/stol/i, 'stol'], [/submersible/i, 'submersible'], [/hydrofoil/i, 'hydrofoil'],
  [/prop/i, 'prop'], [/dune ?buggy/i, 'dune-buggy'], [/convertible/i, 'convertible'], [/snowmobile/i, 'snowmobile'],
  [/monocycle/i, 'monocycle'], [/external ?power/i, 'external-power-pickup'],
];

function parseSupportBlk(text: string): { design: SupportVehicleDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';
  const unitType = one('UnitType');
  if (!['SupportTank', 'SupportVTOL', 'FixedWingSupport', 'LargeSupportTank'].includes(unitType)) fail(`unit type ${unitType}`);
  if (tags.has('omni')) fail('Omni support vehicle');
  const svType = SV_MOTION[one('motion_type')] ?? fail(`motion ${one('motion_type')}`);
  const typeStr = one('type');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const tonnage = Number(one('tonnage'));
  const engineType = SV_ENGINES[one('engine_type')] ?? fail(`engine ${one('engine_type')}`);
  const armorCode = Number(one('armor_type'));
  if (!(armorCode >= 43 && armorCode <= 51) && tags.has('armor')) fail(`non-BAR armor ${armorCode}`);
  const bar = Number(one('barrating')) || (armorCode - 41);
  const rating = (k: string): TechRating => TECH_RATINGS[Number(one(k))] ?? fail(`tech rating ${k}`);
  const aero = svType === 'fixed-wing' || svType === 'airship';
  for (const k of ['Front Turret Equipment', 'Rear Turret Equipment', 'Front Right Equipment', 'Front Left Equipment', 'Rear Right Equipment', 'Rear Left Equipment', 'Wings Equipment']) {
    if ((tags.get(k) ?? []).length) fail(k);
  }
  const turret = tags.has('Turret Equipment');
  const armorVals = (tags.get('armor') ?? []).map(Number);
  const armor: SupportVehicleDesign['armor'] = {};
  if (aero) [armor.NO, armor.LW, armor.RW, armor.AF] = armorVals;
  else {
    [armor.FR, armor.RS, armor.LS, armor.RR] = armorVals;
    if (svType === 'vtol') armor.RO = armorVals[4] ?? 0;
    else if (turret) armor.TU = armorVals[4] ?? 0;
  }
  const blocks: [string, SVLocation][] = aero
    ? [['Nose Equipment', 'NO'], ['Left Wing Equipment', 'LW'], ['Right Wing Equipment', 'RW'], ['Aft Equipment', 'AF'], ['Body Equipment', 'BD']]
    : [['Front Equipment', 'FR'], ['Right Equipment', 'RS'], ['Left Equipment', 'LS'], ['Rear Equipment', 'RR'], ['Turret Equipment', 'TU'], ['Body Equipment', 'BD']];
  const equipment: SVItem[] = [];
  const chassisMods = new Set<string>();
  if (one('motion_type') === 'Hydrofoil') chassisMods.add('hydrofoil');
  if (one('motion_type') === 'Submarine') chassisMods.add('submersible');
  let fireControl: SupportVehicleDesign['fireControl'] = 'none';
  let uid = 0;
  for (const [tag, loc] of blocks) {
    for (const rawLine of tags.get(tag) ?? []) {
      if (/:OMNI/.test(rawLine)) fail('pod-mounted equipment');
      const size = Number(/:SIZE:([\d.]+)/.exec(rawLine)?.[1] ?? 1);
      const raw = rawLine.replace(/:SIZE:[\d.]+/, '');
      if (/chassis|environmental sealing$/i.test(raw) && !/\(mech\)/i.test(raw)) {
        const mod = CHASSIS_MOD_NAMES.find(([r]) => r.test(raw));
        if (!mod) fail(`chassis mod "${raw}"`);
        chassisMods.add(mod![1]);
        continue;
      }
      if (/^Basic Fire Control$/i.test(raw)) { fireControl = 'basic'; continue; }
      if (/^Advanced Fire Control$/i.test(raw)) { fireControl = 'advanced'; continue; }
      const r = resolveName(raw, techBase);
      if (r.kind === 'fixed') continue;
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      const id = (r as { id: string }).id;
      const eq = getEquipment(id)!;
      if (id === 'heat-sink') continue;
      if (id === 'case' && techBase === 'Clan') continue;
      if (eq.managed) fail(`mech-only item ${id}`);
      const count = id === 'communications-equipment' ? Math.round(size) : 1;
      for (let n = 0; n < count; n++) equipment.push({ uid: `s${uid++}`, equipmentId: id, location: eq.isWeapon ? loc : 'BD' });
    }
  }
  const transport = emptyTransport();
  for (const t of tags.get('transporters') ?? []) {
    const [kind, amount] = t.split(':');
    const n = Number(amount);
    switch (kind.toLowerCase()) {
      case 'standardseats': transport.seats += n; break;
      case 'pillionseats': transport.pillionSeats += n; break;
      case 'ejectionseats': transport.ejectionSeats += n; break;
      case 'steeragequarters': transport.steerage += n; break;
      case '2ndclassquarters': transport.secondClass += n; break;
      case '1stclassquarters': transport.firstClass += n; break;
      case 'crewquarters': transport.crewQuarters += n; break;
      // Special cargo bays weigh more than their capacity.
      case 'cargobay': transport.cargo += n; break;
      case 'liquidcargobay': transport.cargo += Math.round((n / 0.91) * 1000) / 1000; break;
      case 'insulatedcargobay': case 'refrigeratedcargobay': transport.cargo += Math.round((n / 0.87) * 1000) / 1000; break;
      case 'troopspace': transport.troops += n; break;
      case 'battlearmorhandles - troopers': break;
      default: fail(`transporter ${kind}`);
    }
  }
  const design: SupportVehicleDesign = {
    schemaVersion: 1, unitType: 'support', era: '3025', techBase, mixedTech: /^Mixed/.test(typeStr),
    chassis: one('Name'), model: one('Model'), svType, tonnage,
    cruiseMP: Number(aero ? one('SafeThrust') : one('cruiseMP')) || 0,
    structureTech: rating('structural_tech_rating'), engineTech: rating('engine_tech_rating'), armorTech: rating('armor_tech_rating'),
    engineType, bar, chassisMods: [...chassisMods], fuel: 0, turret, fireControl, armor, transport, equipment,
  };
  const fuel = Number(one('fuel')) || 0;
  design.fuel = aero ? Math.ceil((fuel * kgPerFuelPoint(design)) / 1000 * 2 - 1e-9) / 2 : fuel;
  if (aero && tonnage < 5) design.fuel = Math.ceil(fuel * kgPerFuelPoint(design)) / 1000;
  fixAmmoTech(design.equipment);
  return { design, year: Number(one('year')) || 3025, mulId: Number(one('mul id:')) || undefined, source: one('source') };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

function main() {
  const root = process.argv[2];
  if (!root) throw new Error('usage: vite-node tools/convert-megamek.ts <mm-data path>');
  const outDir = path.resolve('src/data/canon');
  fs.mkdirSync(outDir, { recursive: true });
  const reasons = new Map<string, number>();
  const note = (why: string) => {
    const k = why.replace(/"[^"]*"/, (q) => q).slice(0, 80);
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  };

  // --- Mechs
  const mtfs = walk(path.join(root, 'data/mekfiles/meks'), '.mtf').sort();
  const plain: CanonEntry[] = [];
  const omniGroups = new Map<string, ParsedMech[]>();
  let mechSkipped = 0;
  const seen = new Set<string>();
  for (const f of mtfs) {
    try {
      const p = parseMtf(fs.readFileSync(f, 'utf8'));
      const key = `${p.design.chassis} ${p.design.model}`;
      if (seen.has(key)) continue; // duplicates across sourcebooks
      seen.add(key);
      if (p.omni) {
        const g = `${p.design.chassis}|${p.design.techBase}|${p.design.tonnage}|${p.design.config}`;
        omniGroups.set(g, [...(omniGroups.get(g) ?? []), p]);
        continue;
      }
      const d = settleEra(p.design, p.year, (x) => validate(x).map((i) => i.message));
      plain.push(mechEntry(d, p));
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      mechSkipped++;
      note(`mech: ${e.message}`);
    }
  }
  let omniCount = 0;
  for (const group of omniGroups.values()) {
    group.sort((a, b) => (a.design.model === 'Prime' ? -1 : b.design.model === 'Prime' ? 1 : a.design.model.localeCompare(b.design.model)));
    const base = group[0];
    const fixed = base.design.equipment.filter((e) => !base.pods.has(e));
    const podsOf = (p: ParsedMech) => p.design.equipment.filter((e) => p.pods.has(e)).map((e) => ({ ...e, pod: true }));
    const design: MechDesign = {
      ...base.design,
      model: '',
      equipment: [...fixed, ...podsOf(base)],
      omni: { active: 0, configurations: group.map((p, i) => ({ name: p.design.model, pod: i === 0 ? [] : podsOf(p) })) },
    };
    const d = settleEra(design, Math.min(...group.map((g) => g.year)), (x) => validate(x).map((i) => i.message));
    plain.push(mechEntry(d, base, group.length));
    omniCount++;
  }

  // --- Vehicles
  const blks = walk(path.join(root, 'data/mekfiles/vehicles'), '.blk').sort();
  const vehicles: CanonEntry[] = [];
  let vehSkipped = 0;
  const vseen = new Set<string>();
  for (const f of blks) {
    try {
      const p = parseBlk(fs.readFileSync(f, 'utf8'));
      const key = `${p.design.chassis} ${p.design.model}`;
      if (vseen.has(key)) continue;
      vseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateVehicle(x).map((i) => i.message));
      const s = computeVehicle(d);
      const issues = validateVehicle(d, s);
      vehicles.push({
        n: `${d.chassis} ${d.model}`.trim(), t: d.tonnage, tb: d.techBase, era: d.era, y: p.year,
        k: d.motive, bv: vehicleBV(d).total, ok: issues.every((i) => i.severity !== 'error'),
        w: s.weights.total === d.tonnage, src: p.source, mul: p.mulId, d: encodeVehicle(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      vehSkipped++;
      note(`vehicle: ${e.message}`);
    }
  }

  // --- Support vehicles
  const supports: CanonEntry[] = [];
  let svSkipped = 0;
  const sseen = new Set<string>();
  for (const f of blks) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/<UnitType>\s*\n(SupportTank|SupportVTOL|FixedWingSupport|LargeSupportTank)\n/.test(text)) continue;
    try {
      const p = parseSupportBlk(text);
      const key = `${p.design.chassis} ${p.design.model}`;
      if (sseen.has(key)) continue;
      sseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateSupport(x).map((i) => i.message));
      const s = computeSupport(d);
      const issues = validateSupport(d, s);
      supports.push({
        n: `${d.chassis} ${d.model}`.trim(), t: d.tonnage, tb: d.techBase, era: d.era, y: p.year, k: d.svType,
        bv: 0, ok: issues.every((i) => i.severity !== 'error'), w: Math.abs(s.weights.total - d.tonnage) < 1e-6,
        src: p.source, mul: p.mulId, d: encodeSupport(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      svSkipped++;
      note(`support: ${e.message}`);
    }
  }
  supports.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'support.json'), JSON.stringify(supports));
  const sOk = supports.filter((e) => e.ok).length;
  const sW = supports.filter((e) => e.w).length;
  console.log(`Support vehicles: ${supports.length} converted, ${svSkipped} skipped; exact tonnage ${sW}, fully legal ${sOk}`);

  plain.sort((a, b) => a.n.localeCompare(b.n));
  vehicles.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'mechs.json'), JSON.stringify(plain));
  fs.writeFileSync(path.join(outDir, 'vehicles.json'), JSON.stringify(vehicles));

  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  const mOk = plain.filter((e) => e.ok).length;
  const mW = plain.filter((e) => e.w).length;
  const vOk = vehicles.filter((e) => e.ok).length;
  const vW = vehicles.filter((e) => e.w).length;
  console.log(`Mechs: ${plain.length} converted (${omniCount} OmniMechs), ${mechSkipped} files skipped`);
  console.log(`  exact tonnage ${mW} (${pct(mW, plain.length)}), fully legal ${mOk} (${pct(mOk, plain.length)})`);
  console.log(`Vehicles: ${vehicles.length} converted, ${vehSkipped} skipped`);
  console.log(`  exact tonnage ${vW} (${pct(vW, vehicles.length)}), fully legal ${vOk} (${pct(vOk, vehicles.length)})`);
  console.log('Top skip reasons:');
  for (const [k, c] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 400)) console.log(`  ${c}  ${k}`);
}

function mechEntry(d: MechDesign, p: ParsedMech, configs = 1): CanonEntry {
  const s = computeMech(d);
  const issues = validate(d, s);
  return {
    n: `${d.chassis} ${d.model}`.trim(), t: d.tonnage, tb: d.techBase, era: d.era, y: p.year,
    k: d.config === 'quad' ? (d.omni ? `quadomni:${configs}` : 'quad') : d.omni ? `omni:${configs}` : 'mech', bv: mechBV(d).total, ok: issues.every((i) => i.severity !== 'error'),
    w: s.weights.total === d.tonnage, src: p.source, mul: p.mulId, d: encodeMech(d),
  };
}

void armorPointsPerTon;
void mechCost;
void vehicleCost;
main();
