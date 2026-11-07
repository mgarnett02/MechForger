import type { MechDesign } from './types';
import { FACING_NAMES, LOCATIONS, LOCATION_NAMES, REAR_FACING, TECH_BASE_NAMES } from './types';
import { getEra } from './eras';
import type { MountedItem } from './types';
import { equipmentName, getEquipment } from './equipment';
import { activeConfigName } from './omni';
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
  const era = getEra(design.era);
  if (design.mixedTech) {
    lines.push(`Tech Base: Mixed (${TECH_BASE_NAMES[design.techBase]} chassis) (Advanced)`);
  } else {
    lines.push(`Tech Base: ${TECH_BASE_NAMES[design.techBase]} (${era?.rulesLevel ?? '?'})`);
  }
  if (design.omni) lines.push(`Config: OmniMech — ${activeConfigName(design)} configuration`);
  if (era) lines.push(`Era: ${era.name} (${era.year})`);
  lines.push('');
  lines.push(row('Equipment', 'Mass'));
  lines.push(row(`Internal Structure: ${design.structureType === 'endo-steel' ? 'Endo Steel' : ''}`.trimEnd(), s.weights.structure));
  const engineName = { standard: 'Fusion', xl: 'XL', light: 'Light', compact: 'Compact' }[design.engineType];
  lines.push(row(`Engine: ${s.rating} ${engineName}`, s.weights.engine));
  lines.push(`    Walking MP: ${design.walkMP}`);
  lines.push(`    Running MP: ${s.runMP}${s.mascRunMP ? ` [${s.mascRunMP}]` : ''}`);
  if (s.tsmMP) lines.push(`    (Triple-Strength Myomer: ${s.tsmMP.walk}/${s.tsmMP.run} at 9+ heat)`);
  lines.push(`    Jumping MP: ${s.jumpMP}`);
  const hsLabel = design.heatSinkType === 'double' ? ' Double' : '';
  lines.push(row(`Heat Sinks:${hsLabel} ${s.heatSinks.total} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  const gyroName = { standard: '', xl: ' XL', 'heavy-duty': ' Heavy-Duty', compact: ' Compact' }[design.gyroType];
  lines.push(row(`Gyro:${gyroName}`, s.weights.gyro));
  lines.push(row(`Cockpit:${design.cockpitType === 'small' ? ' Small' : ''}`, s.weights.cockpit));
  const ff = {
    standard: '', 'ferro-fibrous': ' (Ferro-Fibrous)', 'light-ferro': ' (Light Ferro-Fibrous)',
    'heavy-ferro': ' (Heavy Ferro-Fibrous)',
  }[design.armorType];
  lines.push(row(`Armor Factor${ff}: ${s.armorTotal}`, s.weights.armor));
  lines.push('');
  lines.push(`${''.padEnd(22)}Internal   Armor`);
  lines.push(`${''.padEnd(22)}Structure  Value`);
  for (const loc of LOCATIONS) {
    const is = s.structure?.[loc] ?? 0;
    lines.push(`    ${LOCATION_NAMES[loc].padEnd(18)}${String(is).padStart(5)}${String(design.armor[loc]).padStart(9)}`);
    const rear = REAR_FACING[loc];
    if (rear) lines.push(`    ${FACING_NAMES[rear].padEnd(18)}${''.padStart(5)}${String(design.armor[rear]).padStart(9)}`);
  }
  lines.push('');
  const header = (title: string) =>
    lines.push(`${title.padEnd(26)}${'Loc'.padEnd(6)}${'Crit'.padEnd(6)}Tons`);
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
        name: equipmentName(eq, design) + (item.rear ? ' (R)' : ''),
        loc: item.location ?? '—',
        slots: itemSlots(eq, design),
        tons: itemWeight(eq, design),
        n: 1,
      });
    }
  }
  for (const g of groups.values()) {
    const name = g.n > 1 ? `${g.n} ${g.name}` : g.name;
    lines.push(`${name.padEnd(26)}${g.loc.padEnd(6)}${String(g.slots).padEnd(6)}${t(g.tons)}`);
  }
  const jj = items.filter((e) => e.equipmentId.endsWith('jump-jet'));
  if (jj.length) {
    const locs = [...new Set(jj.map((e) => e.location ?? '—'))].join('/');
    const tons = (s.weights.jumpJets / Math.max(1, s.jumpMP)) * jj.length;
    lines.push(`${(design.jumpJetType === 'improved' ? 'Improved Jump Jets' : 'Jump Jets').padEnd(26)}${locs.padEnd(6)}${String(jj.length).padEnd(6)}${t(tons)}`);
  }
  const hs = items.filter((e) => getEquipment(e.equipmentId)?.id.includes('heat-sink'));
  if (hs.length && design.omni) {
    const locs = [...new Set(hs.map((e) => e.location ?? '—'))].join('/');
    lines.push(`${'Heat Sinks'.padEnd(26)}${locs.padEnd(6)}${String(hs.length).padEnd(6)}`);
  }
  }
}
