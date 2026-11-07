import type { ArmLocation, ArmorFacing, Location, MechDesign, MountedItem } from './types';
import { ARMOR_FACINGS, LOCATIONS, REAR_FACING } from './types';
import { ARMOR_POINTS_PER_TON, FREE_HEAT_SINKS, engineHeatSinkCapacity, maxWalkMP } from './tables';
import { HEAT_SINK_ID, JUMP_JET_ID, canRearMount, getEquipment } from './equipment';
import type { EraId } from './eras';
import { DEFAULT_ERA, getEra } from './eras';
import { distributeArmor, emptyArmor, maxArmorByLocation, maxTotalArmor } from './armor';

/** Pure editing operations: each returns a new design. */

let uidCounter = 0;
export function newUid(): string {
  uidCounter++;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${uidCounter}`;
}

export function newDesign(era: EraId = DEFAULT_ERA): MechDesign {
  // 50 tons, walk 4: engine 200 holds 8 heat sinks; place the other 2 of the free 10.
  return {
    schemaVersion: 1,
    era,
    chassis: 'New Mech',
    model: 'NM-1',
    tonnage: 50,
    walkMP: 4,
    engineHeatSinks: 8,
    armor: emptyArmor(),
    actuators: { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } },
    equipment: [
      { uid: newUid(), equipmentId: HEAT_SINK_ID, location: 'LT' },
      { uid: newUid(), equipmentId: HEAT_SINK_ID, location: 'RT' },
    ],
  };
}

function totalHeatSinks(d: MechDesign): number {
  return d.engineHeatSinks + d.equipment.filter((e) => e.equipmentId === HEAT_SINK_ID).length;
}

/** Make the number of `equipmentId` items equal `count`, removing unallocated ones first. */
function syncCount(d: MechDesign, equipmentId: string, count: number): MechDesign {
  const target = Math.max(0, Math.floor(count));
  const existing = d.equipment.filter((e) => e.equipmentId === equipmentId);
  if (existing.length === target) return d;
  if (existing.length < target) {
    const added: MountedItem[] = Array.from({ length: target - existing.length }, () => ({
      uid: newUid(), equipmentId, location: null,
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
  return syncCount({ ...d, engineHeatSinks: inEngine }, HEAT_SINK_ID, total - inEngine);
}

export function setHeatSinkTotal(d: MechDesign, total: number): MechDesign {
  const t = Math.max(0, Math.floor(total));
  return refitHeatSinks(d, t, t);
}

export function setEngineHeatSinks(d: MechDesign, inEngine: number): MechDesign {
  return refitHeatSinks(d, totalHeatSinks(d), Math.floor(inEngine));
}

export function setTonnage(d: MechDesign, tonnage: number): MechDesign {
  const walkMP = Math.max(1, Math.min(d.walkMP, maxWalkMP(tonnage)));
  const max = maxArmorByLocation(tonnage);
  const armor = { ...d.armor };
  for (const loc of LOCATIONS) {
    const rear = REAR_FACING[loc];
    if (rear) {
      armor[rear] = Math.min(armor[rear], max[loc]);
      armor[loc] = Math.min(armor[loc], max[loc] - armor[rear]);
    } else {
      armor[loc] = Math.min(armor[loc], max[loc]);
    }
  }
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
  return syncCount(d, JUMP_JET_ID, jumpMP);
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
  return { ...d, armor: distributeArmor(d.tonnage, maxTotalArmor(d.tonnage)) };
}

export function clearArmor(d: MechDesign): MechDesign {
  return { ...d, armor: emptyArmor() };
}

export function setArmorTonnage(d: MechDesign, tons: number): MechDesign {
  return { ...d, armor: distributeArmor(d.tonnage, Math.round(tons * 2) * (ARMOR_POINTS_PER_TON / 2)) };
}

export function addEquipment(d: MechDesign, equipmentId: string, location: Location | null = null): MechDesign {
  return { ...d, equipment: [...d.equipment, { uid: newUid(), equipmentId, location }] };
}

export function removeEquipment(d: MechDesign, uid: string): MechDesign {
  return { ...d, equipment: d.equipment.filter((e) => e.uid !== uid) };
}

export function setItemLocation(d: MechDesign, uid: string, location: Location | null): MechDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => {
      if (e.uid !== uid) return e;
      const eq = getEquipment(e.equipmentId);
      const rear = e.rear && eq && canRearMount(eq, location) ? true : undefined;
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
  const equipment: MountedItem[] = r.equipment.map((e: Record<string, unknown>) => {
    if (typeof e?.equipmentId !== 'string') throw new Error('Equipment entry without an id.');
    const location = (LOCATIONS as readonly string[]).includes(e.location as string)
      ? (e.location as Location)
      : null;
    return { uid: newUid(), equipmentId: e.equipmentId, location, rear: e.rear === true || undefined };
  });
  return {
    schemaVersion: 1,
    era: getEra(String(r.era))?.id ?? DEFAULT_ERA,
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
