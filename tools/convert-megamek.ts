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
  TechBase, TechComponent,
} from '../src/rules/types';
import type { EraId } from '../src/rules/eras';
import { ERAS } from '../src/rules/eras';
import type { Equipment } from '../src/rules/equipment';
import { ALL_EQUIPMENT, HEAT_SINK_IDS, getEquipment, itemSlots } from '../src/rules/equipment';
import { canSplit } from '../src/rules/edit';
import { engineRatingFor } from '../src/rules/types';
import { SPLIT_ADJACENT } from '../src/rules/types';
import { computeMech, fixedSlots } from '../src/rules/construction';
import { validate } from '../src/rules/validation';
import { fighterBV, mechBV, mechCost, vehicleBV, vehicleCost, vesselBV } from '../src/rules/battleValue';
import type { MotiveType, VehicleArmorType, VehicleDesign, VehicleEngineType, VehicleLocation } from '../src/rules/vehicle';
import { computeVehicle, emptyVehicleArmor, MOTIVE_TYPES, validateVehicle, vehicleFreeHeatSinks } from '../src/rules/vehicle';
import { armorPointsPerTon } from '../src/rules/tables';
import { encodeBattleArmor, encodeInfantry, encodeFighter, encodeMech, encodeSupport, encodeVehicle, encodeVessel } from '../src/data/canonFormat';
import type { BAItem, BattleArmorDesign } from '../src/rules/battlearmor';
import { battleArmorBV, computeBattleArmor, syncArmorSlots, validateBattleArmor } from '../src/rules/battlearmor';
import { MM_EQUIPMENT, findMM } from '../src/rules/mmEquipment';
import type { FieldGun, InfantryDesign, InfantryMotion } from '../src/rules/infantry';
import { BEASTS, SPECIALIZATIONS, computeInfantry, infantryBV, validateInfantry } from '../src/rules/infantry';
import type { FighterDesign, FighterItem, FighterLocation } from '../src/rules/fighter';
import { computeFighter, emptyFighterArmor, validateFighter } from '../src/rules/fighter';
import type { BayKind, QuartersKind, VesselDesign, VesselItem, VesselLocation } from '../src/rules/vessel';
import { computeVessel, emptyVesselArmor, validateVessel } from '../src/rules/vessel';
import type { SVBayKind, SVItem, SVLocation, SVType, SupportVehicleDesign, TechRating } from '../src/rules/support';
import { SV_BAY_INFO, TECH_RATINGS, computeSupport, emptyTransport, isLargeSupportTank, kgPerFuelPoint, validateSupport } from '../src/rules/support';
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
  lightautocannon2: 'lightac2', lightautocannon5: 'lightac5', lac2: 'lightac2', lac5: 'lightac5',
  rl10: 'rocketlauncher10', rl15: 'rocketlauncher15', rl20: 'rocketlauncher20',
  improvedmediumheavylaser: 'improvedheavymediumlaser', improvedsmallheavylaser: 'improvedheavysmalllaser',
  magshotgr: 'magshotgaussrifle', narcbeacon: 'narcmissilebeacon', improvednarc: 'inarclauncher',
  c3masterunit: 'c3mastercomputer', c3iunit: 'improvedc3computer', artemisiv: 'artemisivfcs',
  ams: 'antimissilesystem', ecmsuite: 'ecmsuite', guardianecm: 'guardianecmsuite',
  flamervehicle: 'vehicleflamer', erflamer: 'erflamer',
  watchdogecmsuite: 'watchdogcews', watchdogecm: 'watchdogcews', apollo: 'apollomrmfcs', lmga: 'lightmachinegunarray',
  mga: 'machinegunarray', hmga: 'heavymachinegunarray', lightmga: 'lightmachinegunarray', heavymga: 'heavymachinegunarray',
  mektaser: 'mechtaser', battlemechtaser: 'mechtaser', sbgr: 'silverbulletgaussrifle', werppc: 'enhancedppc',
  cliatm3: 'improvedatm3', cliatm6: 'improvedatm6', cliatm9: 'improvedatm9', cliatm12: 'improvedatm12',
  iatm3: 'improvedatm3', iatm6: 'improvedatm6', iatm9: 'improvedatm9', iatm12: 'improvedatm12', impgaussrifle: 'improvedheavygaussrifle',
  blueshieldparticlefielddamper: 'blueshieldpfd', ismodulararmor: 'modulararmor', radicalheatsink: 'radicalheatsinksystem',
  dronecontrolsystem: 'droneoperatingsystem', droneremoteoperatingsystem: 'droneoperatingsystem',
  artemisv: 'artemisvfcs', aes: 'actuatorenhancementsystem', actuatorenhancementsystemaes: 'actuatorenhancementsystem',
  laserantimissilesystem: 'laserams', laserams: 'laserams', meknullsignaturesystem: 'nullsignaturesystem',
  mekvoidsignaturesystem: 'voidsignaturesystem', chameleonlightpolarizationfield: 'chameleonlightpolarizationshield',
  c3boostedsystemslaveunit: 'c3boostedslave', c3masterboostedsystemunit: 'c3boostedmaster', c3computerboosted: 'c3boostedmaster', antipersonnelpod: 'apod', antipersonnelpodsapods: 'apod', antibattlearmorpodsbpods: 'bpod',
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
  miningdrill: 'mining-drill', mechsprayer: 'sprayer', tanksprayer: 'sprayer-vehicle', sprayervehicular: 'sprayer-vehicle', sprayermech: 'sprayer', ejectionseatindustrialmech: 'im-ejection-seat',
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
  const { tech } = splitTech(raw);
  const artemisV = /artemis v.capable/i.test(raw);
  const artemis = !artemisV && /artemis.capable/i.test(raw);
  const half = /half/i.test(raw);
  let s = norm(raw.replace(/\(clan\)/gi, '')).replace(/^(clan|is|cl)/, '').replace(/ammo|pods|full|half|artemisvcapable|artemiscapable/g, '');
  s = s.replace(/^ammo/, '');
  const families: [RegExp, (m: RegExpExecArray) => string][] = [
    [/^arrowiv/, () => 'arrow-iv'], [/^longtomcannon/, () => 'long-tom-cannon'], [/^longtom/, () => 'long-tom'],
    [/^snipercannon/, () => 'sniper-cannon'], [/^sniper/, () => 'sniper'], [/^thumpercannon/, () => 'thumper-cannon'],
    [/^thumper/, () => 'thumper'], [/^lac(\d+)/, (m) => `lac-${m[1]}`],
    [/^ultraac(\d+)/, (m) => `uac-${m[1]}`], [/^rotaryac(\d+)/, (m) => `rac-${m[1]}`],
    [/^lb(\d+)x/, (m) => `lb-${m[1]}x`], [/^ac(\d+)/, (m) => `ac-${m[1]}`],
    [/^extendedlrm(\d+)/, (m) => `elrm-${m[1]}`], [/^enhancedlrm(\d+)/, (m) => `nlrm-${m[1]}`], [/^iatm(\d+)/, (m) => `iatm-${m[1]}`],
    [/^scmortar(\d+)/, (m) => `mech-mortar-${m[1]}`], [/^protomechac(\d+)/, (m) => `protomech-ac-${m[1]}`],
    [/^silverbullet/, () => 'silver-bullet-gauss'], [/^improvedheavygauss/, () => 'improved-heavy-gauss'],
    [/^heavyflamer/, () => 'heavy-flamer'], [/^vehicleflamer/, () => 'vehicle-flamer'], [/^fluidgun/, () => 'fluid-gun'],
    [/^taser/, () => 'mech-taser'],
    [/^streaksrm(\d+)/, (m) => `streak-srm-${m[1]}`], [/^streaklrm(\d+)/, (m) => `streak-lrm-${m[1]}`], [/^srm(\d+)/, (m) => `srm-${m[1]}`],
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
      const id = mml ? `ammo-${w}-${mml}` : `ammo-${w}${artemis ? '-artemis' : artemisV ? '-artemis-v' : ''}${half ? '-half' : ''}`;
      if (getEquipment(id)) return id;
    }
    return null;
  }
  return null;
}

/** System crit kind, so MegaMek's names ("Fusion Engine") match MechForger's ("XL Fusion Engine"). */
function systemKind(name: string): string {
  if (/engine|i\.c\.e|fuel cell/i.test(name)) return 'engine';
  if (/gyro/i.test(name)) return 'gyro';
  if (/cockpit/i.test(name)) return 'cockpit';
  return norm(name);
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
    heavyferrofibrous: 'ferro-fibrous', triplestrengthmyomer: 'tsm', industrialtriplestrengthmyomer: 'tsm',
    commercial: 'ferro-fibrous', industrial: 'ferro-fibrous', heavyindustrial: 'ferro-fibrous',
    environmentalsealingmech: 'environmental-sealing', heatsink: 'heat-sink',
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
  if (!(tonnage >= 10 && tonnage <= 100 && tonnage % 5 === 0)) fail(`tonnage ${tonnage}`);
  const walkMP = Number(get('walk mp'));

  const eng = get('engine');
  const rating = Number(/^(\d+)/.exec(eng)?.[1]);
  // Primitive 'Mechs rate their engines at 1.2 × tonnage × walking MP (rounded up to 5).
  const primitiveCockpit = /^Primitive/.test(get('cockpit'));
  if (rating !== engineRatingFor({ tonnage, walkMP, cockpitType: primitiveCockpit ? 'primitive' : 'standard' })) fail('engine rating does not match walking MP');
  const engineType: EngineType = /Large/.test(eng) ? fail(`engine ${eng}`)
    : /ICE/.test(eng) ? 'ice' : /Fuel Cell/.test(eng) ? 'fuel-cell' : /Fission/.test(eng) ? 'fission'
    : /XXL/.test(eng) ? 'xxl' : /XL/.test(eng) ? 'xl' : /Light/.test(eng) ? 'light' : /Compact/.test(eng) ? 'compact' : 'standard';

  const st = get('structure');
  const STRUCTURES: Record<string, MechDesign['structureType']> = {
    Standard: 'standard', 'Endo Steel': 'endo-steel', 'Endo Steel Prototype': 'endo-prototype', 'Endo-Composite': 'endo-composite',
    Composite: 'composite', Reinforced: 'reinforced', Industrial: 'industrial',
  };
  const structureType = st === '' ? 'standard' : STRUCTURES[st.replace(/^(IS|Clan) /, '')] ?? fail(`structure ${st}`);
  const ar = get('armor');
  const ARMORS: Record<string, MechDesign['armorType']> = {
    Standard: 'standard', 'Ferro-Fibrous': 'ferro-fibrous', 'Light Ferro-Fibrous': 'light-ferro', 'Heavy Ferro-Fibrous': 'heavy-ferro',
    Stealth: 'stealth', Reactive: 'reactive', Reflective: 'reflective', Hardened: 'hardened', 'Ferro-Lamellor': 'ferro-lamellor',
    'Ballistic-Reinforced': 'ballistic-reinforced', 'Anti-Penetrative Ablation': 'anti-penetrative',
    'Heat-Dissipating': 'heat-dissipating', 'Impact-Resistant': 'impact-resistant',
    Commercial: 'commercial', Industrial: 'industrial', 'Heavy Industrial': 'heavy-industrial', Primitive: 'primitive',
  };
  const armorType: MechDesign['armorType'] = ARMORS[ar.replace(/\(.*$/, '').trim()] ?? fail(`armor ${ar}`);
  const hs = get('heat sinks');
  // Mixed tech: each component may be Inner Sphere or Clan regardless of the chassis.
  const partTech = (clan: boolean, is: boolean): TechBase | undefined => (clan ? 'Clan' : is ? 'IS' : undefined);
  const componentTech: Partial<Record<TechComponent, TechBase>> = {};
  if (mixedTech) {
    const parts: [TechComponent, TechBase | undefined][] = [
      ['structure', partTech(/^Clan /.test(st), /^IS /.test(st))],
      ['armor', partTech(/\(Clan\)/.test(ar), /\((IS|Inner Sphere)\)/.test(ar))],
      ['engine', partTech(/\(Clan\)/.test(eng), /\(IS\)/.test(eng))],
      ['heatSinks', partTech(/Clan|Laser/.test(hs), /\bIS\b/.test(hs))],
    ];
    for (const [part, t] of parts) if (t && t !== techBase) componentTech[part] = t;
  }
  const hsTotal = Number(/^(\d+)/.exec(hs)?.[1]);
  // Clan laser heat sinks are built like Clan double heat sinks.
  const laserHeatSinks = /Laser/.test(hs);
  const heatSinkType: HeatSinkType = /Double|Laser/.test(hs) ? 'double' : /Single/.test(hs) ? 'single' : fail(`heat sinks ${hs}`);
  const gy = get('gyro');
  const gyroType: GyroType = !gy || /^Standard/.test(gy) ? 'standard' : /^None/.test(gy) ? 'none' : /^XL/.test(gy) ? 'xl'
    : /^Compact/.test(gy) ? 'compact' : /^Heavy Duty/.test(gy) ? 'heavy-duty' : fail(`gyro ${gy}`);
  const ck = get('cockpit');
  const cockpitType: CockpitType = !ck || /^Standard/.test(ck) ? 'standard' : /^Small/.test(ck) ? 'small'
    : /^Command Console/.test(ck) ? 'command-console' : /^Torso-Mounted/.test(ck) ? 'torso-mounted'
    // An industrial cockpit with advanced fire control is built like a standard cockpit.
    : /^Industrial Cockpit/.test(ck) ? (/adv\. FCS/i.test(ck) ? 'standard' : 'industrial')
    : /^Primitive Industrial Cockpit/.test(ck) ? (/adv\. FCS/i.test(ck) ? 'primitive' : 'primitive-industrial')
    : /^Primitive Cockpit/.test(ck) ? 'primitive' : /^Interface Cockpit/.test(ck) ? 'interface' : fail(`cockpit ${ck}`);
  const my = get('myomer');
  const myomer = !my || my === 'Standard' ? 'standard' : my === 'Triple-Strength' ? 'tsm' : my === 'Industrial Triple-Strength' ? 'industrial-tsm' : fail(`myomer ${my}`);
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
  // Split weapons: partial runs, paired up across adjacent locations after the loop.
  const partials: { l: Location; id: string; slots: number; raw: string }[] = [];
  // Armored system slots: [location, system kind, occurrence of that kind in the location].
  const sysSeen = new Map<string, number>();
  const armoredSys: [Location, string, number][] = [];
  for (const [l, slots] of Object.entries(crits) as [Location, string[]][]) {
    let i = 0;
    while (i < slots.length) {
      const raw = slots[i];
      let j = i + 1;
      while (j < slots.length && slots[j] === raw) j++;
      const run = j - i;
      i = j;
      // Sized cargo / liquid storage / communications: whole tons plus a half-ton part, one slot each.
      const sized = /^(Cargo|Liquid Storage|Communications Equipment):SIZE:([\d.]+)/i.exec(raw.replace(/\s*\((OMNIPOD|R)\)/g, ''));
      if (sized) {
        const tons = Number(sized[2]);
        const count = run / Math.max(1, Math.ceil(tons));
        if (!Number.isInteger(count)) fail(`split or mis-sized item "${raw}"`);
        const kind = /^cargo/i.test(sized[1]) ? 'cargo' : /^liquid/i.test(sized[1]) ? 'liquid-storage' : 'communications';
        for (let c = 0; c < count; c++) {
          const ids = kind === 'communications' ? Array(Math.round(tons)).fill('communications-equipment')
            : [...Array(Math.floor(tons)).fill(`${kind}-1`), ...(tons % 1 ? [`${kind}-half`] : [])];
          for (const id of ids) equipment.push({ uid: `c${uid++}`, equipmentId: id, location: l, ...(/\(ARMORED\)/.test(raw) ? { armored: true } : {}) });
        }
        continue;
      }
      const r = resolveName(raw, techBase);
      if (r.kind === 'fixed') {
        const kind = systemKind(raw.replace(/\s*\((ARMORED|OMNIPOD)\)/gi, ''));
        const seen = sysSeen.get(`${l}|${kind}`) ?? 0;
        if (/\(ARMORED\)/.test(raw)) for (let k = 0; k < run; k++) armoredSys.push([l, kind, seen + k]);
        sysSeen.set(`${l}|${kind}`, seen + run);
        continue;
      }
      if (r.kind === 'unknown') fail(`unknown item "${r.name}"`);
      // Clan CASE is built in (weightless); MechForger does not list it.
      if ((r as { id: string }).id === 'case' && techBase === 'Clan' && /^CL|^Clan/.test(raw)) continue;
      const eq = getEquipment((r as { id: string }).id)!;
      const variable = eq.variableWeight === 'masc' || eq.variableWeight === 'targetingComputer';
      const size = variable ? run : itemSlots(eq, sizing);
      if (size <= 0) fail(`mis-sized item "${raw}"`);
      if (run % size !== 0) {
        if (!canSplit(eq)) fail(`split or mis-sized item "${raw}"`);
        partials.push({ l, id: eq.id, slots: run % size, raw });
      }
      for (let n = 0; n < Math.floor(run / size); n++) {
        const item: MountedItem = { uid: `c${uid++}`, equipmentId: eq.id, location: l };
        if (/\(R\)/.test(raw)) item.rear = true;
        if (/\(ARMORED\)/.test(raw)) item.armored = true;
        equipment.push(item);
        if (/\(OMNIPOD\)/.test(raw)) pods.add(item);
      }
    }
  }
  // Pair each partial run with one in an adjacent location that makes up the rest of the weapon.
  while (partials.length) {
    const a = partials.shift()!;
    const size = itemSlots(getEquipment(a.id)!, sizing);
    const k = partials.findIndex((b) => b.id === a.id && b.slots + a.slots === size && SPLIT_ADJACENT[a.l].includes(b.l));
    if (k < 0) fail(`split or mis-sized item "${a.raw}"`);
    const [b] = partials.splice(k, 1);
    // The larger part is the weapon's location; the other holds the split slots.
    const [main, rest] = a.slots >= b.slots ? [a, b] : [b, a];
    const item: MountedItem = { uid: `c${uid++}`, equipmentId: a.id, location: main.l, split: { location: rest.l, slots: rest.slots } };
    if (/\(R\)/.test(main.raw)) item.rear = true;
    if (/\(ARMORED\)/.test(main.raw)) item.armored = true;
    equipment.push(item);
    if (/\(OMNIPOD\)/.test(main.raw)) pods.add(item);
  }
  fixAmmoTech(equipment);
  const externalHS = equipment.filter((e) => HEAT_SINK_IDS.includes(e.equipmentId)).length;
  const jets = equipment.filter((e) => /jump-jet$/.test(e.equipmentId));
  const design: MechDesign = {
    schemaVersion: 1, era: '3025', techBase, mixedTech,
    ...(Object.keys(componentTech).length ? { componentTech } : {}),
    ...(laserHeatSinks ? { laserHeatSinks: true } : {}),
    structureType, engineType, gyroType, cockpitType, heatSinkType,
    ...(equipment.some((e) => e.equipmentId === 'environmental-sealing') ? { environmentalSealing: true } : {}),
    jumpJetType: jets.some((e) => e.equipmentId === 'improved-jump-jet') ? 'improved' : 'standard',
    armorType, myomer, config: quad ? 'quad' : 'biped', lam, omni: null,
    ...(kv.has('ejection') ? { fullHeadEjection: true } : {}),
    chassis: get('clanname') ? `${get('clanname')} (${get('chassis')})` : get('chassis'),
    model: get('model'), tonnage, walkMP,
    engineHeatSinks: hsTotal - externalHS, armor,
    actuators: quad ? { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } } : { LA: arm('LA'), RA: arm('RA') },
    equipment,
  };
  // Map armored system crits onto MechForger's fixed slots, matching the n-th engine / gyro / … slot.
  for (const [l, kind, occ] of armoredSys) {
    const fixed = fixedSlots(design, l);
    let n = 0;
    const idx = fixed.findIndex((f) => f !== null && systemKind(f) === kind && n++ === occ);
    if (idx < 0) fail(`armored ${kind} slot`);
    design.armoredSlots = { ...design.armoredSlots, [l]: [...(design.armoredSlots?.[l] ?? []), idx] };
  }
  return {
    design, year: Number(get('era')) || 3025, rulesLevel: Number(get('rules level')) || 0,
    omni: config.endsWith('OmniMek'), mulId: Number(get('mul id')) || undefined,
    source: get('source'), pods,
  };
}

// ---------------------------------------------------------------------------
// BLK (vehicles)
// ---------------------------------------------------------------------------

const BLK_ENGINES: Record<string, VehicleEngineType> = { 0: 'standard', 1: 'ice', 2: 'xl', 3: 'xxl', 4: 'light', 5: 'compact', 6: 'fuel-cell', 7: 'fission', 8: 'none' };
const BLK_MOTION: Record<string, MotiveType> = {
  Tracked: 'tracked', Wheeled: 'wheeled', Hover: 'hover', VTOL: 'vtol', Naval: 'naval',
  Hydrofoil: 'hydrofoil', Submarine: 'submarine', WiGE: 'wige',
};
const BLK_ARMOR: Record<string, VehicleArmorType> = {
  0: 'standard', 1: 'ferro-fibrous', 2: 'reactive', 3: 'reflective', 4: 'hardened', 5: 'light-ferro', 6: 'heavy-ferro',
  16: 'ferro-lamellor', 22: 'stealth', 26: 'ballistic-reinforced',
};

function parseBlk(text: string): { design: VehicleDesign; year: number; rulesLevel: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';

  const unitType = one('UnitType');
  if (unitType !== 'Tank' && unitType !== 'VTOL' && unitType !== 'Naval') fail(`unit type ${unitType}`);
  const omni = one('omni') === '1';
  const motive = BLK_MOTION[one('motion_type')] ?? fail(`motion ${one('motion_type')}`);
  const typeStr = one('type');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  if (Number(one('tonnage')) > MOTIVE_TYPES[motive].maxTonnage) fail('superheavy vehicle');
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
    for (const line of tags.get(tag) ?? []) {
      const raw = line.replace(/:OMNI$/i, '');
      if (/^(IS|CL)?\s*Vehicular Stealth$/i.test(raw)) continue; // part of stealth armor
      const comms = /^Communications Equipment:SIZE:([\d.]+)/i.exec(raw);
      if (comms) {
        for (let c = 0; c < Math.round(Number(comms[1])); c++) equipment.push({ uid: `v${uid++}`, equipmentId: 'communications-equipment', location: 'BD' as VehicleLocation });
        continue;
      }
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
    ...(omni ? { omni: true } : {}),
    ...(['1', 'true'].includes(one('trailer')) ? { trailer: true } : {}),
    ...(['1', 'true'].includes(one('trailer')) && ['1', 'true'].includes(one('hasNoControlSystems')) ? { noControls: true } : {}),
    ...(omni && turret && tags.has('baseChassisTurretWeight') ? { omniTurretTons: Number(one('baseChassisTurretWeight')) } : {}),
    ...(cargo > 0 ? { cargo } : {}),
  };
  fixAmmoTech(design.equipment);
  // Vehicles carry exactly the heat sinks their energy weapons need (fusion engines include 10).
  const energy = computeVehicle(design).energyHeat;
  design.heatSinks = Math.max(vehicleFreeHeatSinks(engineType), energy);
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
  // Infantry compartments and cargo bays (tons); other bays are not modeled for fighters.
  let cargo = 0;
  for (const t of tags.get('transporters') ?? []) {
    const m = /^(troopspace|cargobay):([\d.]+)/i.exec(t);
    if (m) cargo += Number(m[2]);
    else fail(`fighter transporter ${t.split(':')[0]}`);
  }
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
    schemaVersion: 1, unitType: 'fighter', fighterType, era: '3025', techBase, mixedTech, omni: one('omni') === '1', ...(cargo ? { cargo } : {}),
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

// ---------------------------------------------------------------------------------------------------------------
// Battle armor
// ---------------------------------------------------------------------------------------------------------------

const BA_ARMOR_CODES: Record<string, string> = {
  28: 'BA_STANDARD', 29: 'BA_STANDARD_PROTOTYPE', 30: 'BA_STANDARD_ADVANCED', 31: 'BA_STEALTH_BASIC', 32: 'BA_STEALTH',
  33: 'BA_STEALTH_IMP', 34: 'BA_STEALTH_PROTOTYPE', 35: 'BA_FIRE_RESIST', 36: 'BA_MIMETIC', 37: 'BA_REFLECTIVE', 38: 'BA_REACTIVE',
};
const CLAN_TECH_LEVELS = new Set([2, 6, 8, 10, 12]);

function parseBattleArmorBlk(text: string): { design: BattleArmorDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1].toLowerCase(), m[2].split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k.toLowerCase())?.[0] ?? '';
  const int = (k: string) => Number(one(k)) || 0;
  const typeStr = one('type');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(typeStr);
  const turretM = /^(\w+):(\d+)/.exec(one('turret'));
  const turret = turretM ? { size: Number(turretM[2]), modular: /^(modular|configurable)/i.test(turretM[1]) } : null;
  const motionRaw = one('motion_type').toLowerCase();
  const motion = ({ jump: 'jump', leg: 'leg', vtol: 'vtol', umu: 'umu' } as const)[motionRaw as 'jump'] ?? fail(`motion ${motionRaw}`);
  const armorCode = BA_ARMOR_CODES[one('armor_type') || '28'] ?? fail(`BA armor ${one('armor_type')}`);
  const armorTech = tags.has('armor_tech') ? int('armor_tech') : -1;
  const armorClan = armorTech >= 0 ? CLAN_TECH_LEVELS.has(armorTech) : techBase === 'Clan';
  const armorEntry = MM_EQUIPMENT.find((e) => e.kind === 'baArmor' && e.armorType === armorCode && (e.techBase === 'Clan') === armorClan)
    ?? MM_EQUIPMENT.find((e) => e.kind === 'baArmor' && e.armorType === armorCode) ?? fail(`BA armor ${armorCode}`);

  const equipment: BAItem[] = [];
  let uid = 0;
  const blocks: [string, number | undefined][] = [['Squad Equipment', undefined], ['Point Equipment', undefined], ...[1, 2, 3, 4, 5, 6].map((t) => [`Trooper ${t} Equipment`, t] as [string, number])];
  for (const [tag, trooper] of blocks) {
    for (const raw0 of tags.get(tag.toLowerCase()) ?? []) {
      let raw = raw0;
      const mount = /:Body\b/.test(raw) ? 'body' : /:LA\b/.test(raw) ? 'LA' : /:RA\b/.test(raw) ? 'RA' : /:TU\b/.test(raw) ? 'turret' : null;
      const dwp = /:DWP\b/.test(raw);
      const ssw = /:SSWM\b/.test(raw);
      const apm = /:APM\b/.test(raw);
      const shotsM = /:Shots(\d+)#/.exec(raw);
      raw = raw.replace(/:(Body|LA|RA|TU|DWP|SSWM|APM)\b/g, '').replace(/:Shots\d+#/, '').replace(/:SIZE:.*$/i, '').trim();
      let e = findMM(raw, armorClan ? 'Clan' : techBase) ?? fail(`unknown BA item "${raw}"`);
      if (e.kind === 'baArmor' && e.id !== armorEntry.id) {
        if (e.armorType !== armorEntry.armorType) fail(`armor slots ${e.id} vs ${armorEntry.id}`);
        e = armorEntry;
      }
      const item: BAItem = { uid: `b${uid++}`, equipmentId: e.id, mount };
      if (trooper) item.trooper = trooper;
      if (apm) item.apm = true;
      if (ssw) item.ssw = true;
      if (dwp) item.dwp = true;
      if (e.kind === 'ammo') item.shots = shotsM ? Number(shotsM[1]) : 1;
      equipment.push(item);
    }
  }
  // AP weapons sit in the mount (or glove) listed just before them.
  for (let k = 1; k < equipment.length; k++) if (equipment[k].apm && !equipment[k].mount) equipment[k].mount = equipment[k - 1].mount;
  const design0: BattleArmorDesign = {
    schemaVersion: 1, unitType: 'battlearmor', era: '3025', techBase, mixedTech,
    chassis: one('Name'), model: one('Model'),
    weightClass: Math.min(4, Math.max(0, int('weightclass'))) as BattleArmorDesign['weightClass'],
    chassisType: one('chassis').toLowerCase() === 'quad' ? 'quad' : 'biped',
    squadSize: int('Trooper Count') || 4, motion, walkMP: int('cruiseMP'), jumpMP: int('jumpingMP'),
    armorId: armorEntry.id, armor: int('armor'),
    ...(one('exoskeleton').toLowerCase() === 'true' ? { exoskeleton: true } : {}),
    ...(turret ? { turret } : {}),
    equipment,
  };
  // Older files leave out the armor's slot pieces; place them in free slots.
  const design = syncArmorSlots(design0);
  return { design, year: Number(one('year')) || 3050, mulId: Number(one('mul id:')) || undefined, source: one('source') };
}

// ---------------------------------------------------------------------------------------------------------------
// Conventional infantry
// ---------------------------------------------------------------------------------------------------------------

const INF_MOTION: Record<string, InfantryMotion> = {
  leg: 'leg', jump: 'jump', motorized: 'motorized', hover: 'hover', wheeled: 'wheeled', tracked: 'tracked',
  submarine: 'submarine', 'motorized scuba': 'motorized-umu', microlite: 'microlite', microcopter: 'vtol', umu: 'umu', scuba: 'umu',
};

function parseInfantryBlk(text: string): { design: InfantryDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1].toLowerCase(), m[2].split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k.toLowerCase())?.[0] ?? '';
  const int = (k: string) => Number(one(k)) || 0;
  const typeStr = one('type');
  const techBase: TechBase = /^Clan|Clan Chassis/.test(typeStr) ? 'Clan' : 'IS';
  const mixedTech = /^Mixed/.test(typeStr);
  if (tags.has('augmentation')) fail('augmentations');
  if ([...tags.keys()].some((k) => /prosthetic/i.test(k))) fail('prosthetics');
  if (tags.has('disposableweapon')) fail('disposable weapons');
  const motionRaw = one('motion_type');
  const beastM = /^Beast:(.+)$/.exec(motionRaw);
  const motion: InfantryMotion = beastM ? 'beast' : INF_MOTION[motionRaw.toLowerCase()] ?? fail(`motion ${motionRaw}`);
  if (beastM && !BEASTS.some((b) => b.name === beastM[1])) fail(`beast ${beastM[1]}`);
  const weapon = (name: string) => {
    const e = findMM(name, techBase);
    if (!e || e.kind !== 'infantryWeapon') fail(`infantry weapon "${name}"`);
    return e!.id;
  };
  let armorKit: string | null = null;
  let antiMek = false;
  const tools: string[] = [];
  for (const raw of tags.get('troopers equipment') ?? []) {
    if (/^AntiMekGear$/i.test(raw)) { antiMek = true; continue; }
    const e = findMM(raw, techBase) ?? fail(`trooper item "${raw}"`);
    if (e.flags.includes('F_ARMOR_KIT')) armorKit = e.id;
    else if (e.flags.includes('F_TOOLS')) tools.push(e.id);
    else fail(`trooper item "${raw}"`);
  }
  const fieldGuns: FieldGun[] = [];
  let ammoTons = 0;
  let uid = 0;
  for (const raw of tags.get('field guns equipment') ?? []) {
    if (/ammo/i.test(raw)) { ammoTons += 1; continue; }
    const r = resolveName(raw, techBase);
    if (r.kind !== 'item') fail(`field gun "${raw}"`);
    fieldGuns.push({ uid: `g${uid++}`, equipmentId: (r as { id: string }).id });
  }
  // Ammunition is carried by the guns (one ton per listed bin).
  if (fieldGuns.length && ammoTons) {
    const per = ammoTons / fieldGuns.length;
    fieldGuns.forEach((g) => { g.ammoTons = per; });
  }
  const specBits = int('specialization');
  const custom = !armorKit && (tags.has('armordivisor') || tags.has('encumberingarmor') || tags.has('spacesuit') || tags.has('dest') || tags.has('sneakcamo') || tags.has('sneakir') || tags.has('sneakecm'));
  const design: InfantryDesign = {
    schemaVersion: 1, unitType: 'infantry', era: '3025', techBase, mixedTech,
    chassis: one('Name'), model: one('Model'), motion, ...(beastM ? { beast: beastM[1] } : {}),
    squadSize: int('squad_size'), squads: int('squadn'),
    primary: weapon(one('Primary')),
    secondary: tags.has('secondary') ? weapon(one('Secondary')) : null,
    secondaryPerSquad: tags.has('secondary') ? int('secondn') : 0,
    armorKit,
    customArmor: custom ? {
      divisor: Number(one('armordivisor')) || 1, encumbering: one('encumberingarmor') === 'true', spaceSuit: one('spacesuit') === 'true',
      dest: one('dest') === 'true', sneakCamo: one('sneakcamo') === 'true', sneakIR: one('sneakir') === 'true', sneakECM: one('sneakecm') === 'true',
    } : null,
    antiMek,
    specializations: SPECIALIZATIONS.filter((_, i) => specBits & (1 << i)),
    tools, fieldGuns,
  };
  return { design, year: Number(one('year')) || 3025, mulId: Number(one('mul id:')) || undefined, source: one('source') };
}

/** Leave out apocryphal designs (video-game and other non-canon sources). */
function official(list: CanonEntry[]): CanonEntry[] {
  return list.filter((e) => !/apocryph/i.test(e.src ?? '') && !/apocryph/i.test(e.n));
}

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
    const [kind, size0, doors0, , platoon, , bits0] = t.split(':');
    const k = kind.toLowerCase();
    if (k === 'dockingcollar') { dockingCollars++; continue; }
    if (k === 'dropshuttlebay') { bays.push({ kind: 'drop-shuttle', size: 1, doors: Number(doors0) || 0 }); continue; }
    const size = Number(size0) || 0;
    if (QUARTERS_BLK[k]) { const [q, per] = QUARTERS_BLK[k]; quarters[q] += Math.floor(size / per + 1e-9); continue; }
    if (k === 'infantrybay') { bays.push({ kind: INFANTRY_BAYS[(platoon ?? 'foot').toLowerCase()] ?? fail(`infantry bay ${platoon}`), size, doors: Number(doors0) || 0 }); continue; }
    if (k === 'troopspace') { bays.push({ kind: 'troop-space', size, doors: 0 }); continue; }
    const bk = BAY_NAMES[k] ?? fail(`bay ${kind}`);
    // Bitmap field: 1 = ComStar battle armor bay, 2 = Clan bay.
    const bits = Number(bits0) || 0;
    const variant = bk === 'battle-armor' ? (bits & 1 ? 'comstar' : bits & 2 ? 'clan' : undefined) : undefined;
    bays.push({ kind: bk, size, doors: Number(doors0) || 0, ...(variant ? { variant } : {}) });
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
  Submarine: 'naval', Rail: 'rail', Maglev: 'rail', Aerodyne: 'fixed-wing', Airship: 'airship', WiGE: 'wige',
};
const SV_ENGINES: Record<string, SupportVehicleDesign['engineType']> = {
  0: 'fusion', 1: 'ice', 6: 'fuel-cell', 7: 'fission', 8: 'none', 9: 'maglev', 10: 'steam', 11: 'battery', 12: 'solar', 13: 'external',
};
const CHASSIS_MOD_NAMES: [RegExp, string][] = [
  [/armored/i, 'armored'], [/off-?road/i, 'off-road'], [/tractor/i, 'tractor'], [/trailer\]|trailerchassis|\[trailer/i, 'trailer'],
  [/amphibious/i, 'amphibious'], [/environmental sealing/i, 'environmental-sealing'], [/bicycle/i, 'bicycle'],
  [/ultra-?light/i, 'ultra-light'], [/vstol/i, 'vstol'], [/stol/i, 'stol'], [/submersible/i, 'submersible'], [/hydrofoil/i, 'hydrofoil'],
  [/prop/i, 'prop'], [/dune ?buggy/i, 'dune-buggy'], [/convertible/i, 'convertible'], [/snowmobile/i, 'snowmobile'],
  [/monocycle/i, 'monocycle'], [/external ?power/i, 'external-power-pickup'], [/omni/i, 'omni'],
];

function parseSupportBlk(text: string): { design: SupportVehicleDesign; year: number; mulId?: number; source: string } {
  const tags = new Map<string, string[]>();
  const re = /<([^/>]+)>\s*\n([\s\S]*?)\n<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) tags.set(m[1], m[2].split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const one = (k: string) => tags.get(k)?.[0] ?? '';
  const unitType = one('UnitType');
  if (!['SupportTank', 'SupportVTOL', 'FixedWingSupport', 'LargeSupportTank'].includes(unitType)) fail(`unit type ${unitType}`);
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
  const large = unitType === 'LargeSupportTank';
  if (large !== isLargeSupportTank({ svType, tonnage })) fail('large support tank size class');
  for (const k of ['Front Turret Equipment', 'Rear Turret Equipment', 'Wings Equipment', ...(large ? ['Left Equipment', 'Right Equipment'] : ['Front Right Equipment', 'Front Left Equipment', 'Rear Right Equipment', 'Rear Left Equipment'])]) {
    if ((tags.get(k) ?? []).length) fail(k);
  }
  const turret = tags.has('Turret Equipment');
  const armorVals = (tags.get('armor') ?? []).map(Number);
  const armor: SupportVehicleDesign['armor'] = {};
  if (aero) [armor.NO, armor.LW, armor.RW, armor.AF] = armorVals;
  else if (large) {
    // Large support tanks: front, front right, front left, rear right, rear left, rear (+ turret).
    [armor.FR, armor.FRS, armor.FLS, armor.RRS, armor.RLS, armor.RR] = armorVals;
    if (turret) armor.TU = armorVals[6] ?? 0;
  } else {
    [armor.FR, armor.RS, armor.LS, armor.RR] = armorVals;
    if (svType === 'vtol') armor.RO = armorVals[4] ?? 0;
    else if (turret) armor.TU = armorVals[4] ?? 0;
  }
  const blocks: [string, SVLocation][] = aero
    ? [['Nose Equipment', 'NO'], ['Left Wing Equipment', 'LW'], ['Right Wing Equipment', 'RW'], ['Aft Equipment', 'AF'], ['Body Equipment', 'BD']]
    : large
      ? [['Front Equipment', 'FR'], ['Front Right Equipment', 'FRS'], ['Front Left Equipment', 'FLS'], ['Rear Right Equipment', 'RRS'],
        ['Rear Left Equipment', 'RLS'], ['Rear Equipment', 'RR'], ['Turret Equipment', 'TU'], ['Body Equipment', 'BD']]
      : [['Front Equipment', 'FR'], ['Right Equipment', 'RS'], ['Left Equipment', 'LS'], ['Rear Equipment', 'RR'], ['Turret Equipment', 'TU'], ['Body Equipment', 'BD']];
  const equipment: SVItem[] = [];
  const chassisMods = new Set<string>();
  if (tags.has('omni')) chassisMods.add('omni');
  if (one('motion_type') === 'Hydrofoil') chassisMods.add('hydrofoil');
  if (one('motion_type') === 'Submarine') chassisMods.add('submersible');
  let fireControl: SupportVehicleDesign['fireControl'] = 'none';
  let uid = 0;
  for (const [tag, loc] of blocks) {
    for (const rawLine of tags.get(tag) ?? []) {
      const size = Number(/:SIZE:([\d.]+)/.exec(rawLine)?.[1] ?? 1);
      const raw = rawLine.replace(/:SIZE:[\d.]+/, '').replace(/:OMNI/, '');
      if (/chassis|environmental sealing$/i.test(raw) && !/\(mech\)/i.test(raw)) {
        const mod = CHASSIS_MOD_NAMES.find(([r]) => r.test(raw));
        if (!mod) fail(`chassis mod "${raw}"`);
        chassisMods.add(mod![1]);
        continue;
      }
      // MASH (core + theaters) and ladders (per 20 m) are sized items.
      if (/^MASH Equipment$/i.test(raw)) {
        for (let n = 0; n < Math.max(1, Math.round(size)); n++) equipment.push({ uid: `s${uid++}`, equipmentId: n ? 'mash-theater' : 'mash-core', location: 'BD' });
        continue;
      }
      if (/^Ladder$/i.test(raw)) {
        for (let n = 0; n < Math.max(1, Math.round(size / 20)); n++) equipment.push({ uid: `s${uid++}`, equipmentId: 'ladder-20m', location: 'BD' });
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
      // Unit bays: infantrybay:<platoons>:<doors>:<bay>:<platoon type>, others <size>:<doors>:…
      case 'infantrybay': case 'battlearmorbay': case 'lightvehiclebay': case 'heavyvehiclebay': case 'mekbay':
      case 'protomekbay': case 'livestockcargobay': {
        const parts = t.split(':');
        const k = kind.toLowerCase();
        const platoon = (parts[4] ?? 'Foot').toLowerCase();
        const bayKind: SVBayKind = k === 'infantrybay' ? (`infantry-${platoon}` as SVBayKind)
          : ({ battlearmorbay: 'battle-armor', lightvehiclebay: 'light-vehicle', heavyvehiclebay: 'heavy-vehicle', mekbay: 'mek', protomekbay: 'protomek', livestockcargobay: 'livestock-cargo' } as const)[k as 'mekbay'];
        if (!SV_BAY_INFO[bayKind]) fail(`bay ${t}`);
        // Field 6 is a bitmap: 1 = ComStar bay, 2 = Clan bay.
        const bits = Number(parts[6]) || 0;
        const variant = bayKind === 'battle-armor' ? (bits & 1 ? 'comstar' : bits & 2 ? 'clan' : undefined) : undefined;
        transport.bays = [...(transport.bays ?? []), { kind: bayKind, size: n, doors: Number(parts[2]) || 0, ...(variant ? { variant } : {}) }];
        break;
      }
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
        // Configurations share one OmniMech only when they share the fixed base chassis.
        const d0 = p.design;
        const fixedBase = JSON.stringify([d0.engineType, d0.walkMP, d0.structureType, d0.armorType, d0.armor, d0.heatSinkType,
          d0.engineHeatSinks, d0.componentTech ?? null, d0.cockpitType, d0.gyroType,
          d0.equipment.filter((e) => !p.pods.has(e)).map((e) => `${e.equipmentId}@${e.location}`).sort()]);
        const g = `${p.design.chassis}|${p.design.techBase}|${p.design.tonnage}|${p.design.config}|${fixedBase}`;
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
  // Chassis with configurations on more than one base: the later bases are named after their first configuration.
  const basesPerChassis = new Map<string, number>();
  for (const group of omniGroups.values()) {
    const c = group[0].design.chassis;
    basesPerChassis.set(c, (basesPerChassis.get(c) ?? 0) + 1);
  }
  const seenChassis = new Set<string>();
  const hasPrime = (g: ParsedMech[]) => (g.some((p) => p.design.model === 'Prime') ? 1 : 0);
  for (const group of [...omniGroups.values()].sort((a, b) => hasPrime(b) - hasPrime(a))) {
    group.sort((a, b) => (a.design.model === 'Prime' ? -1 : b.design.model === 'Prime' ? 1 : a.design.model.localeCompare(b.design.model)));
    // Configurations may differ from the Prime in mixed tech (Society / Bloodname pods) and jump jet type.
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
        configurations: group.map((p, i) => ({
          name: p.design.model, pod: i === 0 ? [] : podsOf(p), actuators: p.design.actuators,
          ...(i > 0 && p.design.mixedTech !== base.design.mixedTech ? { mixedTech: p.design.mixedTech } : {}),
          ...(i > 0 && p.design.jumpJetType !== base.design.jumpJetType ? { jumpJetType: p.design.jumpJetType } : {}),
        })),
      },
    };
    if ((basesPerChassis.get(design.chassis) ?? 1) > 1) {
      // The first base (the Prime's, as groups are sorted) keeps the plain name.
      if (seenChassis.has(design.chassis)) design.chassis = `${design.chassis} (${group[0].design.model} base)`;
      else seenChassis.add(design.chassis);
    }
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
      if (process.env.VEH_DEBUG && (issues.some((i) => i.severity === 'error') || s.weights.total !== d.tonnage)) {
        console.error(`VEH ${d.chassis} ${d.model} [${d.motive} ${d.engineType} ${d.armorType}${d.omni ? ' omni' : ''}] ${s.weights.total}/${d.tonnage} ${issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' | ')}`);
      }
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
  fs.writeFileSync(path.join(outDir, 'vessels.json'), JSON.stringify(official(vessels)));
  console.log(`Small craft / DropShips / large craft: ${vessels.length} converted, ${vslSkipped} skipped; exact tonnage ${vessels.filter((e) => e.w).length}, fully legal ${vessels.filter((e) => e.ok).length}`);

  // --- Battle armor
  const baFiles = walk(path.join(root, 'data/mekfiles/battlearmor'), '.blk').sort();
  const battlearmor: CanonEntry[] = [];
  let baSkipped = 0;
  const baseen = new Set<string>();
  for (const f of baFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/<UnitType>\s*\nBattleArmor\n/.test(text)) continue;
    try {
      const p = parseBattleArmorBlk(text);
      const key = `${p.design.chassis} ${p.design.model}`;
      if (baseen.has(key)) continue;
      baseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateBattleArmor(x).map((i) => i.message));
      const s = computeBattleArmor(d);
      const issues = validateBattleArmor(d, s);
      battlearmor.push({
        n: `${d.chassis} ${d.model}`.trim(), t: s.weights.total, tb: d.techBase, era: d.era, y: p.year,
        k: `${d.weightClass}:${d.chassisType}:${d.motion}`, bv: battleArmorBV(d).total,
        ok: issues.every((i) => i.severity !== 'error'), w: s.weights.total <= s.trooperLimit + 1e-9,
        src: p.source, mul: p.mulId, d: encodeBattleArmor(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      baSkipped++;
      note(`battle armor: ${e.message}`);
    }
  }
  battlearmor.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'battlearmor.json'), JSON.stringify(official(battlearmor)));
  console.log(`Battle armor: ${battlearmor.length} converted, ${baSkipped} skipped; within weight ${battlearmor.filter((e) => e.w).length}, fully legal ${battlearmor.filter((e) => e.ok).length}`);

  // --- Conventional infantry
  const infFiles = walk(path.join(root, 'data/mekfiles/infantry'), '.blk').sort();
  const infantry: CanonEntry[] = [];
  let infSkipped = 0;
  const infseen = new Set<string>();
  for (const f of infFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/<UnitType>\s*\nInfantry\n/.test(text)) continue;
    try {
      const p = parseInfantryBlk(text);
      const key = `${p.design.chassis} ${p.design.model}`;
      if (infseen.has(key)) continue;
      infseen.add(key);
      const d = settleEra(p.design, p.year, (x) => validateInfantry(x).map((i) => i.message));
      const s = computeInfantry(d);
      const issues = validateInfantry(d, s);
      infantry.push({
        n: `${d.chassis} ${d.model}`.trim(), t: s.weight, tb: d.techBase, era: d.era, y: p.year,
        k: d.motion, bv: infantryBV(d).total, ok: issues.every((i) => i.severity !== 'error'), w: true,
        src: p.source, mul: p.mulId, d: encodeInfantry(d),
      });
    } catch (e) {
      if (!(e instanceof Unsupported)) throw new Error(`${f}: ${(e as Error).stack}`);
      infSkipped++;
      note(`infantry: ${e.message}`);
    }
  }
  infantry.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'infantry.json'), JSON.stringify(official(infantry)));
  console.log(`Infantry: ${infantry.length} converted, ${infSkipped} skipped; fully legal ${infantry.filter((e) => e.ok).length}`);

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
  fs.writeFileSync(path.join(outDir, 'fighters.json'), JSON.stringify(official(fighters)));
  console.log(`Fighters: ${fighters.length} converted, ${ftrSkipped} skipped; exact tonnage ${fighters.filter((e) => e.w).length}, fully legal ${fighters.filter((e) => e.ok).length}`);

  supports.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'support.json'), JSON.stringify(official(supports)));
  const sOk = supports.filter((e) => e.ok).length;
  const sW = supports.filter((e) => e.w).length;
  console.log(`Support vehicles: ${supports.length} converted, ${svSkipped} skipped; exact tonnage ${sW}, fully legal ${sOk}`);

  plain.sort((a, b) => a.n.localeCompare(b.n));
  vehicles.sort((a, b) => a.n.localeCompare(b.n));
  fs.writeFileSync(path.join(outDir, 'mechs.json'), JSON.stringify(official(plain)));
  fs.writeFileSync(path.join(outDir, 'vehicles.json'), JSON.stringify(official(vehicles)));

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
