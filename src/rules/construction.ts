import type { Location, MechDesign, MountedItem, WeightClass } from './types';
import { LOCATIONS } from './types';
import {
  COCKPIT_WEIGHT, FREE_HEAT_SINKS, armorPointsPerTon, engineHeatSinkCapacity, engineSideTorsoSlots,
  engineWeight, gyroWeight, internalStructure, internalStructureWeight, jumpJetWeight, runMP,
  weightClass,
} from './tables';
import type { Equipment } from './equipment';
import { HEAT_SINK_IDS, JUMP_JET_ID, getEquipment, itemSlots, itemWeight } from './equipment';
import { armorTonnage, maxArmorByLocation, maxTotalArmor, totalArmorPoints } from './armor';

export { itemWeight, itemSlots };

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
  /** Running MP with MASC engaged, when MASC is fitted. */
  mascRunMP: number | null;
  jumpMP: number;
  weightClass: WeightClass | null;
  engineWeight: number | null;
  structure: Record<Location, number> | null;
  armorMax: Record<Location, number>;
  armorTotal: number;
  armorMaxTotal: number;
  armorPointsPerTon: number;
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
    case 'CT': {
      const e = design.engineType === 'xl' ? 'XL Fusion Engine' : 'Fusion Engine';
      return [e, e, e, 'Gyro', 'Gyro', 'Gyro', 'Gyro', e, e, e, null, null];
    }
    case 'LT':
    case 'RT': {
      const n = engineSideTorsoSlots(design.engineType, design.techBase);
      return [...Array(n).fill('XL Fusion Engine'), ...Array(12 - n).fill(null)];
    }
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
    const n = itemSlots(eq, design);
    for (let s = 0; s < n; s++) {
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
  const engineWt = engineWeight(design.engineType, rating);
  const structure = internalStructure(tonnage);

  const count = (pred: (id: string) => boolean) => design.equipment.filter((e) => pred(e.equipmentId)).length;
  const jumpMP = count((id) => id === JUMP_JET_ID);
  const externalHS = count((id) => HEAT_SINK_IDS.includes(id));
  const totalHS = design.engineHeatSinks + externalHS;
  const hasMasc = design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'masc');

  let equipmentWeight = 0;
  let weaponHeat = 0;
  for (const item of design.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq || eq.managed) continue;
    equipmentWeight += itemWeight(eq, design);
    if (eq.isWeapon) weaponHeat += eq.heat;
  }

  const ppt = armorPointsPerTon(design.armorType, design.techBase);
  const armorTotal = totalArmorPoints(design.armor);
  const weights: WeightBreakdown = {
    structure: internalStructureWeight(design.structureType, tonnage),
    engine: engineWt ?? 0,
    gyro: gyroWeight(rating),
    cockpit: COCKPIT_WEIGHT,
    heatSinks: Math.max(0, totalHS - FREE_HEAT_SINKS),
    jumpJets: jumpMP * jumpJetWeight(tonnage),
    armor: armorTonnage(armorTotal, ppt),
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
    mascRunMP: hasMasc ? walkMP * 2 : null,
    jumpMP,
    weightClass: weightClass(tonnage),
    engineWeight: engineWt,
    structure,
    armorMax: maxArmorByLocation(tonnage),
    armorTotal,
    armorMaxTotal: maxTotalArmor(tonnage),
    armorPointsPerTon: ppt,
    heatSinks: {
      total: totalHS,
      inEngine: design.engineHeatSinks,
      external: externalHS,
      engineCapacity: engineHeatSinkCapacity(rating),
      dissipation: totalHS * (design.heatSinkType === 'double' ? 2 : 1),
    },
    heat: { weapons: weaponHeat, running: 2, jumping: jumpMP > 0 ? Math.max(3, jumpMP) : 0 },
    weights,
    slots,
    unallocated: design.equipment.filter((e) => e.location === null),
  };
}
