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
import { fighterBV, mechBV, mechCost, vehicleBV, vehicleCost, vesselBV } from '../src/rules/battleValue';
import type { MotiveType, VehicleDesign, VehicleEngineType, VehicleLocation } from '../src/rules/vehicle';
import { computeVehicle, emptyVehicleArmor, validateVehicle } from '../src/rules/vehicle';
import { armorPointsPerTon } from '../src/rules/tables';
import { encodeFighter, encodeMech, encodeSupport, encodeVehicle, encodeVessel } from '../src/data/canonFormat';
import type { FighterDesign, FighterItem, FighterLocation } from '../src/rules/fighter';
import { computeFighter, emptyFighterArmor, validateFighter } from '../src/rules/fighter';
import type { BayKind, QuartersKind, VesselDesign, VesselItem, VesselLocation } from '../src/rules/vessel';
import { computeVessel, emptyVesselArmor, validateVessel } from '../src/rules/vessel';
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
  improvedmediumheavylaser: 'improvedheavymediumlaser', improvedsmallheavylaser: 'improvedheavysmalllaser',
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
  'footactuator', 'xlgyro', 'compactgyro', 'heavydutygyro', 'landinggear', 'avionics',
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
    endocomposite: 'endo-steel', endosteelprototype: 'endo-steel', ferrolamellor: 'ferro-fibrous', reactive: 'ferro-fibrous',
    reflective: 'ferro-fibrous', ballisticreinforced: 'ferro-fibrous', impactresistant: 'ferro-fibrous',
    heatdissipating: 'ferro-fibrous', antipenetrativeablation: 'ferro-fibrous',
  };
  // Stealth armor's slots are fixed (two per side torso, arm and leg); MechForger places them itself.
  if (b === 'stealth') return { kind: 'fixed' };
  if (structural[b]) return { kind: 'item', id: structural[b] };
  if (UTILITY_NAMES[b]) return { kind: 'item', id: UTILITY_NAMES[b] };
  if (b === 'caseii') return { kind: 'item', id: (tech ?? unitTech) === 'Clan' ? 'clan-case-ii' : 'case-ii' };
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
  if (!['Biped', 'Biped OmniMek', 'Quad', 'Quad OmniMek', 'LAM'].includes(config)) fail(`config ${config}`);
  const quad = config.startsWith('Quad');
  const lamRaw = get('lam');
  const lam = config === 'LAM' ? (/^bimodal/i.test(lamRaw) ? 'bimodal' : /^standard/i.test(lamRaw) || !lamRaw ? 'standard' : fail(`LAM type ${lamRaw}`)) : null;
  const tbRaw = get('techbase');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(tbRaw) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(tbRaw);
  const tonnage = Number(get('mass'));
  if (!(tonnage >= 20 && tonnage <= 100 && tonnage % 5 === 0)) fail(`tonnage ${tonnage}`);
  const walkMP = Number(get('walk mp'));

  const eng = get('engine');
  const rating = Number(/^(\d+)/.exec(eng)?.[1]);
  if (rating !== tonnage * walkMP) fail('engine rating does not match walking MP');
  const engineType: EngineType = /Large|ICE|Fuel|Fission/.test(eng) ? fail(`engine ${eng}`)
    : /XXL/.test(eng) ? 'xxl' : /XL/.test(eng) ? 'xl' : /Light/.test(eng) ? 'light' : /Compact/.test(eng) ? 'compact' : 'standard';

  const st = get('structure');
  const STRUCTURES: Record<string, MechDesign['structureType']> = {
    Standard: 'standard', 'Endo Steel': 'endo-steel', 'Endo Steel Prototype': 'endo-prototype', 'Endo-Composite': 'endo-composite',
    Composite: 'composite', Reinforced: 'reinforced',
  };
  const structureType = st === '' ? 'standard' : STRUCTURES[st.replace(/^(IS|Clan) /, '')] ?? fail(`structure ${st}`);
  const ar = get('armor');
  const ARMORS: Record<string, MechDesign['armorType']> = {
    Standard: 'standard', 'Ferro-Fibrous': 'ferro-fibrous', 'Light Ferro-Fibrous': 'light-ferro', 'Heavy Ferro-Fibrous': 'heavy-ferro',
    Stealth: 'stealth', Reactive: 'reactive', Reflective: 'reflective', Hardened: 'hardened', 'Ferro-Lamellor': 'ferro-lamellor',
    'Ballistic-Reinforced': 'ballistic-reinforced', 'Anti-Penetrative Ablation': 'anti-penetrative',
    'Heat-Dissipating': 'heat-dissipating', 'Impact-Resistant': 'impact-resistant',
  };
  const armorType: MechDesign['armorType'] = ARMORS[ar.replace(/\(.*$/, '').trim()] ?? fail(`armor ${ar}`);
  const hs = get('heat sinks');
  const hsTotal = Number(/^(\d+)/.exec(hs)?.[1]);
  const heatSinkType: HeatSinkType = /Double/.test(hs) ? 'double' : /Single/.test(hs) ? 'single' : fail(`heat sinks ${hs}`);
  const gy = get('gyro');
  const gyroType: GyroType = !gy || /^Standard/.test(gy) ? 'standard' : /^XL/.test(gy) ? 'xl'
    : /^Compact/.test(gy) ? 'compact' : /^Heavy Duty/.test(gy) ? 'heavy-duty' : fail(`gyro ${gy}`);
  const ck = get('cockpit');
  const cockpitType: CockpitType = !ck || /^Standard/.test(ck) ? 'standard' : /^Small/.test(ck) ? 'small'
    : /^Command Console/.test(ck) ? 'command-console' : /^Torso-Mounted/.test(ck) ? 'torso-mounted' : fail(`cockpit ${ck}`);
  const my = get('myomer');
  const myomer = !my || my === 'Standard' ? 'standard' : my === 'Triple-Strength' ? 'tsm' : fail(`myomer ${my}`);
  // A Full Head Ejection System (Hatchetman, Axman…) takes no slots or weight; other systems aren't supported.
  if (kv.has('ejection') && !/^Full Head Ejection System$/i.test(get('ejection'))) fail('special systems');

  const armor: ArmorAllocation = {
    HD: Number(get('hd armor')), CT: Number(get('ct armor')), CTR: Number(get('rtc armor')),
    LT: Number(get('lt armor')), LTR: Number(get('rtl armor')), RT: Number(get('rt armor')), RTR: Number(get('rtr armor')),
    LA: Number(get(quad ? 'fll armor' : 'la armor')), RA: Number(get(quad ? 'frl armor' : 'ra armor')),
    LL: Number(get(quad ? 'rll armor' : 'll armor')), RL: Number(get(quad ? 'rrl armor' : 'rl armor')),
  };
  for (const [k, v] of Object.entries(armor)) if (!Number.isFinite(v)) fail(`armor value ${k}`);

  const slotNames = (l: Location) => (crits[l] ?? []).map((c) => c.replace(/\s*\((ARMORED|OMNIPOD)\)/gi, '').trim());
  const arm = (l: Location) => ({
    lowerArm: slotNames(l).includes('Lower Arm Actuator'),
    hand: slotNames(l).includes('Hand Actuator'),
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
    armorType, myomer, config: quad ? 'quad' : 'biped', lam, omni: null,
    ...(kv.has('ejection') ? { fullHeadEjection: true } : {}),
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
// BLK fighters (aerospace and conventional)
// ---------------------------------------------------------------------------

const FIGHTER_ENGINES: Record<string, FighterDesign['engineType']> = { 0: 'standard', 1: 'ice', 2: 'xl', 4: 'light', 5: 'compact' };
/** MegaMek armor codes: standard, ferro-aluminum, heavy and light ferro-aluminum. */
const FIGHTER_ARMOR: Record<string, ArmorType> = { 0: 'standard', 19: 'ferro-fibrous', 20: 'heavy-ferro', 21: 'light-ferro' };

function parseFighterBlk(text: string): { design: FighterDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';
  const unitType = one('UnitType');
  const fighterType = unitType === 'AeroSpaceFighter' ? 'aerospace' : unitType === 'ConvFighter' ? 'conventional' : fail(`unit type ${unitType}`);
  const typeStr = one('type');
  if (/Primitive/i.test(typeStr) || one('cockpit_type') === '3') fail('primitive fighter');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(typeStr);
  const tonnage = Number(one('tonnage'));
  const engineType = FIGHTER_ENGINES[one('engine_type')] ?? fail(`engine type ${one('engine_type')}`);
  const armorType = FIGHTER_ARMOR[one('armor_type')] ?? fail(`armor type ${one('armor_type')}`);
  const cockpit = one('cockpit_type');
  const cockpitType = cockpit === '0' || cockpit === '' ? 'standard' : cockpit === '1' ? 'small' : fail(`cockpit ${cockpit}`);
  if (tags.has('transporters')) fail('transport bays');
  const [nose, lw, rw, aft] = (tags.get('armor') ?? []).map(Number);
  const armor = { ...emptyFighterArmor(), NOS: nose ?? 0, LWG: lw ?? 0, RWG: rw ?? 0, AFT: aft ?? 0 };
  const blocks: [string, FighterLocation][] = [
    ['Nose Equipment', 'NOS'], ['Left Wing Equipment', 'LWG'], ['Right Wing Equipment', 'RWG'], ['Aft Equipment', 'AFT'],
    ['Fuselage Equipment', 'FUS'], ['Wings Equipment', 'FUS'],
  ];
  const equipment: FighterItem[] = [];
  let uid = 0;
  for (const [tag, loc] of blocks) {
    for (const raw0 of tags.get(tag) ?? []) {
      const rear = /\(R\)/.test(raw0);
      const raw = raw0.replace(/:OMNI$/i, '').replace(/:SIZE:[\d.]+$/i, '');
      const r = resolveName(raw, techBase);
      if (r.kind === 'fixed') continue;
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      const id = (r as { id: string }).id;
      const eq = getEquipment(id)!;
      if (/heat-sink/.test(id)) continue; // fighters count heat sinks in the <heatsinks> total
      if (eq.managed) fail(`mech-only item ${id}`);
      if (id === 'case' && techBase === 'Clan') continue; // built into Clan fighters
      equipment.push({ uid: `a${uid++}`, equipmentId: id, location: loc, ...(rear ? { rear: true } : {}) });
    }
  }
  fixAmmoTech(equipment);
  const ppt = fighterType === 'conventional' ? 160 : 80;
  const design: FighterDesign = {
    schemaVersion: 1, unitType: 'fighter', fighterType, era: '3025', techBase, mixedTech, omni: one('omni') === '1',
    chassis: one('Name'), model: one('Model'), tonnage, safeThrust: Number(one('SafeThrust')), engineType, cockpitType,
    heatSinkType: one('sink_type') === '1' ? 'double' : 'single', heatSinks: Number(one('heatsinks')) || 0,
    fuelTons: Math.round((2 * Number(one('fuel'))) / ppt) / 2, armorType, armor, vstol: one('vstol') === '1', equipment,
  };
  if (fighterType === 'conventional') design.heatSinks = 0;
  return { design, year: Number(one('year')) || 3025, mulId: Number(one('mul id:')) || undefined, source: one('source') };
}

// ---------------------------------------------------------------------------
// BLK small craft and DropShips
// ---------------------------------------------------------------------------

const VESSEL_ARMOR: Record<string, VesselDesign['armorType']> = {
  41: 'standard', 0: 'standard', 19: 'ferro-aluminum', 20: 'heavy-ferro-aluminum', 21: 'light-ferro-aluminum',
  13: 'improved-ferro-aluminum', 11: 'ferro-carbide', 12: 'lamellor-ferro-carbide',
};
/** Capital ammunition by MegaMek's internal name ("Ammo NAC/20", "Ammo KrakenT", …). */
const CAPITAL_AMMO = new Map<string, string>();
for (const eq of ALL_EQUIPMENT) {
  if (eq.capitalClass && eq.category === 'Ammo') CAPITAL_AMMO.set(norm(`Ammo ${eq.name.replace(/ Ammo$/, '')}`), eq.id);
}
CAPITAL_AMMO.set('ammoscreen', 'ammo-screen-launcher');
CAPITAL_AMMO.set('ammokrakent', 'ammo-kraken-t');
const BAY_NAMES: Record<string, BayKind> = {
  mekbay: 'mek', mechbay: 'mek', asfbay: 'fighter', smallcraftbay: 'small-craft', lightvehiclebay: 'light-vehicle',
  heavyvehiclebay: 'heavy-vehicle', superheavyvehiclebay: 'superheavy-vehicle', protomekbay: 'protomek',
  battlearmorbay: 'battle-armor', cargobay: 'cargo', liquidcargobay: 'liquid-cargo', refrigeratedcargobay: 'refrigerated-cargo',
  insulatedcargobay: 'insulated-cargo', livestockcargobay: 'livestock-cargo',
  navalrepairpressurized: 'repair-pressurized', navalrepairunpressurized: 'repair-unpressurized', dropshuttlebay: 'drop-shuttle',
};
const QUARTERS_BLK: Record<string, [QuartersKind, number]> = {
  crewquarters: ['crew', 7], '1stclassquarters': ['first-class', 10], '2ndclassquarters': ['second-class', 7], steeragequarters: ['steerage', 5],
};
const INFANTRY_BAYS: Record<string, BayKind> = { foot: 'infantry-foot', jump: 'infantry-jump', motorized: 'infantry-motorized', mechanized: 'infantry-mechanized' };

function parseVesselBlk(text: string): { design: VesselDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';
  const int = (k: string) => Number(one(k)) || 0;
  const unitType = one('UnitType');
  const vesselType = ({ SmallCraft: 'small-craft', Dropship: 'dropship', Jumpship: 'jumpship', Warship: 'warship', SpaceStation: 'space-station' } as const)[unitType as 'SmallCraft'] ?? fail(`unit type ${unitType}`);
  const large = vesselType === 'jumpship' || vesselType === 'warship' || vesselType === 'space-station';
  const typeStr = one('type');
  if (/Primitive/i.test(typeStr)) fail('primitive craft');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(typeStr);
  const shape = one('motion_type') === 'Spheroid' ? 'spheroid' : one('motion_type') === 'Aerodyne' ? 'aerodyne' : fail(`motion ${one('motion_type')}`);
  const armorType = VESSEL_ARMOR[one('armor_type')] ?? fail(`armor type ${one('armor_type')}`);
  if (one('collartype') === '1') fail('prototype docking collar');
  const av = (tags.get('armor') ?? []).map(Number);
  // Small craft / DropShips: nose, left, right, aft. Large craft: nose, FLS, FRS, aft, ALS, ARS.
  const armor = large
    ? { ...emptyVesselArmor(), NOS: av[0] ?? 0, FLS: av[1] ?? 0, FRS: av[2] ?? 0, AFT: av[3] ?? 0, ALS: av[4] ?? 0, ARS: av[5] ?? 0 }
    : { ...emptyVesselArmor(), NOS: av[0] ?? 0, LS: av[1] ?? 0, RS: av[2] ?? 0, AFT: av[3] ?? 0 };

  const quarters = { crew: 0, 'first-class': 0, 'second-class': 0, steerage: 0 };
  const bays: VesselDesign['bays'] = [];
  let dockingCollars = 0;
  for (const t of tags.get('transporters') ?? []) {
    const [kind, size0, doors0, , platoon] = t.split(':');
    const k = kind.toLowerCase();
    if (k === 'dockingcollar') { dockingCollars++; continue; }
    if (k === 'dropshuttlebay') { bays.push({ kind: 'drop-shuttle', size: 1, doors: Number(doors0) || 0 }); continue; }
    const size = Number(size0) || 0;
    if (QUARTERS_BLK[k]) { const [q, per] = QUARTERS_BLK[k]; quarters[q] += Math.floor(size / per + 1e-9); continue; }
    if (k === 'infantrybay') { bays.push({ kind: INFANTRY_BAYS[(platoon ?? 'foot').toLowerCase()] ?? fail(`infantry bay ${platoon}`), size, doors: Number(doors0) || 0 }); continue; }
    const bk = BAY_NAMES[k] ?? fail(`bay ${kind}`);
    bays.push({ kind: bk, size, doors: Number(doors0) || 0 });
  }

  const blocks: [string, VesselLocation][] = large
    ? [['Nose Equipment', 'NOS'], ['Left Front Side Equipment', 'FLS'], ['Right Front Side Equipment', 'FRS'],
      ['Aft Left Side Equipment', 'ALS'], ['Aft Right Side Equipment', 'ARS'], ['Aft Equipment', 'AFT'],
      ['Left Broadsides Equipment', 'LBS'], ['Right Broadsides Equipment', 'RBS'], ['Hull Equipment', 'HULL']]
    : [['Nose Equipment', 'NOS'], ['Left Side Equipment', 'LS'], ['Right Side Equipment', 'RS'], ['Aft Equipment', 'AFT'], ['Hull Equipment', 'HULL']];
  const equipment: VesselItem[] = [];
  let uid = 0;
  for (const [tag, loc] of blocks) {
    let bay = 0;
    for (const raw0 of tags.get(tag) ?? []) {
      let raw = raw0;
      const rear = /\(R\)/.test(raw);
      const newBay = /\(B\)/.test(raw);
      raw = raw.replace(/\((R|B)\)\s*/g, '').trim();
      let shots: number | undefined;
      const sm = /^(.*\bAmmo\b.*):(\d+)$/i.exec(raw) ?? /^(.*):(\d+)$/.exec(raw);
      if (sm && /ammo/i.test(sm[1])) { raw = sm[1]; shots = Number(sm[2]); }
      const capAmmo = CAPITAL_AMMO.get(norm(raw));
      const r = capAmmo ? { kind: 'item' as const, id: capAmmo } : resolveName(raw, techBase);
      if (r.kind === 'fixed') continue;
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      const id = (r as { id: string }).id;
      const eq = getEquipment(id)!;
      if (/heat-sink/.test(id)) continue;
      if (eq.managed) fail(`mech-only item ${id}`);
      if (id === 'case' && techBase === 'Clan') continue;
      const item: VesselItem = { uid: `s${uid++}`, equipmentId: id, location: loc };
      if (rear) item.rear = true;
      if (eq.isWeapon && vesselType !== 'small-craft') { if (newBay || bay === 0) bay++; item.bay = bay; }
      if (eq.category === 'Ammo') item.shots = shots ?? Number(/\((\d+)\)\s*$/.exec(eq.name)?.[1] ?? 1);
      equipment.push(item);
    }
  }
  fixAmmoTech(equipment);
  // Some canon files are marked Inner Sphere yet carry Clan equipment (or vice versa).
  const mixed = mixedTech || equipment.some((e) => { const tb = getEquipment(e.equipmentId)!.techBase; return tb !== 'Both' && tb !== techBase; });
  const tonnage = Number(one('tonnage'));
  const dropship = vesselType === 'dropship';
  const fppt = large ? (tonnage < 110000 ? 10 : tonnage < 250000 ? 5 : 2.5) : !dropship ? 80 : tonnage < 400 ? 80 : tonnage < 800 ? 70 : tonnage < 1200 ? 60 : tonnage < 1900 ? 50 : tonnage < 3000 ? 40 : tonnage < 20000 ? 30 : tonnage < 40000 ? 20 : 10;
  const design: VesselDesign = {
    schemaVersion: 1, unitType: 'vessel', vesselType, shape, military: one('designtype') !== '0', era: '3025', techBase, mixedTech: mixed,
    chassis: one('Name'), model: one('Model'), tonnage, safeThrust: int('SafeThrust'), si: int('structural_integrity'),
    heatSinkType: one('sink_type') === '1' ? 'double' : 'single', heatSinks: int('heatsinks'), fuelTons: int('fuel') / fppt,
    armorType, armor,
    crew: { crew: int('crew'), officers: int('officers'), gunners: int('gunners'), passengers: int('passengers'), marines: int('marines'), battleArmor: int('battlearmor') },
    quarters, bays,
    driveCore: large ? ({ 0: 'standard', 1: 'compact', 2: 'subcompact' } as const)[(tags.has('kf_core') ? int('kf_core') : vesselType === 'warship' ? 1 : vesselType === 'jumpship' ? 0 : 3) as 0] ?? (vesselType === 'space-station' ? 'none' : fail(`K-F core ${one('kf_core')}`)) : 'none',
    sail: large && (tags.has('sail') ? one('sail') !== '0' : vesselType === 'jumpship'),
    lfBattery: tags.has('lithium-fusion'),
    hpg: tags.has('hpg'),
    gravDecks: (tags.get('grav_decks') ?? []).flatMap((x) => x.split(/[\s,]+/)).map(Number).filter((n) => n > 0)
      .concat(Array(int('grav_deck')).fill(50), Array(int('grav_deck_large')).fill(175), Array(int('grav_deck_huge')).fill(1000)),
    dockingCollars,
    lifeboats: int('lifeboat') || int('life_boat'), escapePods: int('escape_pod'), equipment,
  };
  return { design, year: Number(one('year')) || 3025, mulId: Number(one('mul id:')) || undefined, source: one('source') };
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
      // OmniMechs may change lower arm and hand actuators per configuration.
      omni: {
        active: 0,
        configurations: group.map((p, i) => ({ name: p.design.model, pod: i === 0 ? [] : podsOf(p), actuators: p.design.actuators })),
      },
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
  // --- Small craft and DropShips
  const vesselFiles = ['smallcraft', 'dropships', 'jumpships', 'warship', 'spacestation'].flatMap((dir) => walk(path.join(root, 'data/mekfiles', dir), '.blk')).sort();
  const vessels: CanonEntry[] = [];
  let vslSkipped = 0;
  const vsseen = new Set<string>();
  for (const f of vesselFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/<UnitType>\s*\n(SmallCraft|Dropship|Jumpship|Warship|SpaceStation)\n/.test(text)) continue;
    try {
      const p = parseVesselBlk(text);
      const key = `${p.design.chassis} ${p.design.model}`;
      if (vsseen.has(key)) continue;
      vsseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateVessel(x).map((i) => i.message));
      const s = computeVessel(d);
      const issues = validateVessel(d, s);
      vessels.push({
        n: `${d.chassis} ${d.model}`.trim(), t: d.tonnage, tb: d.techBase, era: d.era, y: p.year, k: `${d.vesselType}:${d.shape}`,
        bv: vesselBV(d).total, ok: issues.every((i) => i.severity !== 'error'), w: Math.abs(s.weights.free) < 1e-6,
        src: p.source, mul: p.mulId, d: encodeVessel(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      vslSkipped++;
      note(`vessel: ${e.message}`);
    }
  }
  vessels.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'vessels.json'), JSON.stringify(vessels));
  console.log(`Small craft / DropShips / large craft: ${vessels.length} converted, ${vslSkipped} skipped; exact tonnage ${vessels.filter((e) => e.w).length}, fully legal ${vessels.filter((e) => e.ok).length}`);

  // --- Fighters
  const fighterFiles = ['fighters', 'convfighter'].flatMap((dir) => walk(path.join(root, 'data/mekfiles', dir), '.blk')).sort();
  const fighters: CanonEntry[] = [];
  let ftrSkipped = 0;
  const fseen = new Set<string>();
  for (const f of fighterFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/<UnitType>\s*\n(AeroSpaceFighter|ConvFighter)\n/.test(text)) continue;
    try {
      const p = parseFighterBlk(text);
      const key = `${p.design.chassis} ${p.design.model}`;
      if (fseen.has(key)) continue;
      fseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateFighter(x).map((i) => i.message));
      const s = computeFighter(d);
      const issues = validateFighter(d, s);
      fighters.push({
        n: `${d.chassis} ${d.model}`.trim(), t: d.tonnage, tb: d.techBase, era: d.era, y: p.year,
        k: d.fighterType === 'conventional' ? 'conventional' : d.omni ? 'omnifighter' : 'aerospace',
        bv: fighterBV(d).total, ok: issues.every((i) => i.severity !== 'error'), w: Math.abs(s.weights.total - d.tonnage) < 1e-6,
        src: p.source, mul: p.mulId, d: encodeFighter(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      ftrSkipped++;
      note(`fighter: ${e.message}`);
    }
  }
  fighters.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'fighters.json'), JSON.stringify(fighters));
  console.log(`Fighters: ${fighters.length} converted, ${ftrSkipped} skipped; exact tonnage ${fighters.filter((e) => e.w).length}, fully legal ${fighters.filter((e) => e.ok).length}`);

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
    k: d.lam ? 'lam' : d.config === 'quad' ? (d.omni ? `quadomni:${configs}` : 'quad') : d.omni ? `omni:${configs}` : 'mech', bv: mechBV(d).total, ok: issues.every((i) => i.severity !== 'error'),
    w: s.weights.total === d.tonnage, src: p.source, mul: p.mulId, d: encodeMech(d),
  };
}

void armorPointsPerTon;
void mechCost;
void vehicleCost;
main();
