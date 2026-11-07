import type { Location, MechDesign, MountedItem, WeightClass } from './types';
import { LOCATIONS } from './types';
import {
  COCKPIT_WEIGHT, FREE_HEAT_SINKS, engineHeatSinkCapacity, gyroWeight, internalStructure,
  jumpJetWeight, runMP, standardFusionEngineWeight, structureWeight, weightClass,
} from './tables';
import type { Equipment } from './equipment';
import { HEAT_SINK_ID, JUMP_JET_ID, getEquipment } from './equipment';
import { armorTonnage, maxArmorByLocation, maxTotalArmor, totalArmorPoints } from './armor';

export interface SlotEntry {
  label: string;
  kind: 'fixed' | 'item' | 'empty';
  uid?: string;
  /** True on the first slot an item occupies (multi-slot items span several). */
  first?: boolean;
}

export interface LocationSlots {
  location: Location;
  capacity: number;
  slots: SlotEntry[];
  free: number;
  /** Slots needed beyond capacity. */
  overflow: number;
}

export interface WeightBreakdown {
  structure: number;
  engine: number;
  gyro: number;
  cockpit: number;
  heatSinks: number;
  jumpJets: number;
  armor: number;
  equipment: number;
  total: number;
  free: number;
}

export interface MechSummary {
  rating: number;
  runMP: number;
  jumpMP: number;
  weightClass: WeightClass | null;
  engineWeight: number | null;
  structure: Record<Location, number> | null;
  armorMax: Record<Location, number>;
  armorTotal: number;
  armorMaxTotal: number;
  heatSinks: {
    total: number;
    inEngine: number;
    external: number;
    engineCapacity: number;
    dissipation: number;
  };
  heat: { weapons: number; running: number; jumping: number };
  weights: WeightBreakdown;
  slots: Record<Location, LocationSlots>;
  unallocated: MountedItem[];
}

const SLOT_COUNT: Record<Location, number> = {
  HD: 6, CT: 12, LT: 12, RT: 12, LA: 12, RA: 12, LL: 6, RL: 6,
};

/** Fixed components per location; null marks a slot open for equipment. */
export function fixedSlots(design: MechDesign, loc: Location): (string | null)[] {
  switch (loc) {
    case 'HD':
      return ['Life Support', 'Sensors', 'Cockpit', null, 'Sensors', 'Life Support'];
    case 'CT':
      return [
        'Fusion Engine', 'Fusion Engine', 'Fusion Engine',
        'Gyro', 'Gyro', 'Gyro', 'Gyro',
        'Fusion Engine', 'Fusion Engine', 'Fusion Engine',
        null, null,
      ];
    case 'LT':
    case 'RT':
      return Array(12).fill(null);
    case 'LA':
    case 'RA': {
      const a = design.actuators[loc];
      const fixed = ['Shoulder', 'Upper Arm Actuator'];
      if (a.lowerArm) fixed.push('Lower Arm Actuator');
      if (a.lowerArm && a.hand) fixed.push('Hand Actuator');
      return [...fixed, ...Array(12 - fixed.length).fill(null)];
    }
    case 'LL':
    case 'RL':
      return ['Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator', null, null];
  }
}

export function itemWeight(eq: Equipment, tonnage: number): number {
  return eq.variableWeight === 'jumpJet' ? jumpJetWeight(tonnage) : eq.tons;
}

export function itemLabel(eq: Equipment, item: MountedItem): string {
  return item.rear ? `${eq.name} (R)` : eq.name;
}

function layoutLocation(design: MechDesign, loc: Location): LocationSlots {
  const fixed = fixedSlots(design, loc);
  const slots: SlotEntry[] = fixed.map((f) =>
    f === null ? { label: 'Roll Again', kind: 'empty' } : { label: f, kind: 'fixed' },
  );
  const openIdx = fixed.flatMap((f, i) => (f === null ? [i] : []));
  let cursor = 0;
  let overflow = 0;
  for (const item of design.equipment) {
    if (item.location !== loc) continue;
    const eq = getEquipment(item.equipmentId);
    if (!eq) continue;
    for (let s = 0; s < eq.slots; s++) {
      if (cursor < openIdx.length) {
        slots[openIdx[cursor]] = { label: itemLabel(eq, item), kind: 'item', uid: item.uid, first: s === 0 };
        cursor++;
      } else {
        overflow++;
      }
    }
  }
  return { location: loc, capacity: SLOT_COUNT[loc], slots, free: openIdx.length - cursor, overflow };
}

export function computeMech(design: MechDesign): MechSummary {
  const { tonnage, walkMP } = design;
  const rating = tonnage * walkMP;
  const engineWeight = standardFusionEngineWeight(rating);
  const structure = internalStructure(tonnage);

  const count = (id: string) => design.equipment.filter((e) => e.equipmentId === id).length;
  const jumpMP = count(JUMP_JET_ID);
  const externalHS = count(HEAT_SINK_ID);
  const totalHS = design.engineHeatSinks + externalHS;

  let equipmentWeight = 0;
  let weaponHeat = 0;
  for (const item of design.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq || eq.managed) continue;
    equipmentWeight += eq.tons;
    if (eq.isWeapon) weaponHeat += eq.heat;
  }

  const armorTotal = totalArmorPoints(design.armor);
  const weights: WeightBreakdown = {
    structure: structureWeight(tonnage),
    engine: engineWeight ?? 0,
    gyro: gyroWeight(rating),
    cockpit: COCKPIT_WEIGHT,
    heatSinks: Math.max(0, totalHS - FREE_HEAT_SINKS),
    jumpJets: jumpMP * jumpJetWeight(tonnage),
    armor: armorTonnage(armorTotal),
    equipment: equipmentWeight,
    total: 0,
    free: 0,
  };
  weights.total =
    weights.structure + weights.engine + weights.gyro + weights.cockpit +
    weights.heatSinks + weights.jumpJets + weights.armor + weights.equipment;
  weights.free = tonnage - weights.total;

  const slots = {} as Record<Location, LocationSlots>;
  for (const loc of LOCATIONS) slots[loc] = layoutLocation(design, loc);

  return {
    rating,
    runMP: runMP(walkMP),
    jumpMP,
    weightClass: weightClass(tonnage),
    engineWeight,
    structure,
    armorMax: maxArmorByLocation(tonnage),
    armorTotal,
    armorMaxTotal: maxTotalArmor(tonnage),
    heatSinks: {
      total: totalHS,
      inEngine: design.engineHeatSinks,
      external: externalHS,
      engineCapacity: engineHeatSinkCapacity(rating),
      dissipation: totalHS,
    },
    heat: { weapons: weaponHeat, running: 2, jumping: jumpMP > 0 ? Math.max(3, jumpMP) : 0 },
    weights,
    slots,
    unallocated: design.equipment.filter((e) => e.location === null),
  };
}
