import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import {
  addEquipment, computeMech, getEquipment, itemSlots, itemWeight, mechBV, mechCost, newDesign, validate,
} from './index';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const line = (d: MechDesign, re: RegExp) => mechBV(d).lines.find(([l]) => re.test(l))?.[1];
const canon = M as CanonEntry[];
const base = (t = 60) => ({ ...newDesign('3081'), tonnage: t, walkMP: 4 });

describe('advanced weapons and electronics', () => {
  it('carry MegaMek stats', () => {
    expect(getEquipment('elrm-15')).toMatchObject({ tons: 12, slots: 6, heat: 8, ammoPerTon: 6 });
    expect(getEquipment('clan-iatm-12')).toMatchObject({ tons: 7, slots: 5, ammoPerTon: 5 });
    expect(getEquipment('improved-heavy-gauss')).toMatchObject({ tons: 20, slots: 11, heat: 2 });
    expect(getEquipment('blazer')).toMatchObject({ tons: 9, slots: 4, heat: 16 });
    expect(itemWeight(getEquipment('drone-os')!, base(55))).toBe(6);
  });

  it('a machine gun array is worth 0.67 × its linked machine guns; Apollo raises an MRM by 15%', () => {
    let d = base();
    for (let k = 0; k < 3; k++) d = addEquipment(d, 'machine-gun', 'RA');
    const before = line(d, /Weapons/)!;
    expect(line(addEquipment(d, 'mga', 'RA'), /Weapons/)).toBeCloseTo(before + 0.67 * 3 * 5);
    const m = addEquipment(base(), 'mrm-10', 'LT');
    expect(line(addEquipment(m, 'apollo-fcs', 'LT'), /Weapons/)).toBeCloseTo(line(m, /Weapons/)! * 1.15);
  });
});

describe('physical weapons, shields and systems', () => {
  it('lances and vibroblades follow MegaMek weights, slots and BV', () => {
    const lance = getEquipment('lance')!;
    expect(itemWeight(lance, base(60))).toBe(3);
    expect(itemSlots(lance, base(60))).toBe(3);
    expect(itemWeight(getEquipment('large-vibroblade')!, base())).toBe(7);
    expect(errors(addEquipment(base(), 'small-vibroblade', 'LT')).some((m) => /cannot be mounted/.test(m))).toBe(true);
  });

  it('medium shields cost a jump MP, large shields stop jumping, modular armor adds 10 armor and costs a jump MP', () => {
    let d = base();
    for (const l of ['LL', 'RL', 'CT'] as const) d = addEquipment(d, 'jump-jet', l);
    expect(computeMech(addEquipment(d, 'medium-shield', 'LA')).totalJumpMP).toBe(2);
    expect(computeMech(addEquipment(d, 'large-shield', 'LA')).totalJumpMP).toBe(0);
    const mod = addEquipment(d, 'modular-armor', 'CT');
    expect(computeMech(mod).totalJumpMP).toBe(2);
    expect(line(mod, /^Armor$/)! - line(d, /^Armor$/)!).toBeCloseTo(25);
  });

  it('UMUs, tracks, radical heat sinks, HarJel and the Blue Shield damper', () => {
    expect(errors(addEquipment(addEquipment(base(), 'umu', 'LL'), 'jump-jet', 'RL'))).toContain('UMUs cannot be combined with jump jets.');
    const t = addEquipment(base(60), 'tracks');
    expect(t.equipment.filter((e) => e.equipmentId === 'tracks').map((e) => e.location)).toEqual(['LL', 'RL']);
    expect(computeMech(t).weights.equipment).toBe(6);
    expect(mechCost(t).total).toBeGreaterThan(mechCost(base(60)).total);
    expect(errors(addEquipment(base(), 'radical-heat-sink', 'LT'))).toContain('A radical heat sink system needs double heat sinks.');
    const b = addEquipment(base(), 'blue-shield');
    expect(b.equipment.filter((e) => e.equipmentId === 'blue-shield')).toHaveLength(7);
    expect(computeMech(b).weights.equipment).toBe(3);
  });

  it('canon designs with the new equipment convert', () => {
    for (const re of [/elrm-/, /clan-iatm/, /improved-heavy-gauss/, /bloodhound/, /tsemp/, /mga"/, /radical-heat-sink/, /"lance"/, /vibroblade/, /shield/, /"umu"/, /"tracks"/]) {
      expect(canon.filter((e) => re.test(JSON.stringify(e.d))).length, String(re)).toBeGreaterThan(0);
    }
    expect(canon.filter((e) => e.ok).length / canon.length).toBeGreaterThan(0.99);
  });
});
