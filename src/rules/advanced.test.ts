import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import {
  addEquipment, armorPointsPerTon, computeMech, engineWeight, internalStructureWeight, mechBV, mechCost, newDesign,
  setArmorType, setEngineType, setStructureType, technicalReadout, validate,
} from './index';
import { fixedSlots } from './construction';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const M = mechs as CanonEntry[];

describe('advanced internal structure', () => {
  it('weighs a share of standard structure, rounded up to the half ton', () => {
    expect(internalStructureWeight('endo-composite', 50)).toBe(4);
    expect(internalStructureWeight('composite', 50)).toBe(2.5);
    expect(internalStructureWeight('reinforced', 55)).toBe(11);
    expect(internalStructureWeight('endo-prototype', 50)).toBe(2.5);
  });

  it('spreads its slots like Endo Steel', () => {
    const count = (d: MechDesign) => d.equipment.filter((e) => e.equipmentId === 'endo-steel').length;
    expect(count(setStructureType(newDesign('3068'), 'endo-composite'))).toBe(7);
    expect(count(setStructureType(newDesign('3068', 'Clan'), 'endo-composite'))).toBe(4);
    expect(count(setStructureType(newDesign('3068'), 'reinforced'))).toBe(0);
  });

  it('composite halves and reinforced doubles the structure BV', () => {
    const d = newDesign('3068');
    const line = (x: MechDesign) => mechBV(x).lines.find(([l]) => l === 'Internal structure')![1];
    expect(line(setStructureType(d, 'composite'))).toBe(line(d) / 2);
    expect(line(setStructureType(d, 'reinforced'))).toBe(line(d) * 2);
    expect(mechCost(setStructureType(d, 'reinforced')).lines.find(([l]) => l === 'Internal structure')![1]).toBe(6400 * d.tonnage);
  });
});

describe('advanced armor', () => {
  it('points per ton', () => {
    expect(armorPointsPerTon('hardened', 'IS')).toBe(8);
    expect(armorPointsPerTon('ferro-lamellor', 'Clan')).toBe(14);
    expect(armorPointsPerTon('reflective', 'IS')).toBe(16);
    expect(armorPointsPerTon('ballistic-reinforced', 'IS')).toBe(12);
  });

  it('stealth armor takes two fixed slots per side torso, arm and leg and needs ECM', () => {
    const d = setArmorType(newDesign('3068'), 'stealth');
    expect(fixedSlots(d, 'LT').slice(0, 2)).toEqual(['Stealth', 'Stealth']);
    expect(fixedSlots(d, 'LA').filter((x) => x === 'Stealth')).toHaveLength(2);
    expect(fixedSlots(d, 'CT')).not.toContain('Stealth');
    expect(errors(d)).toContain('Stealth armor needs an ECM suite.');
    expect(errors(addEquipment(d, 'guardian-ecm', 'CT'))).not.toContain('Stealth armor needs an ECM suite.');
  });

  it('stealth adds 2 to the TMM and costs 10 heat efficiency in BV', () => {
    const d = addEquipment(newDesign('3068'), 'guardian-ecm', 'CT');
    const tmm = (x: MechDesign) => mechBV(x).lines.find(([l]) => /Defensive factor/.test(l))![1];
    expect(tmm(setArmorType(d, 'stealth'))).toBeCloseTo(tmm(d) + 0.2);
  });

  it('reflective and reactive armor take spread slots; hardened costs a running MP and doubles armor BV', () => {
    const ff = (d: MechDesign) => d.equipment.filter((e) => e.equipmentId === 'ferro-fibrous').length;
    expect(ff(setArmorType(newDesign('3068'), 'reflective'))).toBe(10);
    expect(ff(setArmorType(newDesign('3068', 'Clan'), 'reactive'))).toBe(7);
    const d = newDesign('3068');
    const h = setArmorType(d, 'hardened');
    expect(computeMech(h).runMP).toBe(computeMech(d).runMP - 1);
    const armorLine = (x: MechDesign) => mechBV(x).lines.find(([l]) => l === 'Armor')![1];
    expect(armorLine(h)).toBe(armorLine(d) * 2);
    expect(technicalReadout(h)).toContain('Armor Factor (Hardened)');
  });
});

describe('XXL engines', () => {
  it('weigh a third of a standard engine, rounded up to the half ton', () => {
    expect(engineWeight('xxl', 300)).toBe(6.5);
    expect(engineWeight('xxl', 200)).toBe(3);
  });

  it('take 6 (IS) or 4 (Clan) slots per side torso and run hot', () => {
    const d = setEngineType(newDesign('3068'), 'xxl');
    expect(fixedSlots(d, 'LT').filter((x) => x === 'XXL Fusion Engine')).toHaveLength(6);
    expect(fixedSlots(setEngineType(newDesign('3068', 'Clan'), 'xxl'), 'RT').filter((x) => x === 'XXL Fusion Engine')).toHaveLength(4);
    expect(computeMech(d).heat.running).toBe(6);
    expect(mechCost(d).lines.find(([l]) => l === 'Engine')![1]).toBe((100000 * computeMech(d).rating * d.tonnage) / 75);
  });

  it('IS XXL structure BV multiplier is 0.25', () => {
    const d = newDesign('3068');
    const line = (x: MechDesign) => mechBV(x).lines.find(([l]) => l === 'Internal structure')![1];
    expect(line(setEngineType(d, 'xxl'))).toBe(line(d) * 0.25);
  });
});

describe('canon designs with advanced structure, armor and engines', () => {
  it('are bundled and nearly all build exactly', () => {
    const adv = M.map((e) => decodeMech(e.d)).filter((d) => d.engineType === 'xxl'
      || !['standard', 'endo-steel'].includes(d.structureType) || !['standard', 'ferro-fibrous', 'light-ferro', 'heavy-ferro'].includes(d.armorType));
    expect(adv.length).toBeGreaterThan(100);
    expect(adv.filter((d) => computeMech(d).weights.total === d.tonnage).length / adv.length).toBeGreaterThan(0.95);
    expect(adv.filter((d) => errors(d).length === 0).length / adv.length).toBeGreaterThan(0.9);
  });
});
