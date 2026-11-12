import type { MechDesign } from './types';
import { ARM_LOCATIONS, ARMOR_FACINGS, LAM_TYPE_NAMES, LOCATIONS, facingName, isQuad, legLocations, locationName } from './types';
import type { MeleeKind } from './equipment';
import { HAND_WEAPONS, NEEDS_HAND } from './melee';
import {
  freeHeatSinks, engineCenterSlots, engineSideTorsoSlots, gyroSlots, MAX_ENGINE_RATING, MIN_ENGINE_RATING, TONNAGES,
} from './tables';
import {
  ENDO_STEEL_ID, ENV_SEAL_ID, canArmor, spreadLocations, FERRO_FIBROUS_ID, HEAT_SINK_IDS, TSM_ID, allowedLocations, canRearMount, getEquipment, isArtemisVCapable, isPPC,
  JUMP_JET_IDS, heatSinkIdFor, isDirectFire, isEquipmentAvailable, jumpJetIdFor, usesAmmo,
} from './equipment';
import { configurationDesigns, isFixedOnly } from './omni';
import { getEra, isAvailableIn } from './eras';
import { SPLIT_ADJACENT, TECH_BASE_NAMES, isIndustrial, techOf } from './types';
import type { TechBase } from './types';
import { canSplit, tsmSlots } from './edit';
import type { ComponentOption } from './tables';
import {
  ARMOR_OPTIONS, COCKPIT_OPTIONS, ENGINE_OPTIONS, GYRO_OPTIONS, HEAT_SINK_OPTIONS, JUMP_JET_OPTIONS,
  MYOMER_OPTIONS, STRUCTURE_OPTIONS, ARMOR_NAMES, STRUCTURE_NAMES, armorSlots, componentEraOk, componentTechOk, structureSlots,
} from './tables';
import { armorPointsForTons } from './armor';
import { locationArmor } from './armor';
import type { MechSummary } from './construction';
import { armoredSystemSlots, computeMech, itemSlots } from './construction';

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
    error(`Tonnage must be 10–100 tons in 5-ton steps (got ${design.tonnage}).`);
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
    // Each component is checked against its own tech base (mixed-tech designs may use Clan parts on an IS chassis).
    const chosen: [ComponentOption, TechBase][] = [
      [STRUCTURE_OPTIONS[design.structureType], techOf(design, 'structure')],
      [ENGINE_OPTIONS[design.engineType], techOf(design, 'engine')],
      [GYRO_OPTIONS[design.gyroType], design.techBase],
      [COCKPIT_OPTIONS[design.cockpitType], design.techBase],
      [HEAT_SINK_OPTIONS[design.heatSinkType], techOf(design, 'heatSinks')],
      [ARMOR_OPTIONS[design.armorType], techOf(design, 'armor')],
      [MYOMER_OPTIONS[design.myomer], design.techBase],
      [JUMP_JET_OPTIONS[design.jumpJetType], design.techBase],
    ];
    for (const [o, partTech] of chosen) {
      if (!componentEraOk(o, design.era, partTech)) {
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
  // Fusion engines bring 10 heat sinks; fission 5, fuel cells 1, internal combustion none.
  const minHS = freeHeatSinks(design.engineType);
  if (hs.total < minHS) {
    error(`A mech with this engine must carry at least ${minHS} heat sinks (has ${hs.total}).`);
  }

  // IndustrialMechs (TechManual pp. 47–70, as MegaMek checks them)
  const industrial = isIndustrial(design);
  if (industrial) {
    if (!['standard', 'ice', 'fuel-cell', 'fission'].includes(design.engineType)) {
      error('IndustrialMechs can only use standard fusion, fission, fuel cell or internal combustion engines.');
    }
    if (design.gyroType !== 'standard') error('IndustrialMechs can only mount standard gyros.');
    if (design.jumpJetType !== 'standard') error('IndustrialMechs can only mount standard jump jets.');
    if (design.heatSinkType !== 'single') error('IndustrialMechs may only mount standard single heat sinks.');
    if (design.myomer === 'tsm') error('IndustrialMechs use Industrial TSM, not combat Triple-Strength Myomer.');
    if (design.cockpitType === 'industrial' && design.equipment.some((e) => /^(c3|improved-c3)/.test(e.equipmentId))) {
      error('IndustrialMechs without advanced fire control cannot use C3 equipment.');
    }
    if (design.cockpitType === 'industrial') info('Industrial cockpit without advanced fire control: +1 to hit, and Battle Value ×0.9.');
    if (design.environmentalSealing) {
      for (const loc of LOCATIONS) {
        const n = design.equipment.filter((e) => e.equipmentId === ENV_SEAL_ID && e.location === loc).length;
        if (n !== 1) error(`Environmental sealing needs one slot in every location (${locationName(design, loc)} has ${n}).`);
      }
    }
  } else {
    if (design.environmentalSealing) error('Only IndustrialMechs can be environmentally sealed.');
    if (design.cockpitType === 'industrial') error('Only IndustrialMechs use an industrial cockpit.');
    if (design.myomer === 'industrial-tsm') error('Only IndustrialMechs can mount Industrial TSM.');
  }

  // Armored components (Tactical Operations; prototypes from 3061)
  const armoredItems = design.equipment.filter((e) => e.armored);
  const armoredSystems = LOCATIONS.reduce((n, l) => n + armoredSystemSlots(design, l).length, 0);
  if (armoredItems.length || armoredSystems) {
    if (!isAvailableIn('3050', design.era)) error('Armored components are not available before 3061.');
    for (const e of armoredItems) {
      const eq = getEquipment(e.equipmentId);
      if (eq && !canArmor(eq)) error(`${eq.name} cannot be armored.`);
    }
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

  // Cockpits
  if (design.cockpitType === 'torso-mounted') {
    const coreSlots = engineCenterSlots(design.engineType) + gyroSlots(design.gyroType);
    if (coreSlots > 10) error('A torso-mounted cockpit needs two free center-torso slots (not possible with this engine and gyro).');
  }
  if (design.fullHeadEjection && (design.cockpitType === 'torso-mounted' || design.cockpitType === 'command-console')) {
    error('A full head ejection system cannot be combined with a torso-mounted cockpit or command console.');
  }
  if (design.cockpitType === 'command-console' && design.tonnage < 60) {
    warn('A command console only gives its initiative bonus on heavy and assault \'Mechs.');
  }

  // Stealth armor works through an ECM suite.
  if (design.armorType === 'stealth' && !design.equipment.some((e) => /(^|-)ecm$/.test(e.equipmentId) && e.location)) {
    error('Stealth armor needs an ECM suite.');
  }

  // Actuator Enhancement System, partial wings and 'Mech stealth systems (Tactical / Interstellar Operations)
  const ids = design.equipment.map((e) => e.equipmentId);
  const hasId = (re: RegExp) => ids.some((id) => re.test(id));
  const hasTC = design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'targetingComputer');
  const hasC3 = hasId(/^(c3-|improved-c3)/);
  const aes = design.equipment.filter((e) => e.equipmentId === 'aes');
  if (aes.length) {
    for (const loc of LOCATIONS) {
      if (aes.filter((e) => e.location === loc).length > 1) error(`Only one AES can be mounted in the ${locationName(design, loc)}.`);
    }
    const legs = legLocations(design);
    const inLegs = legs.filter((l) => aes.some((e) => e.location === l)).length;
    if (inLegs > 0 && inLegs < legs.length) error('If an AES is mounted in a leg, every leg must mount one.');
    // A supercharger is allowed (as MegaMek); MASC is not.
    if (design.equipment.some((e) => getEquipment(e.equipmentId)?.variableWeight === 'masc')) error('AES cannot be combined with MASC.');
    if (hasTC) error('AES cannot be combined with a targeting computer.');
    if (design.myomer !== 'standard') error('AES cannot be combined with Triple-Strength Myomer.');
  }
  for (const eq of [...new Set(design.equipment.map((e) => getEquipment(e.equipmentId)).filter((e) => e?.spread))] as NonNullable<ReturnType<typeof getEquipment>>[]) {
    const pieces = design.equipment.filter((e) => e.equipmentId === eq.id);
    if (!pieces.length) continue;
    for (const loc of spreadLocations(eq, design)) {
      const n = pieces.filter((e) => e.location === loc).length;
      if (n !== 1) error(`${eq.name} needs one piece in the ${locationName(design, loc)} (has ${n}).`);
    }
  }
  if (hasId(/partial-wing$/)) {
    if (hasId(/^partial-wing$/) && hasId(/^clan-partial-wing$/)) error('Only one partial wing can be fitted.');
    if (design.lam) error("Land-Air 'Mechs cannot mount a partial wing.");
  }
  if (ids.includes('umu') && hasId(/jump-jet$/)) error('UMUs cannot be combined with jump jets.');
  if (ids.includes('radical-heat-sink') && design.heatSinkType !== 'double') error('A radical heat sink system needs double heat sinks.');
  if (ids.filter((id) => id === 'radical-heat-sink').length > 1) error('Only one radical heat sink system can be installed.');
  const nullSig = ids.includes('null-signature-system');
  const voidSig = ids.includes('void-signature-system');
  const chameleon = ids.includes('chameleon-lps');
  const stealthArmor = design.armorType === 'stealth';
  if (nullSig) {
    if (stealthArmor) error('A null-signature system cannot be combined with stealth armor.');
    if (voidSig) error('A null-signature system cannot be combined with a void-signature system.');
    if (hasTC) error('A null-signature system cannot be combined with a targeting computer.');
    if (hasC3) error('A null-signature system cannot be combined with C3 equipment.');
  }
  if (voidSig) {
    if (!design.equipment.some((e) => /(^|-)ecm$/.test(e.equipmentId) && e.location)) error('A void-signature system needs an ECM suite.');
    if (stealthArmor) error('A void-signature system cannot be combined with stealth armor.');
    if (hasTC) error('A void-signature system cannot be combined with a targeting computer.');
    if (hasC3) error('A void-signature system cannot be combined with C3 equipment.');
  }
  if (chameleon) {
    if (stealthArmor) error('A chameleon light polarization shield cannot be combined with stealth armor.');
    if (voidSig) error('A chameleon light polarization shield cannot be combined with a void-signature system.');
  }

  // Endo Steel / Ferro-Fibrous slot placeholders
  const fillerCheck: [string, number, string][] = [
    [ENDO_STEEL_ID, structureSlots(design.structureType, techOf(design, 'structure')), STRUCTURE_NAMES[design.structureType]],
    [FERRO_FIBROUS_ID, armorSlots(design.armorType, techOf(design, 'armor')), `${ARMOR_NAMES[design.armorType]} armor`],
    [TSM_ID, tsmSlots(design.myomer), design.myomer === 'industrial-tsm' ? 'Industrial TSM' : 'Triple-Strength Myomer'],
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
    // Industrial equipment (cargo, lift hoists, communications gear…) can go on BattleMechs too (as MegaMek);
    // only environmental sealing and Industrial TSM are IndustrialMech-only, and those are checked above.
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
    if (item.split) {
      const total = itemSlots(eq, design);
      if (!canSplit(eq)) error(`${eq.name} cannot be split between locations; only weapons of 8 or more slots can.`);
      else if (!item.location || !SPLIT_ADJACENT[item.location].includes(item.split.location)) {
        error(`${eq.name} can only be split between adjacent locations (arm or leg and side torso, or side and center torso).`);
      } else if (item.split.slots < 1 || item.split.slots >= total) {
        error(`${eq.name} split: ${item.split.slots} of ${total} slots in the ${locationName(design, item.split.location)} leaves nothing in one part.`);
      } else if (!allowedLocations(eq, design).includes(item.split.location)) {
        error(`${eq.name} cannot be mounted in the ${locationName(design, item.split.location)}.`);
      }
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
  // Supercharger: one, in a location holding engine slots.
  const superchargers = design.equipment.filter((e) => e.equipmentId === 'supercharger');
  if (superchargers.length > 1) error('Only one supercharger may be installed.');
  for (const sc of superchargers) {
    const side = sc.location === 'LT' || sc.location === 'RT';
    if (side && engineSideTorsoSlots(design.engineType, techOf(design, 'engine')) === 0) {
      error('A supercharger must go in a location with engine slots (the center torso, or a side torso with an XL-type engine).');
    }
  }
  // PPC capacitors: each links to a PPC in the same location.
  for (const loc of LOCATIONS) {
    const caps = design.equipment.filter((e) => e.location === loc && /ppc-capacitor$/.test(e.equipmentId)).length;
    const ppcs = design.equipment.filter((e) => e.location === loc && isPPC(e.equipmentId)).length;
    if (caps > ppcs) error(`${locationName(design, loc)}: each PPC Capacitor needs a PPC in the same location (${caps} capacitor(s), ${ppcs} PPC(s)).`);
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
    const fcsV = here.filter((e) => e?.id === 'clan-artemis-v').length;
    const launchers = here.filter((e) => e?.artemisCapable).length;
    const launchersV = here.filter((e) => e && isArtemisVCapable(e.id)).length;
    if (fcsV > launchersV) {
      error(
        `${locationName(design, loc)} has ${fcsV} Artemis V FCS but only ${launchersV} Clan LRM/SRM launcher(s); ` +
          'each Artemis V must share a location with its launcher.',
      );
    } else if (fcs + fcsV > launchers) {
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
  const hasArtemisV = weaponIds.has('clan-artemis-v');
  for (const id of weaponIds) {
    const eq = getEquipment(id);
    if (eq?.ammoFor && !weaponIds.has(eq.ammoFor)) {
      warn(`${eq.name} is carried but no ${getEquipment(eq.ammoFor)?.name} is mounted.`);
    }
    if (eq?.artemisAmmo && !hasArtemis) {
      warn(`${eq.name} needs an Artemis IV FCS to give any benefit.`);
    }
    if (eq?.artemisVAmmo && !hasArtemisV) {
      warn(`${eq.name} needs an Artemis V FCS to give any benefit.`);
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
