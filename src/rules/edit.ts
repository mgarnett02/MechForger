import type {
  ArmLocation, ArmorAllocation, ArmorFacing, ArmorType, CockpitType, EngineType, GyroType, HeatSinkType, JumpJetType, Location,
  LamType, MechConfig, MechDesign, MountedItem, MyomerType, OmniData, StructureType, TechBase,
} from './types';
import { ARMOR_FACINGS, LOCATIONS, REAR_FACING, isQuad, legLocations } from './types';
import {
  ARMOR_OPTIONS, COCKPIT_OPTIONS, ENGINE_OPTIONS, GYRO_OPTIONS, MYOMER_OPTIONS, STRUCTURE_OPTIONS,
  FREE_HEAT_SINKS, armorPointsPerTon, armorSlots, engineHeatSinkCapacity, maxWalkMP, structureSlots,
} from './tables';
import {
  ENDO_STEEL_ID, ENV_SEAL_ID, FERRO_FIBROUS_ID, HEAT_SINK_IDS, JUMP_JET_IDS, TSM_ID, allowedLocations,
  canRearMount, getEquipment, heatSinkIdFor, itemSlots, jumpJetIdFor,
} from './equipment';
import { isFixedOnly } from './omni';
import { computeMech } from './construction';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra } from './eras';
import { armorPointsForTons, distributeArmor, emptyArmor, maxArmorByLocation, maxTotalArmor } from './armor';

/** Pure editing operations: each returns a new design. */

let uidCounter = 0;
export function newUid(): string {
  uidCounter++;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${uidCounter}`;
}

export function newDesign(era: EraId = DEFAULT_ERA, techBase: TechBase = 'IS'): MechDesign {
  // 50 tons, walk 4: engine 200 holds 8 heat sinks; place the other 2 of the free 10.
  return {
    schemaVersion: 1,
    era,
    techBase,
    structureType: 'standard',
    engineType: 'standard',
    gyroType: 'standard',
    cockpitType: 'standard',
    heatSinkType: 'single',
    jumpJetType: 'standard',
    armorType: 'standard',
    myomer: 'standard',
    mixedTech: false,
    config: 'biped',
    omni: null,
    chassis: 'New Mech',
    model: 'NM-1',
    tonnage: 50,
    walkMP: 4,
    engineHeatSinks: 8,
    armor: emptyArmor(),
    actuators: { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } },
    equipment: [
      { uid: newUid(), equipmentId: 'heat-sink', location: 'LT' },
      { uid: newUid(), equipmentId: 'heat-sink', location: 'RT' },
    ],
  };
}

function totalHeatSinks(d: MechDesign): number {
  return d.engineHeatSinks + d.equipment.filter((e) => HEAT_SINK_IDS.includes(e.equipmentId)).length;
}

/** Make the number of `equipmentId` items equal `count`, removing unallocated ones first. */
function syncCount(d: MechDesign, equipmentId: string, count: number): MechDesign {
  const target = Math.max(0, Math.floor(count));
  const existing = d.equipment.filter((e) => e.equipmentId === equipmentId);
  if (existing.length === target) return d;
  if (existing.length < target) {
    const pod = d.omni && !isFixedOnly(equipmentId) ? true : undefined;
    const added: MountedItem[] = Array.from({ length: target - existing.length }, () => ({
      uid: newUid(), equipmentId, location: null, ...(pod ? { pod } : {}),
    }));
    return { ...d, equipment: [...d.equipment, ...added] };
  }
  const removeOrder = [
    ...existing.filter((e) => e.location === null),
    ...existing.filter((e) => e.location !== null).reverse(),
  ];
  const remove = new Set(removeOrder.slice(0, existing.length - target).map((e) => e.uid));
  return { ...d, equipment: d.equipment.filter((e) => !remove.has(e.uid)) };
}

/** Keep total heat sinks constant while respecting the engine's capacity. */
function refitHeatSinks(d: MechDesign, total: number, preferredInEngine: number): MechDesign {
  const cap = engineHeatSinkCapacity(d.tonnage * d.walkMP);
  const inEngine = Math.max(0, Math.min(preferredInEngine, cap, total));
  return syncCount({ ...d, engineHeatSinks: inEngine }, heatSinkIdFor(d), total - inEngine);
}

export function setHeatSinkTotal(d: MechDesign, total: number): MechDesign {
  const t = Math.max(0, Math.floor(total));
  return refitHeatSinks(d, t, t);
}

export function setEngineHeatSinks(d: MechDesign, inEngine: number): MechDesign {
  return refitHeatSinks(d, totalHeatSinks(d), Math.floor(inEngine));
}

/** Trim armor that exceeds the per-location maximums for this tonnage and configuration. */
function clampArmor(armorIn: ArmorAllocation, tonnage: number, quad: boolean): ArmorAllocation {
  const max = maxArmorByLocation(tonnage, quad);
  const armor = { ...armorIn };
  for (const loc of LOCATIONS) {
    const rear = REAR_FACING[loc];
    if (rear) {
      armor[rear] = Math.min(armor[rear], max[loc]);
      armor[loc] = Math.min(armor[loc], max[loc] - armor[rear]);
    } else {
      armor[loc] = Math.min(armor[loc], max[loc]);
    }
  }
  return armor;
}

export function setTonnage(d: MechDesign, tonnage: number): MechDesign {
  const walkMP = Math.max(1, Math.min(d.walkMP, maxWalkMP(tonnage)));
  const armor = clampArmor(d.armor, tonnage, isQuad(d));
  const next = { ...d, tonnage, walkMP, armor };
  return refitHeatSinks(next, totalHeatSinks(d), d.engineHeatSinks);
}

export function setWalkMP(d: MechDesign, walkMP: number): MechDesign {
  const w = Math.max(1, Math.min(Math.floor(walkMP), maxWalkMP(d.tonnage)));
  const next = { ...d, walkMP: w };
  // If the bigger engine gained room, move heat sinks inside; if it shrank, push them out.
  const prevCap = engineHeatSinkCapacity(d.tonnage * d.walkMP);
  const wasFull = d.engineHeatSinks >= prevCap;
  const preferred = wasFull ? Number.MAX_SAFE_INTEGER : d.engineHeatSinks;
  return refitHeatSinks(next, totalHeatSinks(d), preferred);
}

export function setJumpMP(d: MechDesign, jumpMP: number): MechDesign {
  return syncCount(d, jumpJetIdFor(d), jumpMP);
}

/**
 * Switch between biped and quad. The arm locations become front legs (or back), so items there
 * that are no longer allowed, or no longer fit, are unallocated; armor is trimmed to the new maximums.
 */
export function setConfig(d: MechDesign, config: MechConfig): MechDesign {
  if (d.config === config) return d;
  // Only bipeds can be Land-Air 'Mechs.
  const next: MechDesign = { ...d, config, lam: config === 'quad' ? null : d.lam, armor: clampArmor(d.armor, d.tonnage, config === 'quad') };
  const limbs: Location[] = ['LA', 'RA'];
  const allowed = (item: MountedItem) => {
    const eq = getEquipment(item.equipmentId);
    return !item.location || !limbs.includes(item.location) || !eq || allowedLocations(eq, next).includes(item.location);
  };
  const free = (item: MountedItem): MountedItem => ({ ...item, location: null, rear: undefined });
  let equipment = next.equipment.map((e) => (allowed(e) ? e : free(e)));
  const slots = computeMech({ ...next, equipment }).slots;
  const overfull = limbs.filter((l) => slots[l].overflow > 0);
  equipment = equipment.map((e) => (e.location && overfull.includes(e.location) ? free(e) : e));
  const omni = next.omni && {
    ...next.omni,
    configurations: next.omni.configurations.map((c) => ({ ...c, pod: c.pod.map((p) => (allowed(p) ? p : free(p))) })),
  };
  return { ...next, equipment, omni };
}

/** Make the design a Land-Air 'Mech of the given type, or an ordinary 'Mech (null). */
export function setLam(d: MechDesign, lam: LamType | null): MechDesign {
  if ((d.lam ?? null) === lam) return d;
  const base = lam ? setConfig(d, 'biped') : d;
  return { ...base, lam };
}

export function setFullHeadEjection(d: MechDesign, on: boolean): MechDesign {
  return { ...d, fullHeadEjection: on || undefined };
}

export function setActuator(
  d: MechDesign, arm: ArmLocation, actuator: 'lowerArm' | 'hand', value: boolean,
): MechDesign {
  const cur = d.actuators[arm];
  let next = { ...cur, [actuator]: value };
  if (actuator === 'lowerArm' && !value) next = { lowerArm: false, hand: false };
  if (actuator === 'hand' && value) next = { lowerArm: true, hand: true };
  return { ...d, actuators: { ...d.actuators, [arm]: next } };
}

export function setArmor(d: MechDesign, facing: ArmorFacing, points: number): MechDesign {
  const v = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  return { ...d, armor: { ...d.armor, [facing]: v } };
}

export function maximizeArmor(d: MechDesign): MechDesign {
  return { ...d, armor: distributeArmor(d.tonnage, maxTotalArmor(d.tonnage, isQuad(d)), isQuad(d)) };
}

export function clearArmor(d: MechDesign): MechDesign {
  return { ...d, armor: emptyArmor() };
}

export function setArmorTonnage(d: MechDesign, tons: number): MechDesign {
  const ppt = armorPointsPerTon(d.armorType, d.techBase);
  return { ...d, armor: distributeArmor(d.tonnage, armorPointsForTons(Math.round(tons * 2) / 2, ppt), isQuad(d)) };
}

export function addEquipment(d: MechDesign, equipmentId: string, location: Location | null = null): MechDesign {
  const pod = d.omni && !isFixedOnly(equipmentId) ? { pod: true } : {};
  // Talons come as a set: one in every leg.
  if (equipmentId === 'talons' && location === null) {
    if (d.equipment.some((e) => e.equipmentId === 'talons')) return d;
    const set = legLocations(d).map((leg): MountedItem => ({ uid: newUid(), equipmentId, location: leg, ...pod }));
    return { ...d, equipment: [...d.equipment, ...set] };
  }
  const item: MountedItem = { uid: newUid(), equipmentId, location, ...pod };
  return { ...d, equipment: [...d.equipment, item] };
}

export function removeEquipment(d: MechDesign, uid: string): MechDesign {
  const target = d.equipment.find((e) => e.uid === uid);
  // Removing one talon removes the whole set.
  if (target?.equipmentId === 'talons') return { ...d, equipment: d.equipment.filter((e) => e.equipmentId !== 'talons') };
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

export function setItemLocation(d: MechDesign, uid: string, location: Location | null): MechDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => {
      if (e.uid !== uid) return e;
      const eq = getEquipment(e.equipmentId);
      const rear = e.rear && eq && canRearMount(eq, location, d) ? true : undefined;
      return { ...e, location, rear };
    }),
  };
}

export function setItemRear(d: MechDesign, uid: string, rear: boolean): MechDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, rear: rear || undefined } : e)),
  };
}

// ---------------------------------------------------------------------------
// Construction options
// ---------------------------------------------------------------------------

/** Swap every heat sink to the id matching the design's type/tech base (unplacing resized ones). */
function normalizeHeatSinks(d: MechDesign): MechDesign {
  const id = heatSinkIdFor(d);
  return {
    ...d,
    equipment: d.equipment.map((e) =>
      HEAT_SINK_IDS.includes(e.equipmentId) && e.equipmentId !== id
        ? { ...e, equipmentId: id, location: null }
        : e,
    ),
  };
}

/** Keep Endo Steel / Ferro-Fibrous slot placeholders at the count the rules require. */
function syncFillers(d: MechDesign): MechDesign {
  const withEndo = syncCount(d, ENDO_STEEL_ID, structureSlots(d.structureType, d.techBase));
  const withFerro = syncCount(withEndo, FERRO_FIBROUS_ID, armorSlots(d.armorType, d.techBase));
  const withTsm = syncCount(withFerro, TSM_ID, tsmSlots(d.myomer));
  return syncCount(withTsm, ENV_SEAL_ID, d.environmentalSealing ? 8 : 0);
}

/** Triple-Strength Myomer occupies 6 critical slots spread over the mech. */
export const TSM_SLOTS = 6;
/** Myomer slots spread over the mech: TSM 6, Industrial TSM 12. */
export const tsmSlots = (m: MyomerType) => (m === 'tsm' ? TSM_SLOTS : m === 'industrial-tsm' ? 12 : 0);

export function setEnvironmentalSealing(d: MechDesign, on: boolean): MechDesign {
  return syncFillers({ ...d, environmentalSealing: on || undefined });
}

export function setMyomer(d: MechDesign, myomer: MyomerType): MechDesign {
  return syncFillers({ ...d, myomer });
}

export function setMixedTech(d: MechDesign, mixedTech: boolean): MechDesign {
  return { ...d, mixedTech };
}

export function setTechBase(d: MechDesign, techBase: TechBase): MechDesign {
  return syncFillers(normalizeHeatSinks({ ...d, techBase }));
}

export function setStructureType(d: MechDesign, structureType: StructureType): MechDesign {
  return syncFillers({ ...d, structureType });
}

export function setArmorType(d: MechDesign, armorType: ArmorType): MechDesign {
  return syncFillers({ ...d, armorType });
}

export function setEngineType(d: MechDesign, engineType: EngineType): MechDesign {
  return { ...d, engineType };
}

/** Switch jump jet type, keeping the jump MP (jets are re-sized, so they need placing again). */
export function setJumpJetType(d: MechDesign, jumpJetType: JumpJetType): MechDesign {
  const id = jumpJetIdFor({ jumpJetType });
  return {
    ...d,
    jumpJetType,
    equipment: d.equipment.map((e) =>
      JUMP_JET_IDS.includes(e.equipmentId) && e.equipmentId !== id ? { ...e, equipmentId: id, location: null } : e,
    ),
  };
}

export function setGyroType(d: MechDesign, gyroType: GyroType): MechDesign {
  return { ...d, gyroType };
}

export function setCockpitType(d: MechDesign, cockpitType: CockpitType): MechDesign {
  return { ...d, cockpitType };
}

export function setHeatSinkType(d: MechDesign, heatSinkType: HeatSinkType): MechDesign {
  return normalizeHeatSinks({ ...d, heatSinkType });
}

const PLACE_ORDER: Location[] = ['LT', 'RT', 'CT', 'LA', 'RA', 'LL', 'RL', 'HD'];
const FILLER_ORDER: Location[] = ['LA', 'RA', 'LL', 'RL', 'LT', 'RT', 'CT', 'HD'];
const FILLERS = [ENDO_STEEL_ID, FERRO_FIBROUS_ID, TSM_ID, ENV_SEAL_ID];

/**
 * Place every unallocated item in the first location with room for it.
 * Large items go first; Endo Steel / Ferro-Fibrous fill the limbs before the torso.
 */
export function autoAllocate(d: MechDesign): MechDesign {
  const summary = computeMech(d);
  const free = Object.fromEntries(LOCATIONS.map((l) => [l, summary.slots[l].free])) as Record<Location, number>;
  const pending = d.equipment
    .filter((e) => e.location === null && getEquipment(e.equipmentId))
    .map((e) => ({ item: e, eq: getEquipment(e.equipmentId)! }))
    .sort((a, b) => itemSlots(b.eq, d) - itemSlots(a.eq, d));
  const placed = new Map<string, Location>();
  for (const { item, eq } of pending) {
    const n = itemSlots(eq, d);
    const order = FILLERS.includes(eq.id) ? FILLER_ORDER : PLACE_ORDER;
    const loc = order.find((l) => allowedLocations(eq, d).includes(l) && free[l] >= n);
    if (loc) {
      free[loc] -= n;
      placed.set(item.uid, loc);
    }
  }
  if (placed.size === 0) return d;
  return {
    ...d,
    equipment: d.equipment.map((e) => (placed.has(e.uid) ? { ...e, location: placed.get(e.uid)! } : e)),
  };
}

/** Coerce untrusted JSON into a design, or throw with a readable message. */
export function parseDesign(raw: unknown): MechDesign {
  if (!raw || typeof raw !== 'object') throw new Error('Not a mech design.');
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Missing or invalid "${name}".`);
    return v;
  };
  const armorIn = (r.armor ?? {}) as Record<string, unknown>;
  const armor = emptyArmor();
  for (const f of ARMOR_FACINGS) armor[f] = typeof armorIn[f] === 'number' ? (armorIn[f] as number) : 0;
  const act = (r.actuators ?? {}) as Record<string, { lowerArm?: unknown; hand?: unknown }>;
  const arm = (a?: { lowerArm?: unknown; hand?: unknown }) => ({
    lowerArm: a?.lowerArm !== false,
    hand: a?.hand !== false,
  });
  if (!Array.isArray(r.equipment)) throw new Error('Missing equipment list.');
  const parseItems = (list: unknown[]): MountedItem[] =>
    list.map((raw) => {
      const e = raw as Record<string, unknown>;
      if (typeof e?.equipmentId !== 'string') throw new Error('Equipment entry without an id.');
      const location = (LOCATIONS as readonly string[]).includes(e.location as string)
        ? (e.location as Location)
        : null;
      const item: MountedItem = { uid: newUid(), equipmentId: e.equipmentId, location };
      if (e.rear === true) item.rear = true;
      if (e.pod === true) item.pod = true;
      return item;
    });
  const equipment = parseItems(r.equipment);
  let omni: OmniData | null = null;
  const o = r.omni as { configurations?: unknown; active?: unknown } | null | undefined;
  if (o && Array.isArray(o.configurations) && o.configurations.length > 0) {
    const configurations = o.configurations.map((c: { name?: unknown; pod?: unknown; actuators?: unknown }, i: number) => {
      const ca = c?.actuators as Record<string, { lowerArm?: unknown; hand?: unknown }> | undefined;
      return {
        name: typeof c?.name === 'string' && c.name ? c.name : `Config ${i + 1}`,
        pod: Array.isArray(c?.pod) ? parseItems(c.pod).map((p) => ({ ...p, pod: true })) : [],
        ...(ca && typeof ca === 'object' ? { actuators: { LA: arm(ca.LA), RA: arm(ca.RA) } } : {}),
      };
    });
    const active = typeof o.active === 'number' && configurations[o.active] ? o.active : 0;
    omni = { configurations, active };
  }
  const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
    options.includes(v as T) ? (v as T) : fallback;
  return {
    schemaVersion: 1,
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
    techBase: pick(r.techBase, ['IS', 'Clan'] as const, 'IS'),
    structureType: pick(r.structureType, Object.keys(STRUCTURE_OPTIONS) as StructureType[], 'standard'),
    engineType: pick(r.engineType, Object.keys(ENGINE_OPTIONS) as EngineType[], 'standard'),
    gyroType: pick(r.gyroType, Object.keys(GYRO_OPTIONS) as GyroType[], 'standard'),
    jumpJetType: pick(r.jumpJetType, ['standard', 'improved'] as const, 'standard'),
    cockpitType: pick(r.cockpitType, Object.keys(COCKPIT_OPTIONS) as CockpitType[], 'standard'),
    heatSinkType: pick(r.heatSinkType, ['single', 'double'] as const, 'single'),
    armorType: pick(r.armorType, Object.keys(ARMOR_OPTIONS) as ArmorType[], 'standard'),
    myomer: pick(r.myomer, Object.keys(MYOMER_OPTIONS) as MyomerType[], 'standard'),
    ...(r.environmentalSealing ? { environmentalSealing: true } : {}),
    mixedTech: r.mixedTech === true,
    config: pick(r.config, ['biped', 'quad'] as const, 'biped'),
    lam: r.config !== 'quad' && (r.lam === 'standard' || r.lam === 'bimodal') ? r.lam : null,
    ...(r.fullHeadEjection === true ? { fullHeadEjection: true } : {}),
    omni,
    chassis: typeof r.chassis === 'string' ? r.chassis : 'Unnamed',
    model: typeof r.model === 'string' ? r.model : '',
    tonnage: num(r.tonnage, 'tonnage'),
    walkMP: num(r.walkMP, 'walkMP'),
    engineHeatSinks: typeof r.engineHeatSinks === 'number' ? r.engineHeatSinks : FREE_HEAT_SINKS,
    armor,
    actuators: { LA: arm(act.LA), RA: arm(act.RA) },
    equipment,
  };
}
