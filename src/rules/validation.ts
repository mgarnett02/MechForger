import type { MechDesign } from './types';
import { ARM_LOCATIONS, ARMOR_FACINGS, FACING_NAMES, LOCATIONS, LOCATION_NAMES } from './types';
import {
  ARMOR_POINTS_PER_TON, FREE_HEAT_SINKS, MAX_ENGINE_RATING, MIN_ENGINE_RATING, TONNAGES,
} from './tables';
import { allowedLocations, canRearMount, getEquipment } from './equipment';
import { locationArmor } from './armor';
import type { MechSummary } from './construction';
import { computeMech } from './construction';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  message: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function validate(design: MechDesign, summary: MechSummary = computeMech(design)): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });
  const info = (message: string) => issues.push({ severity: 'info', message });

  // Chassis
  if (!TONNAGES.includes(design.tonnage)) {
    error(`Tonnage must be 20–100 tons in 5-ton steps (got ${design.tonnage}).`);
  }
  if (!Number.isInteger(design.walkMP) || design.walkMP < 1) {
    error('Walking MP must be a whole number of at least 1.');
  }
  if (summary.rating > MAX_ENGINE_RATING) {
    error(`Engine rating ${summary.rating} exceeds the maximum of ${MAX_ENGINE_RATING}.`);
  } else if (summary.rating < MIN_ENGINE_RATING) {
    error(`Engine rating ${summary.rating} is below the minimum of ${MIN_ENGINE_RATING}.`);
  } else if (summary.engineWeight === null) {
    error(`No standard fusion engine exists with rating ${summary.rating}.`);
  }

  // Weight
  if (summary.weights.free < 0) {
    error(`Overweight by ${fmt(-summary.weights.free)} tons.`);
  } else if (summary.weights.free > 0) {
    warn(`${fmt(summary.weights.free)} tons unused.`);
  }

  // Armor
  for (const f of ARMOR_FACINGS) {
    const v = design.armor[f];
    if (!Number.isInteger(v) || v < 0) error(`${FACING_NAMES[f]} armor must be a non-negative whole number.`);
  }
  for (const loc of LOCATIONS) {
    const pts = locationArmor(design.armor, loc);
    const max = summary.armorMax[loc];
    if (pts > max) {
      error(`${LOCATION_NAMES[loc]} has ${pts} armor points; the maximum is ${max}.`);
    }
  }
  if (summary.armorTotal === 0) {
    warn('No armor allocated.');
  } else {
    const paidFor = summary.weights.armor * ARMOR_POINTS_PER_TON;
    const unallocated = Math.min(paidFor, summary.armorMaxTotal) - summary.armorTotal;
    if (unallocated > 0) {
      warn(
        `${unallocated} armor point(s) paid for but not allocated ` +
          `(armor is bought in half-ton lots of ${ARMOR_POINTS_PER_TON / 2} points).`,
      );
    }
  }

  // Heat sinks
  const hs = summary.heatSinks;
  if (design.engineHeatSinks < 0 || !Number.isInteger(design.engineHeatSinks)) {
    error('Engine heat sink count must be a non-negative whole number.');
  }
  if (design.engineHeatSinks > hs.engineCapacity) {
    error(`The engine can hold only ${hs.engineCapacity} heat sinks (has ${design.engineHeatSinks}).`);
  }
  if (hs.total < FREE_HEAT_SINKS) {
    error(`A mech must carry at least ${FREE_HEAT_SINKS} heat sinks (has ${hs.total}).`);
  }

  // Jump jets
  if (summary.jumpMP > design.walkMP) {
    error(`Jumping MP (${summary.jumpMP}) cannot exceed walking MP (${design.walkMP}).`);
  }

  // Actuators
  for (const arm of ARM_LOCATIONS) {
    const a = design.actuators[arm];
    if (a.hand && !a.lowerArm) {
      error(`${LOCATION_NAMES[arm]}: a hand actuator requires a lower arm actuator.`);
    }
  }

  // Equipment placement
  for (const item of design.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) {
      error(`Unknown equipment "${item.equipmentId}".`);
      continue;
    }
    if (item.location !== null && !allowedLocations(eq).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${LOCATION_NAMES[item.location]}.`);
    }
    if (item.rear && !canRearMount(eq, item.location)) {
      error(`${eq.name} cannot be rear-mounted there; only torso weapons can face rear.`);
    }
  }
  if (summary.unallocated.length > 0) {
    const names = summary.unallocated.map((i) => getEquipment(i.equipmentId)?.name ?? i.equipmentId);
    error(`${names.length} item(s) not allocated to a location: ${summarizeNames(names)}.`);
  }
  for (const loc of LOCATIONS) {
    const s = summary.slots[loc];
    if (s.overflow > 0) {
      error(`${LOCATION_NAMES[loc]} needs ${s.overflow} more critical slot(s) than it has.`);
    }
  }

  // Ammo sanity
  const weaponIds = new Set(design.equipment.map((e) => e.equipmentId));
  for (const id of weaponIds) {
    const eq = getEquipment(id);
    if (eq?.ammoFor && !weaponIds.has(eq.ammoFor)) {
      warn(`${eq.name} is carried but no ${getEquipment(eq.ammoFor)?.name} is mounted.`);
    }
    if (eq?.ammoPerTon && !weaponIds.has(`ammo-${id}`)) {
      warn(`${eq.name} has no ammunition.`);
    }
  }

  // Heat (informational)
  const maxHeat = summary.heat.weapons + Math.max(summary.heat.running, summary.heat.jumping);
  if (maxHeat > hs.dissipation) {
    info(
      `Firing everything while ${summary.heat.jumping > summary.heat.running ? 'jumping' : 'running'} ` +
        `builds ${maxHeat} heat against ${hs.dissipation} dissipation (+${maxHeat - hs.dissipation}/turn).`,
    );
  }

  return issues;
}

function summarizeNames(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ');
}

export type DesignStatus = 'illegal' | 'warnings' | 'legal';

/** Traffic-light status: errors make a design illegal; warnings mean legal but incomplete. */
export function designStatus(issues: Issue[]): DesignStatus {
  if (issues.some((i) => i.severity === 'error')) return 'illegal';
  if (issues.some((i) => i.severity === 'warning')) return 'warnings';
  return 'legal';
}

export function isValid(issues: Issue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}
