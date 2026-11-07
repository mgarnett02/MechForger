import type { MechDesign } from './types';
import { FACING_NAMES, LOCATIONS, LOCATION_NAMES, REAR_FACING } from './types';
import { getEquipment } from './equipment';
import type { MechSummary } from './construction';
import { computeMech, itemWeight } from './construction';

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
  lines.push('Tech Base: Inner Sphere (Introductory)');
  lines.push('');
  lines.push(row('Equipment', 'Mass'));
  lines.push(row('Internal Structure:', s.weights.structure));
  lines.push(row(`Engine: ${s.rating} Fusion`, s.weights.engine));
  lines.push(`    Walking MP: ${design.walkMP}`);
  lines.push(`    Running MP: ${s.runMP}`);
  lines.push(`    Jumping MP: ${s.jumpMP}`);
  lines.push(row(`Heat Sinks: ${s.heatSinks.total} [${s.heatSinks.dissipation}]`, s.weights.heatSinks));
  lines.push(row('Gyro:', s.weights.gyro));
  lines.push(row('Cockpit:', s.weights.cockpit));
  lines.push(row(`Armor Factor: ${s.armorTotal}`, s.weights.armor));
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
  lines.push(`${'Weapons and Ammo'.padEnd(26)}${'Loc'.padEnd(6)}${'Crit'.padEnd(6)}Tons`);

  // Group identical items in the same location.
  const groups = new Map<string, { name: string; loc: string; slots: number; tons: number; n: number }>();
  for (const item of design.equipment) {
    const eq = getEquipment(item.equipmentId);
    if (!eq || eq.managed) continue;
    const key = `${eq.id}|${item.location}|${item.rear ? 'R' : ''}`;
    const g = groups.get(key);
    if (g) {
      g.n++;
      g.slots += eq.slots;
      g.tons += itemWeight(eq, design.tonnage);
    } else {
      groups.set(key, {
        name: eq.name + (item.rear ? ' (R)' : ''),
        loc: item.location ?? '—',
        slots: eq.slots,
        tons: itemWeight(eq, design.tonnage),
        n: 1,
      });
    }
  }
  for (const g of groups.values()) {
    const name = g.n > 1 ? `${g.n} ${g.name}` : g.name;
    lines.push(`${name.padEnd(26)}${g.loc.padEnd(6)}${String(g.slots).padEnd(6)}${t(g.tons)}`);
  }
  const jj = design.equipment.filter((e) => e.equipmentId === 'jump-jet');
  if (jj.length) {
    const locs = [...new Set(jj.map((e) => e.location ?? '—'))].join('/');
    lines.push(`${'Jump Jets'.padEnd(26)}${locs.padEnd(6)}${String(jj.length).padEnd(6)}${t(s.weights.jumpJets)}`);
  }
  return lines.join('\n');
}
