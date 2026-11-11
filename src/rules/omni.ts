import type { MechDesign, MountedItem } from './types';
import { ARMORED_TONS_PER_SLOT, FILLER_IDS, HEAT_SINK_IDS, getEquipment, itemSlots, itemWeight } from './equipment';
import { freeHeatSinks } from './tables';

/**
 * OmniMechs share a fixed base chassis (structure, engine, armor, fixed equipment)
 * between several configurations of pod-mounted equipment.
 *
 * The active configuration's pod items live in design.equipment (flagged `pod`), so
 * every other rule treats the active configuration as an ordinary mech. Inactive
 * configurations keep their pod items in design.omni.configurations[i].pod.
 */

let podUid = 0;
const freshUid = () => `pod-${Date.now().toString(36)}-${(podUid++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Equipment that can never be pod-mounted. */
export function isFixedOnly(equipmentId: string): boolean {
  if (FILLER_IDS.includes(equipmentId)) return true;
  return !!getEquipment(equipmentId)?.fixedOnly;
}

export function fixedItems(d: MechDesign): MountedItem[] {
  return d.equipment.filter((e) => !e.pod);
}

export function podItems(d: MechDesign): MountedItem[] {
  return d.equipment.filter((e) => e.pod);
}

export function activeConfigName(d: MechDesign): string | null {
  return d.omni ? d.omni.configurations[d.omni.active]?.name ?? null : null;
}

/** Store the live pod items and arm actuators back into the active configuration. */
function stash(d: MechDesign): MechDesign {
  if (!d.omni) return d;
  const configurations = d.omni.configurations.map((c, i) =>
    i === d.omni!.active ? { ...c, pod: podItems(d), actuators: d.actuators, mixedTech: d.mixedTech, jumpJetType: d.jumpJetType } : c,
  );
  return { ...d, omni: { ...d.omni, configurations } };
}

export function setOmni(d: MechDesign, on: boolean): MechDesign {
  if (on === !!d.omni) return d;
  if (!on) {
    // Keep the active configuration as an ordinary mech.
    return { ...d, omni: null, equipment: d.equipment.map(({ pod: _p, ...e }) => e) };
  }
  // Weapons, ammo and equipment become the Prime configuration; structure and
  // movement systems stay fixed.
  const equipment = d.equipment.map((e) => {
    const eq = getEquipment(e.equipmentId);
    const pod = !!eq && !eq.managed && !isFixedOnly(e.equipmentId);
    return pod ? { ...e, pod: true } : e;
  });
  return { ...d, equipment, omni: { configurations: [{ name: 'Prime', pod: [] }], active: 0 } };
}

export function switchConfiguration(d: MechDesign, index: number): MechDesign {
  if (!d.omni || index === d.omni.active || !d.omni.configurations[index]) return d;
  const s = stash(d);
  const incoming = s.omni!.configurations[index];
  return {
    ...s,
    actuators: incoming.actuators ?? s.actuators,
    mixedTech: incoming.mixedTech ?? s.mixedTech,
    jumpJetType: incoming.jumpJetType ?? s.jumpJetType,
    equipment: [...fixedItems(s), ...incoming.pod],
    omni: { ...s.omni!, active: index },
  };
}

function uniqueName(d: MechDesign, wanted: string): string {
  const names = new Set(d.omni?.configurations.map((c) => c.name));
  if (!names.has(wanted)) return wanted;
  let n = 2;
  while (names.has(`${wanted} ${n}`)) n++;
  return `${wanted} ${n}`;
}

/** Next unused letter-style name: A, B, C, … */
function nextLetter(d: MechDesign): string {
  const names = new Set(d.omni?.configurations.map((c) => c.name));
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!names.has(letter)) return letter;
  }
  return uniqueName(d, 'Config');
}

/** Add a configuration (empty, or a copy of the active one) and switch to it. */
export function addConfiguration(d: MechDesign, copyActive: boolean, name?: string): MechDesign {
  if (!d.omni) return d;
  const s = stash(d);
  const pod = copyActive ? podItems(d).map((e) => ({ ...e, uid: freshUid() })) : [];
  const configName = uniqueName(s, name?.trim() || nextLetter(s));
  const configurations = [...s.omni!.configurations, { name: configName, pod, actuators: d.actuators }];
  return switchConfiguration({ ...s, omni: { ...s.omni!, configurations } }, configurations.length - 1);
}

export function renameConfiguration(d: MechDesign, index: number, name: string): MechDesign {
  if (!d.omni || !name.trim()) return d;
  const configurations = d.omni.configurations.map((c, i) => (i === index ? { ...c, name: name.trim() } : c));
  return { ...d, omni: { ...d.omni, configurations } };
}

export function deleteConfiguration(d: MechDesign, index: number): MechDesign {
  if (!d.omni || d.omni.configurations.length < 2) return d;
  // Move off the configuration first so its pods are not left in design.equipment.
  const target = index === d.omni.active ? (index === 0 ? 1 : 0) : d.omni.active;
  const s = switchConfiguration(d, target);
  const configurations = s.omni!.configurations.filter((_, i) => i !== index);
  const active = configurations.findIndex((c) => c.name === s.omni!.configurations[target].name);
  return { ...s, omni: { configurations, active } };
}

export function setItemPod(d: MechDesign, uid: string, pod: boolean): MechDesign {
  return {
    ...d,
    equipment: d.equipment.map((e) => (e.uid === uid ? { ...e, pod: pod || undefined } : e)),
  };
}

/** The full design for each configuration (the active one is `d` itself). */
export function configurationDesigns(d: MechDesign): { name: string; design: MechDesign; active: boolean }[] {
  if (!d.omni) return [{ name: '', design: d, active: true }];
  const fixed = fixedItems(d);
  return d.omni.configurations.map((c, i) => ({
    name: c.name,
    active: i === d.omni!.active,
    design: i === d.omni!.active ? d : {
      ...d, actuators: c.actuators ?? d.actuators, mixedTech: c.mixedTech ?? d.mixedTech, jumpJetType: c.jumpJetType ?? d.jumpJetType,
      equipment: [...fixed, ...c.pod], omni: { ...d.omni!, active: i },
    },
  }));
}

export interface OmniWeights {
  /** Weight of the base chassis including fixed equipment and fixed heat sinks. */
  fixed: number;
  /** Tonnage left for pods. */
  podSpace: number;
  /** Pod tonnage used by the active configuration. */
  podUsed: number;
}

/**
 * Split the mech's weight into the fixed base and the active configuration's pods.
 * The 10 free heat sinks are counted against engine and fixed heat sinks first.
 */
export function omniWeights(d: MechDesign, totalWeight: number): OmniWeights {
  const fixedHS = d.engineHeatSinks + fixedItems(d).filter((e) => HEAT_SINK_IDS.includes(e.equipmentId)).length;
  const freeLeft = Math.max(0, freeHeatSinks(d.engineType) - fixedHS);
  let podHS = 0;
  let podUsed = 0;
  for (const item of podItems(d)) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    if (HEAT_SINK_IDS.includes(eq.id)) podHS++;
    else podUsed += itemWeight(eq, d);
    if (item.armored) podUsed += ARMORED_TONS_PER_SLOT * itemSlots(eq, d);
  }
  podUsed += Math.max(0, podHS - freeLeft);
  const fixed = totalWeight - podUsed;
  return { fixed, podSpace: d.tonnage - fixed, podUsed };
}
