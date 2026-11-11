import type { MechDesign } from './types';
import { ARM_LOCATIONS, ARMOR_FACINGS, LAM_TYPE_NAMES, LOCATIONS, facingName, isQuad, legLocations, locationName } from './types';
import type { MeleeKind } from './equipment';
import { HAND_WEAPONS, NEEDS_HAND } from './melee';
import {
  FREE_HEAT_SINKS, MAX_ENGINE_RATING, MIN_ENGINE_RATING, TONNAGES,
} from './tables';
import {
  ENDO_STEEL_ID, FERRO_FIBROUS_ID, HEAT_SINK_IDS, TSM_ID, allowedLocations, canRearMount, getEquipment,
  JUMP_JET_IDS, heatSinkIdFor, isDirectFire, isEquipmentAvailable, jumpJetIdFor, usesAmmo,
} from './equipment';
import { configurationDesigns, isFixedOnly } from './omni';
import { getEra, isAvailableIn } from './eras';
import { TECH_BASE_NAMES } from './types';
import type { ComponentOption } from './tables';
import {
  ARMOR_OPTIONS, COCKPIT_OPTIONS, ENGINE_OPTIONS, GYRO_OPTIONS, HEAT_SINK_OPTIONS, JUMP_JET_OPTIONS,
  MYOMER_OPTIONS, STRUCTURE_OPTIONS, ARMOR_NAMES, STRUCTURE_NAMES, armorSlots, componentEraOk, componentTechOk, structureSlots,
} from './tables';
import { armorPointsForTons } from './armor';
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
  const issues = validateConfiguration(design, summary);
  // OmniMechs: every configuration must be legal, not just the one on screen.
  if (design.omni) {
    for (const c of configurationDesigns(design)) {
      if (c.active) continue;
      const errs = validateConfiguration(c.design).filter((i) => i.severity === 'error');
      if (errs.length) {
        issues.push({
          severity: 'error',
          message: `Configuration ${c.name}: ${errs.length} error(s), e.g. ${errs[0].message}`,
        });
      }
    }
  }
  return issues;
}

function validateConfiguration(design: MechDesign, summary: MechSummary = computeMech(design)): Issue[] {
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

  // Era / tech base
  const era = getEra(design.era);
  if (!era) {
    error(`Unknown era "${design.era}".`);
  } else {
    if (!era.techBases.includes(design.techBase)) {
      error(`${TECH_BASE_NAMES[design.techBase]} designs cannot be built in the ${era.name} era.`);
    }
    const chosen: ComponentOption[] = [
      STRUCTURE_OPTIONS[design.structureType],
      ENGINE_OPTIONS[design.engineType],
      GYRO_OPTIONS[design.gyroType],
      COCKPIT_OPTIONS[design.cockpitType],
      HEAT_SINK_OPTIONS[design.heatSinkType],
      ARMOR_OPTIONS[design.armorType],
      MYOMER_OPTIONS[design.myomer],
      JUMP_JET_OPTIONS[design.jumpJetType],
    ];
    for (const o of chosen) {
      if (!componentEraOk(o, design.era, design.techBase)) {
        error(`${o.label} cannot be used in the ${era.name} era.`);
      } else if (!componentTechOk(o, design.techBase, design.mixedTech)) {
        error(`${o.label}: ${TECH_BASE_NAMES[o.techBase as 'IS' | 'Clan']} technology only (needs mixed tech on a ${TECH_BASE_NAMES[design.techBase]} design).`);
      }
    }
    const extras: [boolean, string][] = [
      [design.mixedTech, 'Mixed tech designs'],
      [!!design.omni, 'OmniMechs'],
    ];
    for (const [used, name] of extras) {
      if (used && !isAvailableIn('3050', design.era)) error(`${name} cannot be used in the ${era.name} era.`);
    }
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
    if (!Number.isInteger(v) || v < 0) error(`${facingName(design, f)} armor must be a non-negative whole number.`);
  }
  for (const loc of LOCATIONS) {
    const pts = locationArmor(design.armor, loc);
    const max = summary.armorMax[loc];
    if (pts > max) {
      error(`${locationName(design, loc)} has ${pts} armor points; the maximum is ${max}.`);
    }
  }
  if (summary.armorTotal === 0) {
    warn('No armor allocated.');
  } else {
    const paidFor = armorPointsForTons(summary.weights.armor, summary.armorPointsPerTon);
    const unallocated = Math.min(paidFor, summary.armorMaxTotal) - summary.armorTotal;
    if (unallocated > 0) {
      warn(
        `${unallocated} armor point(s) paid for but not allocated ` +
          `(armor is bought in half-ton lots).`,
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
  const hsId = heatSinkIdFor(design);
  const wrongHS = design.equipment.filter((e) => HEAT_SINK_IDS.includes(e.equipmentId) && e.equipmentId !== hsId);
  if (wrongHS.length) {
    error(`Single and double heat sinks cannot be mixed (${wrongHS.length} heat sink(s) do not match the chosen type).`);
  }
  if (hs.total < FREE_HEAT_SINKS) {
    error(`A mech must carry at least ${FREE_HEAT_SINKS} heat sinks (has ${hs.total}).`);
  }

  // Jump jets
  if (design.jumpJetType === 'improved') {
    if (summary.jumpMP > summary.runMP) {
      error(`Jumping MP (${summary.jumpMP}) cannot exceed running MP (${summary.runMP}) with improved jump jets.`);
    }
  } else if (summary.jumpMP > design.walkMP) {
    error(`Jumping MP (${summary.jumpMP}) cannot exceed walking MP (${design.walkMP}).`);
  }
  const jjId = jumpJetIdFor(design);
  if (design.equipment.some((e) => JUMP_JET_IDS.includes(e.equipmentId) && e.equipmentId !== jjId)) {
    error('Standard and improved jump jets cannot be mixed.');
  }

  // Land-Air 'Mechs (Interstellar Operations; checks as in MegaMek's TestMek)
  if (design.lam) {
    const lamName = `${LAM_TYPE_NAMES[design.lam]} LAM`;
    if (design.tonnage > 55) error(`LAMs cannot weigh more than 55 tons (got ${design.tonnage}).`);
    if (design.techBase !== 'IS') error('LAMs are Inner Sphere technology; switch the tech base to Inner Sphere.');
    if (isQuad(design)) error('Only biped \'Mechs can be LAMs.');
    if (design.omni) error('LAMs cannot be built as OmniMechs.');
    if (design.engineType !== 'standard' && design.engineType !== 'compact') {
      error(`${lamName}s may only use standard or compact fusion engines.`);
    }
    if (design.gyroType === 'xl') error('LAMs cannot use an XL gyro.');
    if (design.structureType !== 'standard') error('LAMs cannot use Endo Steel (or any structure that takes slots).');
    if (design.armorType !== 'standard') error('LAMs cannot use ferro-fibrous armor (or any armor that takes slots).');
    if (summary.jumpMP < 3) error(`LAMs need at least 3 jumping MP (fighter thrust comes from the jump jets); has ${summary.jumpMP}.`);
    for (const arm of ARM_LOCATIONS) {
      if (!design.actuators[arm].lowerArm) error(`${locationName(design, arm)}: LAMs need upper and lower arm actuators in both arms.`);
    }
    const banned = new Set<string>();
    for (const item of design.equipment) {
      const eq = getEquipment(item.equipmentId);
      if (eq && (eq.melee || eq.id === 'heavy-gauss-rifle')) banned.add(eq.name);
    }
    const bays = design.equipment.filter((e) => e.equipmentId === 'bomb-bay').length;
    if (bays > 20) error(`A LAM can carry at most 20 bomb bays (has ${bays}).`);
    for (const name of banned) error(`LAMs cannot mount a ${name}${/Gauss/.test(name) ? '' : ' (no physical weapons)'}.`);
  }

  // Actuators
  for (const arm of isQuad(design) ? [] : ARM_LOCATIONS) {
    const a = design.actuators[arm];
    if (a.hand && !a.lowerArm) {
      error(`${locationName(design, arm)}: a hand actuator requires a lower arm actuator.`);
    }
  }

  // Stealth armor works through an ECM suite.
  if (design.armorType === 'stealth' && !design.equipment.some((e) => /(^|-)ecm$/.test(e.equipmentId) && e.location)) {
    error('Stealth armor needs an ECM suite.');
  }

  // Endo Steel / Ferro-Fibrous slot placeholders
  const fillerCheck: [string, number, string][] = [
    [ENDO_STEEL_ID, structureSlots(design.structureType, design.techBase), STRUCTURE_NAMES[design.structureType]],
    [FERRO_FIBROUS_ID, armorSlots(design.armorType, design.techBase), `${ARMOR_NAMES[design.armorType]} armor`],
    [TSM_ID, design.myomer === 'tsm' ? 6 : 0, 'Triple-Strength Myomer'],
  ];
  for (const [id, required, name] of fillerCheck) {
    const have = design.equipment.filter((e) => e.equipmentId === id).length;
    if (have !== required) error(`${name} needs ${required} critical slots (has ${have}).`);
  }

  // Equipment placement
  const unavailable = new Set<string>();
  for (const item of design.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq) {
      error(`Unknown equipment "${item.equipmentId}".`);
      continue;
    }
    if (eq.category === 'Utility' && !unavailable.has(`u-${eq.id}`)) {
      unavailable.add(`u-${eq.id}`);
      error(`${eq.name} is vehicle equipment and cannot be mounted on a BattleMech.`);
    }
    if (item.pod && (!design.omni || isFixedOnly(eq.id))) {
      error(design.omni ? `${eq.name} cannot be pod-mounted; it must be fixed equipment.` : `${eq.name} is marked as a pod but this is not an OmniMech.`);
    }
    if (!eq.managed && !isEquipmentAvailable(eq, design.era, design.techBase, design.mixedTech) && !unavailable.has(eq.id)) {
      unavailable.add(eq.id);
      const eraName = era?.name ?? design.era;
      if (eq.techBase !== 'Both' && eq.techBase !== design.techBase) {
        error(`${TECH_BASE_NAMES[eq.techBase]} ${eq.name} is not available to ${TECH_BASE_NAMES[design.techBase]} designs.`);
      } else {
        error(`${eq.name} is not available in the ${eraName} era.`);
      }
    }
    if (eq.capitalClass) error(`${eq.name} is a large-craft weapon and cannot be mounted on a BattleMech.`);
    if (eq.lamOnly && !design.lam) error(`${eq.name} can only be fitted to a Land-Air 'Mech.`);
    if (item.location !== null && !allowedLocations(eq, design).includes(item.location)) {
      error(`${eq.name} cannot be mounted in the ${locationName(design, item.location)}.`);
    }
    if (item.rear && !canRearMount(eq, item.location, design)) {
      error(`${eq.name} cannot be rear-mounted there; only torso weapons${isQuad(design) ? ' and leg weapons' : ''} can face rear.`);
    }
  }
  if (design.equipment.filter((e) => getEquipment(e.equipmentId)?.variableWeight === 'masc').length > 1) {
    error('Only one MASC system may be installed.');
  }
  const hasMasc = design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'masc');
  if (hasMasc && design.myomer === 'tsm') {
    error('MASC and Triple-Strength Myomer cannot be installed together.');
  }

  // Melee weapons: actuators, one hand weapon per arm, talons in every leg
  for (const loc of ARM_LOCATIONS) {
    if (isQuad(design)) break;
    const kinds = design.equipment
      .filter((e) => e.location === loc)
      .map((e) => getEquipment(e.equipmentId)?.melee)
      .filter((k): k is MeleeKind => !!k && HAND_WEAPONS.includes(k));
    const where = locationName(design, loc);
    if (kinds.length > 1) error(`${where}: only one melee weapon (hatchet, sword, mace, claw, blade or whip) per arm.`);
    const act = design.actuators[loc];
    for (const k of new Set(kinds)) {
      const name = getEquipment(k)!.name;
      if (NEEDS_HAND.includes(k) && !(act.lowerArm && act.hand)) {
        error(`${where}: a ${name} needs lower arm and hand actuators.`);
      }
      if (k === 'claw' && !act.lowerArm) error(`${where}: a claw needs a lower arm actuator.`);
      if (k === 'claw' && act.hand) error(`${where}: a claw replaces the hand actuator; remove the hand.`);
    }
  }
  const talons = design.equipment.filter((e) => e.equipmentId === 'talons');
  if (talons.length) {
    const legs = legLocations(design);
    const placed = new Set(talons.map((t) => t.location));
    if (talons.length !== legs.length || legs.some((l) => !placed.has(l))) {
      error(`Talons are fitted to every leg: add one to each of the ${legs.length} legs.`);
    }
  }

  // Targeting computer
  const tcs = design.equipment.filter((e) => getEquipment(e.equipmentId)?.variableWeight === 'targetingComputer');
  if (tcs.length > 1) error('Only one targeting computer may be installed.');
  if (tcs.length && !design.equipment.some((e) => {
    const w = getEquipment(e.equipmentId);
    return w && isDirectFire(w);
  })) {
    warn('The targeting computer has no direct-fire energy or ballistic weapons to aim.');
  }

  // Artemis IV: one fire-control system per standard LRM/SRM launcher, in the same location.
  for (const loc of LOCATIONS) {
    const here = design.equipment.filter((e) => e.location === loc).map((e) => getEquipment(e.equipmentId));
    const fcs = here.filter((e) => e?.id === 'artemis-iv' || e?.id === 'clan-artemis-iv').length;
    const launchers = here.filter((e) => e?.artemisCapable).length;
    if (fcs > launchers) {
      error(
        `${locationName(design, loc)} has ${fcs} Artemis IV FCS but only ${launchers} LRM/SRM launcher(s); ` +
          'each Artemis IV must share a location with its launcher.',
      );
    }
  }
  if (summary.unallocated.length > 0) {
    const names = summary.unallocated.map((i) => getEquipment(i.equipmentId)?.name ?? i.equipmentId);
    error(`${names.length} item(s) not allocated to a location: ${summarizeNames(names)}.`);
  }
  for (const loc of LOCATIONS) {
    const s = summary.slots[loc];
    if (s.overflow > 0) {
      error(`${locationName(design, loc)} needs ${s.overflow} more critical slot(s) than it has.`);
    }
  }

  // Ammo sanity
  const weaponIds = new Set(design.equipment.map((e) => e.equipmentId));
  const fedWeapons = new Set([...weaponIds].map((id) => getEquipment(id)?.ammoFor).filter(Boolean));
  const hasArtemis = weaponIds.has('artemis-iv') || weaponIds.has('clan-artemis-iv');
  for (const id of weaponIds) {
    const eq = getEquipment(id);
    if (eq?.ammoFor && !weaponIds.has(eq.ammoFor)) {
      warn(`${eq.name} is carried but no ${getEquipment(eq.ammoFor)?.name} is mounted.`);
    }
    if (eq?.artemisAmmo && !hasArtemis) {
      warn(`${eq.name} needs an Artemis IV FCS to give any benefit.`);
    }
    if (eq && usesAmmo(eq) && !fedWeapons.has(id)) {
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
