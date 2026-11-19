import type { ArmActuators, ArmLocation, Location, MechDesign, MountedItem } from './types';
import { isQuad } from './types';

/**
 * Lower arm and hand actuators are mounted items (equipment ids below) that live in the arms' critical
 * slots, so they can be added, removed and placed like any other equipment. The shoulder and upper arm
 * actuators are always present and stay fixed slots.
 */
export const LOWER_ARM_ACTUATOR_ID = 'lower-arm-actuator';
export const HAND_ACTUATOR_ID = 'hand-actuator';
export const ACTUATOR_IDS: readonly string[] = [LOWER_ARM_ACTUATOR_ID, HAND_ACTUATOR_ID];
export const isActuatorId = (id: string) => ACTUATOR_IDS.includes(id);

const ARMS: readonly ArmLocation[] = ['LA', 'RA'];

let counter = 0;
const actuatorUid = () => `act-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Which actuators are mounted in an arm (only items allocated to it count). */
export function armActuators(d: Pick<MechDesign, 'equipment' | 'config'>, arm: ArmLocation): ArmActuators {
  if (isQuad(d)) return { lowerArm: true, hand: true };
  const here = (id: string) => d.equipment.some((e) => e.equipmentId === id && e.location === arm);
  return { lowerArm: here(LOWER_ARM_ACTUATOR_ID), hand: here(HAND_ACTUATOR_ID) };
}

export function actuatorsOf(d: Pick<MechDesign, 'equipment' | 'config'>): Record<ArmLocation, ArmActuators> {
  return { LA: armActuators(d, 'LA'), RA: armActuators(d, 'RA') };
}

/** Actuator items for the given arms, allocated to their default slots. */
export function actuatorItems(acts: Record<ArmLocation, ArmActuators>, armored?: (arm: Location, id: string) => boolean): MountedItem[] {
  const out: MountedItem[] = [];
  for (const arm of ARMS) {
    const a = acts[arm];
    const add = (id: string) => out.push({ uid: actuatorUid(), equipmentId: id, location: arm, ...(armored?.(arm, id) ? { armored: true } : {}) });
    if (a.lowerArm) add(LOWER_ARM_ACTUATOR_ID);
    if (a.lowerArm && a.hand) add(HAND_ACTUATOR_ID);
  }
  return out;
}

export const FULL_ARM_ACTUATORS: Record<ArmLocation, ArmActuators> = { LA: { lowerArm: true, hand: true }, RA: { lowerArm: true, hand: true } };

/** Replace the design's actuator items with the given set (quads carry none); armored actuators stay armored. */
export function withActuators<T extends Pick<MechDesign, 'equipment' | 'config'>>(d: T, acts: Record<ArmLocation, ArmActuators>): T {
  const rest = d.equipment.filter((e) => !isActuatorId(e.equipmentId));
  if (isQuad(d)) return { ...d, equipment: rest };
  const wasArmored = (arm: Location, id: string) => d.equipment.some((e) => e.equipmentId === id && e.location === arm && e.armored);
  return { ...d, equipment: [...rest, ...actuatorItems(acts, wasArmored)] };
}

/**
 * Older designs (and the bundled canon lists) store arm actuators as `actuators: { LA: { lowerArm, hand }, … }`
 * with the lower arm and hand in fixed slots 2 and 3 of each arm. Turn those into actuator items, carrying any
 * armoring of those slots over to the items.
 */
export function migrateLegacyActuators<T extends MechDesign>(d: T & { actuators?: Record<ArmLocation, Partial<ArmActuators>> }): T {
  const { actuators: legacy, ...rest } = d;
  const base = rest as unknown as T;
  if (!legacy) return base;
  const acts: Record<ArmLocation, ArmActuators> = {
    LA: { lowerArm: legacy.LA?.lowerArm !== false, hand: legacy.LA?.lowerArm !== false && legacy.LA?.hand !== false },
    RA: { lowerArm: legacy.RA?.lowerArm !== false, hand: legacy.RA?.lowerArm !== false && legacy.RA?.hand !== false },
  };
  if (isQuad(base)) return withActuators(base, acts);
  // Armored lower arm (fixed slot 2) and hand (slot 3) become armored items.
  let armoredSlots = base.armoredSlots;
  const armored = (arm: Location, id: string) => (armoredSlots?.[arm as ArmLocation] ?? []).includes(id === LOWER_ARM_ACTUATOR_ID ? 2 : 3);
  const items = actuatorItems(acts, armored);
  if (armoredSlots) {
    armoredSlots = { ...armoredSlots };
    for (const arm of ARMS) {
      const list = armoredSlots[arm]?.filter((i) => !(i === 2 && acts[arm].lowerArm) && !(i === 3 && acts[arm].hand));
      if (list?.length) armoredSlots[arm] = list; else delete armoredSlots[arm];
    }
  }
  const out = { ...base, equipment: [...base.equipment.filter((e) => !isActuatorId(e.equipmentId)), ...items] } as T;
  if (armoredSlots && Object.keys(armoredSlots).length) out.armoredSlots = armoredSlots; else delete out.armoredSlots;
  return out;
}
