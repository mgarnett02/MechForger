import type { MechDesign } from './types';
import { LAM_TYPE_NAMES, LOCATIONS, REAR_FACING, TECH_BASE_NAMES, facingName, isQuad, locationAbbr, locationName } from './types';
import { getEra } from './eras';
import { ARMOR_NAMES, STRUCTURE_NAMES } from './tables';
import type { MountedItem } from './types';
import { getEquipment, shortEquipmentName } from './equipment';
import { activeConfigName } from './omni';
import { mechBV, mechCost } from './battleValue';
import type { MechSummary } from './construction';
import { computeMech, itemSlots, itemWeight } from './construction';

const t = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const row = (label: string, mass: number | string, width = 34) =>
  `${label.padEnd(width)}${typeof mass === 'number' ? t(mass) : mass}`;

/** Technical-readout style plain-text summary of a design. */
export function technicalReadout(design: MechDesign, summary: MechSummary = computeMech(design)): string {
  const s = summary;
  const lines: string[] = [];
  lines.push(`${design.chassis} ${design.model}`.trim());
  lines.push('');
  lines.push(`Mass: ${design.tonnage} tons (${s.weightClass ?? 'invalid'})`);
  if (isQuad(design)) lines.push('Configuration: Quad');
  if (design.lam) lines.push(`Configuration: Land-Air 'Mech (${LAM_TYPE_NAMES[design.lam]})`);
  const era = getEra(design.era);
  if (design.mixedTech) {
    lines.push(`Tech Base: Mixed (${TECH_BASE_NAMES[design.techBase]} chassis) (Advanced)`);
  } else {
    lines.push(`Tech Base: ${TECH_BASE_NAMES[design.techBase]} (${design.lam ? 'Advanced' : era?.rulesLevel ?? '?'})`);
  }
  if (design.omni) lines.push(`Config: OmniMech — ${activeConfigName(design)} configuration`);
  if (era) lines.push(`Era: ${era.name} (${era.year})`);
  lines.push(`Battle Value: ${mechBV(design).total.toLocaleString('en-US')}`);
  lines.push(`Cost: ${mechCost(design).total.toLocaleString('en-US')} C-bills`);
  lines.push('');
  lines.push(row('Equipment', 'Mass'));
  lines.push(row(`Internal Structure: ${design.structureType === 'standard' ? '' : STRUCTURE_NAMES[design.structureType]}`.trimEnd(), s.weights.structure));
  const engineName = { standard: 'Fusion', xl: 'XL', xxl: 'XXL', light: 'Light', compact: 'Compact' }[design.engineType];
  lines.push(row(`Engine: ${s.rating} ${engineName}`, s.weights.engine));
  lines.push(`    Walking MP: ${design.walkMP}`);
  lines.push(`    Running MP: ${s.runMP}${s.mascRunMP ? ` [${s.mascRunMP}]` : ''}`);
  if (s.tsmMP) lines.push(`    (Triple-Strength Myomer: ${s.tsmMP.walk}/${s.tsmMP.run} at 9+ heat)`);
  lines.push(`    Jumping MP: ${s.jumpMP}`);
  if (s.lam?.airMech) {
    const a = s.lam.airMech;
    lines.push(`    AirMech MP: ${a.walk}/${a.run} ground, ${a.cruise}/${a.flank} flight`);
  }
  if (s.lam) lines.push(`    Fighter thrust: ${s.lam.fighter.safe} safe / ${s.lam.fighter.max} max`);
  const hsLabel = design.heatSinkType === 'double' ? ' Double' : '';
  lines.push(row(`Heat Sinks:${hsLabel} ${s.heatSinks.total} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  const gyroName = { standard: '', xl: ' XL', 'heavy-duty': ' Heavy-Duty', compact: ' Compact' }[design.gyroType];
  lines.push(row(`Gyro:${gyroName}`, s.weights.gyro));
  lines.push(row(`Cockpit:${design.cockpitType === 'small' ? ' Small' : ''}`, s.weights.cockpit));
  if (s.weights.conversion) lines.push(row('LAM Conversion Equipment:', s.weights.conversion));
  if (design.fullHeadEjection) lines.push('Full Head Ejection System');
  const ff = design.armorType === 'standard' ? '' : ` (${ARMOR_NAMES[design.armorType]})`;
  lines.push(row(`Armor Factor${ff}: ${s.armorTotal}`, s.weights.armor));
  lines.push('');
  lines.push(`${''.padEnd(22)}Internal   Armor`);
  lines.push(`${''.padEnd(22)}Structure  Value`);
  for (const loc of LOCATIONS) {
    const is = s.structure?.[loc] ?? 0;
    lines.push(`    ${locationName(design, loc).padEnd(18)}${String(is).padStart(5)}${String(design.armor[loc]).padStart(9)}`);
    const rear = REAR_FACING[loc];
    if (rear) lines.push(`    ${facingName(design, rear).padEnd(18)}${''.padStart(5)}${String(design.armor[rear]).padStart(9)}`);
  }
  lines.push('');
  // Name column wide enough for the longest entry ("12 " count prefix + name + " (R)"), so columns never run together.
  const nameWidth = Math.max(26, ...design.equipment.map((e) => {
    const eq = getEquipment(e.equipmentId);
    return eq ? shortEquipmentName(eq, design).length + (e.rear ? 4 : 0) + 4 : 0;
  }));
  const header = (title: string) =>
    lines.push(`${title.padEnd(nameWidth)}${'Loc'.padEnd(6)}${'Crit'.padEnd(6)}Tons`);
  if (design.omni && s.omni) {
    header('Fixed Equipment');
    listItems(design.equipment.filter((e) => !e.pod));
    lines.push('');
    lines.push(`Pod space: ${t(s.omni.podSpace)} tons (${t(s.omni.podUsed)} used)`);
    lines.push('');
    header(`${activeConfigName(design)} Configuration`);
    listItems(design.equipment.filter((e) => e.pod));
  } else {
    header('Weapons and Ammo');
    listItems(design.equipment);
  }
  if (design.techBase === 'Clan') {
    lines.push('');
    lines.push('Clan CASE is built into every location.');
  }
  return lines.join('\n');

  function listItems(items: MountedItem[]) {
  // Group identical items in the same location.
  const groups = new Map<string, { name: string; loc: string; slots: number; tons: number; n: number }>();
  for (const item of items) {
    const eq = getEquipment(item.equipmentId);
    if (!eq || eq.managed) continue;
    const key = `${eq.id}|${item.location}|${item.rear ? 'R' : ''}`;
    const g = groups.get(key);
    if (g) {
      g.n++;
      g.slots += itemSlots(eq, design);
      g.tons += itemWeight(eq, design);
    } else {
      groups.set(key, {
        name: shortEquipmentName(eq, design) + (item.rear ? ' (R)' : ''),
        loc: item.location ? locationAbbr(design, item.location) : '—',
        slots: itemSlots(eq, design),
        tons: itemWeight(eq, design),
        n: 1,
      });
    }
  }
  for (const g of groups.values()) {
    const name = g.n > 1 ? `${g.n} ${g.name}` : g.name;
    lines.push(`${name.padEnd(nameWidth)}${g.loc.padEnd(6)}${String(g.slots).padEnd(6)}${t(g.tons)}`);
  }
  const jj = items.filter((e) => e.equipmentId.endsWith('jump-jet'));
  if (jj.length) {
    const locs = [...new Set(jj.map((e) => (e.location ? locationAbbr(design, e.location) : '—')))].join('/');
    const tons = (s.weights.jumpJets / Math.max(1, s.jumpMP)) * jj.length;
    lines.push(`${(design.jumpJetType === 'improved' ? 'Improved Jump Jets' : 'Jump Jets').padEnd(nameWidth)}${locs.padEnd(6)}${String(jj.length).padEnd(6)}${t(tons)}`);
  }
  const hs = items.filter((e) => getEquipment(e.equipmentId)?.id.includes('heat-sink'));
  if (hs.length && design.omni) {
    const locs = [...new Set(hs.map((e) => (e.location ? locationAbbr(design, e.location) : '—')))].join('/');
    lines.push(`${'Heat Sinks'.padEnd(nameWidth)}${locs.padEnd(6)}${String(hs.length).padEnd(6)}`);
  }
  }
}
