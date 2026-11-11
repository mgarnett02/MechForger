import { describe, expect, it } from 'vitest';
import { addEquipment, computeMech, mechBV, mechCost, newDesign, setCockpitType, setEngineType, setGyroType, technicalReadout, validate } from './index';
import { fixedSlots } from './construction';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const ammoIn = (d: MechDesign, loc: 'CT' | 'LT' | 'LA') => addEquipment(addEquipment(d, 'ac-5', 'RA'), 'ammo-ac-5', loc);
const explosive = (d: MechDesign) => mechBV(d).lines.find(([l]) => /Explosive/.test(l))?.[1] ?? 0;

describe('CASE II', () => {
  it('weighs 1 t (IS) or 0.5 t (Clan), one slot, any location', () => {
    const d = addEquipment(newDesign('3068'), 'case-ii', 'CT');
    expect(computeMech(d).weights.equipment).toBe(1);
    expect(computeMech(addEquipment(newDesign('3068', 'Clan'), 'clan-case-ii', 'HD')).weights.equipment).toBe(0.5);
    expect(errors(d)).toEqual([]);
  });

  it('protects ammo even in the center torso and in XL side torsos', () => {
    const d = ammoIn(newDesign('3068'), 'CT');
    expect(explosive(d)).toBe(-15);
    expect(explosive(addEquipment(d, 'case-ii', 'CT'))).toBe(0);
    const xl = ammoIn(setEngineType(newDesign('3068'), 'xl'), 'LT');
    expect(explosive(addEquipment(xl, 'case', 'LT'))).toBe(-15);
    expect(explosive(addEquipment(xl, 'case-ii', 'LT'))).toBe(0);
  });

  it('CASE II in a side torso also covers its arm', () => {
    const d = ammoIn(newDesign('3068'), 'LA');
    expect(explosive(addEquipment(d, 'case-ii', 'LT'))).toBe(0);
    expect(mechCost(addEquipment(newDesign('3068'), 'case-ii', 'LT')).total).toBeGreaterThan(mechCost(newDesign('3068')).total);
  });
});

describe('torso-mounted cockpit', () => {
  const d = setCockpitType(newDesign('3068'), 'torso-mounted');

  it('weighs 4 t, puts the cockpit in the center torso and life support in each side torso', () => {
    expect(computeMech(d).weights.cockpit).toBe(4);
    expect(fixedSlots(d, 'HD')).toEqual(['Sensors', 'Sensors', null, null, null, null]);
    expect(fixedSlots(d, 'CT').slice(10)).toEqual(['Cockpit', 'Sensors']);
    expect(fixedSlots(d, 'LT')[0]).toBe('Life Support');
    expect(errors(d)).toEqual([]);
    expect(technicalReadout(d)).toContain('Cockpit: Torso-Mounted');
  });

  it('cannot fit beside an XL gyro', () => {
    expect(errors(setGyroType(d, 'xl')).some((m) => /torso-mounted cockpit needs two free/.test(m))).toBe(true);
  });

  it('BV counts center torso armor twice and is multiplied by 0.95; cost 750,000', () => {
    const base = newDesign('3068');
    const armor = (x: MechDesign) => mechBV(x).lines.find(([l]) => l === 'Armor')![1];
    expect(armor(d) - armor(base)).toBe((base.armor.CT + base.armor.CTR) * 2.5);
    expect(mechBV(d).total).toBe(Math.round((mechBV(d).defensive + mechBV(d).offensive) * 0.95));
    expect(mechCost(d).lines.find(([l]) => l === 'Cockpit')![1]).toBe(750000);
  });
});

describe('command console', () => {
  it('weighs 6 t, fills the head and suits heavy and assault Mechs', () => {
    const d = setCockpitType({ ...newDesign('3025'), tonnage: 70 }, 'command-console');
    expect(computeMech(d).weights.cockpit).toBe(6);
    expect(fixedSlots(d, 'HD')).toEqual(['Life Support', 'Sensors', 'Cockpit', 'Command Console', 'Sensors', 'Life Support']);
    expect(mechCost(d).lines.find(([l]) => l === 'Cockpit')![1]).toBe(700000);
    const light = setCockpitType(newDesign('3025'), 'command-console');
    expect(validate(light).some((i) => i.severity === 'warning' && /command console/.test(i.message))).toBe(true);
    expect(errors({ ...d, fullHeadEjection: true }).some((m) => /full head ejection/.test(m))).toBe(true);
  });

  it('small cockpits now take 5% off mech BV, as in MegaMek', () => {
    const d = setCockpitType(newDesign('3068'), 'small');
    expect(mechBV(d).total).toBe(Math.round((mechBV(d).defensive + mechBV(d).offensive) * 0.95));
  });
});
