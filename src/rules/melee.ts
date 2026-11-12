/**
 * Physical (melee) weapon damage, Battle Value and cost. Formulas follow the TechManual and
 * Tactical Operations as implemented by MegaMek; weights and slots live in equipment.ts.
 */
import type { MechDesign } from './types';
import type { MeleeKind } from './equipment';
import { legCount, meleeWeight } from './equipment';

type MeleeDesign = Pick<MechDesign, 'tonnage' | 'techBase' | 'equipment'> & Partial<Pick<MechDesign, 'myomer' | 'config'>>;

/** Damage as printed on the record sheet (Triple-Strength Myomer doubles it when active). */
export function meleeDamage(kind: MeleeKind, tonnage: number): string {
  switch (kind) {
    case 'hatchet': return String(Math.ceil(tonnage / 5));
    case 'sword': return String(Math.ceil(tonnage / 10) + 1);
    case 'mace': return String(Math.ceil(tonnage / 4));
    case 'claw': return String(Math.ceil(tonnage / 7));
    case 'retractable-blade': return String(Math.ceil(tonnage / 10));
    case 'chain-whip': return '1';
    case 'talons': return 'Kick ×1.5';
    case 'spikes': return '+2 / special';
    case 'lance': return String(Math.ceil(tonnage / 5));
    case 'small-vibroblade': return '7';
    case 'medium-vibroblade': return '10';
    case 'large-vibroblade': return '14';
    case 'small-shield': case 'medium-shield': case 'large-shield': return 'Bash / block';
    case 'wrecking-ball': return String(Math.ceil(tonnage / 5));
  }
}

/** Battle Value of one melee item (talons: one leg's share of the set). */
export function meleeBV(kind: MeleeKind, d: MeleeDesign): number {
  const t = d.tonnage;
  const tsm = d.myomer === 'tsm' ? 2 : 1;
  switch (kind) {
    case 'hatchet': return Math.ceil(t / 5) * 1.5 * tsm;
    case 'sword': return Math.ceil(t / 10 + 1) * 1.725 * tsm;
    case 'mace': return Math.ceil(t / 4) * tsm;
    case 'claw': return Math.ceil(t / 7) * 1.275 * tsm;
    case 'retractable-blade': return Math.ceil(t / 10) * 1.725 * tsm;
    case 'chain-whip': return 5.175;
    case 'talons': return (Math.round(Math.floor(t / 5) * 0.5) * tsm) / legCount(d);
    case 'spikes': return 4;
    case 'lance': return Math.ceil(t / 5) * tsm;
    case 'small-vibroblade': return 12;
    case 'medium-vibroblade': return 17;
    case 'large-vibroblade': return 24;
    case 'small-shield': return 50;
    case 'medium-shield': return 135;
    case 'large-shield': return 263;
    case 'wrecking-ball': return 8;
  }
}

/** C-bill cost of one melee item (talons: one leg's share of the set). */
export function meleeCost(kind: MeleeKind, d: MeleeDesign): number {
  const t = d.tonnage;
  switch (kind) {
    case 'hatchet': return Math.ceil(t / 15) * 5000;
    case 'sword': return (Math.ceil((t / 20) * 2) / 2) * 10000;
    case 'mace': return 130000;
    case 'claw': return t * 200;
    case 'retractable-blade': return (1 + Math.ceil(t / 20)) * 10000;
    case 'chain-whip': return 120000;
    case 'talons': return meleeWeight('talons', d) * 300;
    case 'spikes': return t * 50;
    case 'lance': return Math.ceil(t * 150);
    case 'small-vibroblade': return 150000;
    case 'medium-vibroblade': return 400000;
    case 'large-vibroblade': return 750000;
    case 'small-shield': return 50000;
    case 'medium-shield': return 100000;
    case 'large-shield': return 300000;
    case 'wrecking-ball': return 110000;
  }
}

/** Melee kinds that occupy the "hand" of an arm: only one per location. */
export const HAND_WEAPONS: readonly MeleeKind[] = ['hatchet', 'sword', 'mace', 'claw', 'retractable-blade', 'chain-whip'];
/** Need both lower arm and hand actuators. */
export const NEEDS_HAND: readonly MeleeKind[] = ['hatchet', 'sword', 'mace', 'chain-whip'];
