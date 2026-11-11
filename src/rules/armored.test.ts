import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import { addEquipment, computeMech, mechBV, mechCost, newDesign, parseDesign, technicalReadout, validate } from './index';
import { fixedSlots } from './construction';
import { setItemArmored, toggleSystemArmor } from './edit';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const line = (d: MechDesign, re: RegExp) => mechBV(d).lines.find(([l]) => re.test(l))?.[1];
const last = (d: MechDesign) => d.equipment[d.equipment.length - 1].uid;
const canon = M as CanonEntry[];

describe('armored components', () => {
  const base = { ...newDesign('3068'), tonnage: 50, walkMP: 5 };
  const ctIndex = (d: MechDesign, label: RegExp) => fixedSlots(d, 'CT').findIndex((f) => f !== null && label.test(f));

  it('weigh half a ton per slot; an armored cockpit is a flat ton', () => {
    let d = addEquipment(base, 'ppc', 'RA');
    d = setItemArmored(d, last(d), true);
    expect(computeMech(d).weights.armored).toBe(1.5); // 3 slots
    const gyro = ctIndex(d, /Gyro/);
    d = toggleSystemArmor(toggleSystemArmor(d, 'CT', gyro), 'CT', gyro + 1);
    expect(computeMech(d).weights.armored).toBe(2.5);
    d = toggleSystemArmor(d, 'HD', 2); // cockpit
    expect(computeMech(d).weights.armored).toBe(3.5);
    expect(computeMech(toggleSystemArmor(d, 'CT', gyro)).weights.armored).toBe(3); // toggles off again
    expect(computeMech(d).slots.CT.slots[gyro].armored).toBe(true);
  });

  it('add 5% of the item BV per slot (5 per slot without BV), gyro slots 5% of the gyro BV, others 5', () => {
    let d = addEquipment(base, 'ppc', 'RA');
    d = setItemArmored(d, last(d), true);
    expect(line(d, /Armored components/)).toBeCloseTo(176 * 0.05 * 3);
    d = addEquipment(d, 'case', 'LT');
    d = setItemArmored(d, last(d), true);
    expect(line(d, /Armored components/)).toBeCloseTo(176 * 0.05 * 3 + 5);
    const g = toggleSystemArmor(base, 'CT', ctIndex(base, /Gyro/));
    expect(line(g, /Armored components/)).toBeCloseTo(50 * 0.5 * 0.05);
    expect(line(toggleSystemArmor(base, 'LA', 0), /Armored components/)).toBe(5); // shoulder
  });

  it('cost 150,000 C-bills per armored slot and need the 3061+ tech', () => {
    const d = toggleSystemArmor(base, 'LA', 0);
    expect(mechCost(d).total - mechCost(base).total).toBe(150000 * 1.5);
    expect(errors({ ...d, era: '3025' })).toContain('Armored components are not available before 3061.');
    expect(errors(d).some((m) => /Armored/.test(m))).toBe(false);
  });

  it('save, load, encode and show in the readout', () => {
    let d = addEquipment(base, 'ppc', 'RA');
    d = toggleSystemArmor(setItemArmored(d, last(d), true), 'LL', 0);
    const back = parseDesign(JSON.parse(JSON.stringify(d)));
    expect(back.armoredSlots).toEqual({ LL: [0] });
    expect(back.equipment.find((e) => e.equipmentId === 'ppc')?.armored).toBe(true);
    expect(decodeMech(encodeMech(d)).equipment.find((e) => e.equipmentId === 'ppc')?.armored).toBe(true);
    const r = technicalReadout(d, computeMech(d));
    expect(r).toMatch(/Armored Components: Hip/);
    expect(r).toMatch(/PPC \(A\)/);
  });

  it('canon designs with armored components convert at their exact tonnage', () => {
    const armored = canon.filter((e) => {
      const d = decodeMech(e.d);
      return d.armoredSlots || d.equipment.some((i) => i.armored);
    });
    expect(armored.length).toBeGreaterThan(15);
    expect(armored.filter((e) => e.w).length / armored.length).toBeGreaterThan(0.9);
    const dev = decodeMech(canon.find((e) => e.n === 'Devastator DVS-10')!.d);
    expect(computeMech(dev).weights.armored).toBe(3.5);
    expect(computeMech(dev).weights.total).toBe(100);
  });
});
