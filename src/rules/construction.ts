import type { Location, MechDesign, MountedItem, WeightClass } from './types';
import { LOCATIONS, isQuad } from './types';
import {
  FREE_HEAT_SINKS, armorPointsPerTon, cockpitWeight, engineCenterSlots, engineHeatSinkCapacity,
  engineSideTorsoSlots, engineWeight, gyroSlots, gyroWeightFor, internalStructure, internalStructureWeight,
  STEALTH_LOCATIONS, jumpJetWeightFor, runMP,
  weightClass,
} from './tables';
import type { Equipment } from './equipment';
import { HEAT_SINK_IDS, JUMP_JET_IDS, equipmentName, getEquipment, itemSlots, itemWeight, shortEquipmentName } from './equipment';
import type { OmniWeights } from './omni';
import { omniWeights } from './omni';
import { armorTonnage, maxArmorByLocation, maxTotalArmor, totalArmorPoints } from './armor';

export { itemWeight, itemSlots };

export interface SlotEntry {
  label: string;
  kind: 'fixed' | 'item' | 'empty';
  uid?: string;
  /** True on the first slot an item occupies (multi-slot items span several). */
  first?: boolean;
  /** Full item name, when `label` is abbreviated. */
  fullName?: string;
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
  /** Land-Air 'Mech conversion equipment. */
  conversion: number;
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
  /** Running MP with MASC and/or a supercharger engaged, when fitted. */
  mascRunMP: number | null;
  /** Walking / running MP with Triple-Strength Myomer active (at 9+ heat). */
  tsmMP: { walk: number; run: number } | null;
  /** OmniMech fixed weight and pod space, for OmniMechs. */
  omni: OmniWeights | null;
  /** Land-Air 'Mech movement in its other modes. */
  lam: LamMovement | null;
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

/** Critical slots in a location; a quad's front legs have 6, like any leg. */
export function slotCount(design: Pick<MechDesign, 'config'>, loc: Location): number {
  return isQuad(design) && (loc === 'LA' || loc === 'RA') ? 6 : SLOT_COUNT[loc];
}

export interface LamMovement {
  /** AirMech mode (standard LAMs only): ground movement, then WiGE flight. */
  airMech: { walk: number; run: number; cruise: number; flank: number } | null;
  /** Fighter mode thrust. */
  fighter: { safe: number; max: number };
}

/** Conversion equipment weight: 10% of tonnage (15% bimodal), rounded up to a whole ton (IO p. 113). */
export function lamConversionWeight(d: Pick<MechDesign, 'tonnage' | 'lam'>): number {
  if (!d.lam) return 0;
  return Math.ceil(d.tonnage * (d.lam === 'bimodal' ? 0.15 : 0.1) - 1e-9);
}

export function lamMovement(d: Pick<MechDesign, 'lam' | 'walkMP'>, jumpMP: number): LamMovement | null {
  if (!d.lam) return null;
  const walk = Math.ceil(d.walkMP * 0.33);
  const cruise = jumpMP * 3;
  return {
    airMech: d.lam === 'standard' ? { walk, run: Math.ceil(walk * 1.5), cruise, flank: Math.ceil(cruise * 1.5) } : null,
    fighter: { safe: jumpMP, max: Math.ceil(jumpMP * 1.5) },
  };
}

/** Put a LAM system in the first open slot. */
function claim(slots: (string | null)[], label: string): (string | null)[] {
  const i = slots.indexOf(null);
  if (i >= 0) slots[i] = label;
  return slots;
}

const LEG_SLOTS = ['Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator', null, null];

const ENGINE_LABEL = {
  standard: 'Fusion Engine', xl: 'XL Fusion Engine', xxl: 'XXL Fusion Engine', light: 'Light Fusion Engine', compact: 'Compact Fusion Engine',
} as const;
const GYRO_LABEL = { standard: 'Gyro', xl: 'XL Gyro', 'heavy-duty': 'Heavy-Duty Gyro', compact: 'Compact Gyro' } as const;

/** Fixed components per location; null marks a slot open for equipment. */
export function fixedSlots(design: MechDesign, loc: Location): (string | null)[] {
  const base = baseFixedSlots(design, loc);
  // Stealth armor: two slots in each side torso, arm and leg.
  if (design.armorType === 'stealth' && (STEALTH_LOCATIONS as readonly string[]).includes(loc)) {
    claim(claim(base, 'Stealth'), 'Stealth');
  }
  if (!design.lam) return base;
  // LAM conversion systems take the first open slots: avionics in the head, landing gear in
  // the center torso, and landing gear + avionics in each side torso (as MegaMek places them).
  if (loc === 'HD') return claim(base, 'Avionics');
  if (loc === 'CT') return claim(base, 'Landing Gear');
  if (loc === 'LT' || loc === 'RT') return claim(claim(base, 'Landing Gear'), 'Avionics');
  return base;
}

function baseFixedSlots(design: MechDesign, loc: Location): (string | null)[] {
  switch (loc) {
    case 'HD':
      switch (design.cockpitType) {
        case 'small': return ['Life Support', 'Sensors', 'Small Cockpit', 'Sensors', null, null];
        case 'command-console': return ['Life Support', 'Sensors', 'Cockpit', 'Command Console', 'Sensors', 'Life Support'];
        // Torso-mounted cockpit: two sensor slots stay in the head (as MegaMek places them).
        case 'torso-mounted': return ['Sensors', 'Sensors', null, null, null, null];
        default: return ['Life Support', 'Sensors', 'Cockpit', null, 'Sensors', 'Life Support'];
      }
    case 'CT': {
      const e = ENGINE_LABEL[design.engineType];
      const g = GYRO_LABEL[design.gyroType];
      const gyro: string[] = Array(gyroSlots(design.gyroType)).fill(g);
      const engine: string[] = Array(engineCenterSlots(design.engineType)).fill(e);
      // The gyro sits between the two halves of a full-size engine.
      const fixed = [...engine.slice(0, 3), ...gyro, ...engine.slice(3)];
      // A torso-mounted cockpit and a sensor slot take the next open center-torso slots.
      if (design.cockpitType === 'torso-mounted') fixed.push('Cockpit', 'Sensors');
      return [...fixed, ...Array(Math.max(0, 12 - fixed.length)).fill(null)].slice(0, 12);
    }
    case 'LT':
    case 'RT': {
      const n = engineSideTorsoSlots(design.engineType, design.techBase);
      // A torso-mounted cockpit puts life support in the first slot of each side torso.
      const ls = design.cockpitType === 'torso-mounted' ? ['Life Support'] : [];
      const fixed = [...ls, ...Array(n).fill(ENGINE_LABEL[design.engineType])];
      return [...fixed, ...Array(Math.max(0, 12 - fixed.length)).fill(null)].slice(0, 12);
    }
    case 'LA':
    case 'RA': {
      if (isQuad(design)) return [...LEG_SLOTS];
      const a = design.actuators[loc];
      const fixed = ['Shoulder', 'Upper Arm Actuator'];
      if (a.lowerArm) fixed.push('Lower Arm Actuator');
      if (a.lowerArm && a.hand) fixed.push('Hand Actuator');
      return [...fixed, ...Array(12 - fixed.length).fill(null)];
    }
    case 'LL':
    case 'RL':
      return [...LEG_SLOTS];
  }
}

/** Slot label: the abbreviated item name, plus (R) for rear-facing. */
export function itemLabel(eq: Equipment, item: MountedItem, design: Pick<MechDesign, 'mixedTech'>): string {
  const name = shortEquipmentName(eq, design);
  return item.rear ? `${name} (R)` : name;
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
        slots[openIdx[cursor]] = {
          label: itemLabel(eq, item, design), fullName: equipmentName(eq, design), kind: 'item', uid: item.uid, first: s === 0,
        };
        cursor++;
      } else {
        overflow++;
      }
    }
  }
  return { location: loc, capacity: slotCount(design, loc), slots, free: openIdx.length - cursor, overflow };
}

export function computeMech(design: MechDesign): MechSummary {
  const { tonnage, walkMP } = design;
  const rating = tonnage * walkMP;
  const engineWt = engineWeight(design.engineType, rating);
  const quad = isQuad(design);
  const structure = internalStructure(tonnage, quad);

  const count = (pred: (id: string) => boolean) => design.equipment.filter((e) => pred(e.equipmentId)).length;
  const jumpMP = count((id) => JUMP_JET_IDS.includes(id));
  const externalHS = count((id) => HEAT_SINK_IDS.includes(id));
  const totalHS = design.engineHeatSinks + externalHS;
  const hasMasc = design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'masc');
  const hasSupercharger = design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'supercharger');

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
    conversion: lamConversionWeight(design),
    engine: engineWt ?? 0,
    gyro: gyroWeightFor(design.gyroType, rating),
    cockpit: cockpitWeight(design.cockpitType),
    heatSinks: Math.max(0, totalHS - FREE_HEAT_SINKS),
    jumpJets: jumpMP * jumpJetWeightFor(design.jumpJetType, tonnage),
    armor: armorTonnage(armorTotal, ppt),
    equipment: equipmentWeight,
    total: 0,
    free: 0,
  };
  weights.total =
    weights.structure + weights.conversion + weights.engine + weights.gyro + weights.cockpit +
    weights.heatSinks + weights.jumpJets + weights.armor + weights.equipment;
  weights.free = tonnage - weights.total;

  const slots = {} as Record<Location, LocationSlots>;
  for (const loc of LOCATIONS) slots[loc] = layoutLocation(design, loc);
  const xxl = design.engineType === 'xxl';
  // Hardened armor costs one running MP.
  const hardened = design.armorType === 'hardened' ? 1 : 0;

  return {
    rating,
    runMP: runMP(walkMP) - hardened,
    // MASC or a supercharger: run at twice walking MP; both together: 2.5 times.
    mascRunMP: hasMasc || hasSupercharger ? Math.ceil(walkMP * (hasMasc && hasSupercharger ? 2.5 : 2)) - hardened : null,
    tsmMP: design.myomer === 'tsm' ? { walk: walkMP + 1, run: runMP(walkMP + 1) - hardened } : null,
    omni: design.omni ? omniWeights(design, weights.total) : null,
    lam: lamMovement(design, jumpMP),
    jumpMP,
    weightClass: weightClass(tonnage),
    engineWeight: engineWt,
    structure,
    armorMax: maxArmorByLocation(tonnage, quad),
    armorTotal,
    armorMaxTotal: maxTotalArmor(tonnage, quad),
    armorPointsPerTon: ppt,
    heatSinks: {
      total: totalHS,
      inEngine: design.engineHeatSinks,
      external: externalHS,
      engineCapacity: engineHeatSinkCapacity(rating),
      dissipation: totalHS * (design.heatSinkType === 'double' ? 2 : 1),
    },
    heat: {
      weapons: weaponHeat,
      // XXL engines run hot: 6 heat running, jumping 2 per MP (minimum 6). Stealth armor adds 10 when engaged.
      running: xxl ? 6 : 2,
      jumping: jumpMP > 0 ? (xxl ? Math.max(6, jumpMP * 2) : Math.max(3, jumpMP)) : 0,
    },
    weights,
    slots,
    unallocated: design.equipment.filter((e) => e.location === null),
  };
}
