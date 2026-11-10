import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { computeMech } from './construction';
import { addEquipment, newDesign, removeEquipment, setActuator, setConfig, setMyomer, setTonnage } from './edit';
import { allowedLocations, getEquipment, itemSlots, itemWeight } from './equipment';
import { meleeBV, meleeCost, meleeDamage } from './melee';
import { addConfiguration, setOmni, switchConfiguration } from './omni';
import { validate } from './validation';
import { mechBV } from './battleValue';
import { mechSheetData } from './recordSheet';
import type { MechDesign } from './types';

const M = mechs as CanonEntry[];
const canon = (n: string) => decodeMech(M.find((e) => e.n === n)!.d);
const at = (tonnage: number): MechDesign => ({ ...setTonnage(newDesign('3081'), tonnage), era: '3081' });
const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const stats = (id: string, d: MechDesign) => {
  const eq = getEquipment(id)!;
  return { tons: itemWeight(eq, d), slots: itemSlots(eq, d), dmg: meleeDamage(eq.melee!, d.tonnage), bv: meleeBV(eq.melee!, d), cost: meleeCost(eq.melee!, d) };
};

describe('melee weapons', () => {
  it('scale with tonnage (TechManual / Tactical Operations formulas)', () => {
    expect(stats('hatchet', at(45))).toEqual({ tons: 3, slots: 3, dmg: '9', bv: 13.5, cost: 15000 });
    expect(stats('sword', at(50))).toMatchObject({ tons: 2.5, slots: 4, dmg: '6', cost: 25000 });
    expect(stats('sword', at(50)).bv).toBeCloseTo(10.35);
    expect(stats('mace', at(80))).toMatchObject({ tons: 8, slots: 8, dmg: '20', bv: 20, cost: 130000 });
    expect(stats('claw', at(55))).toMatchObject({ tons: 4, slots: 4, dmg: '8', cost: 11000 });
    expect(stats('retractable-blade', at(50))).toMatchObject({ tons: 3, slots: 4, dmg: '5', cost: 40000 });
    expect(stats('chain-whip', at(50))).toMatchObject({ tons: 3, slots: 2, bv: 5.175, cost: 120000 });
    expect(stats('spikes', at(50))).toMatchObject({ tons: 0.5, slots: 1, bv: 4, cost: 2500 });
  });

  it('Triple-Strength Myomer doubles melee BV', () => {
    const d = at(50);
    expect(meleeBV('hatchet', setMyomer(d, 'tsm'))).toBe(2 * meleeBV('hatchet', d));
  });

  it('hatchets, swords and maces need lower arm and hand actuators', () => {
    let d = addEquipment(at(50), 'hatchet', 'RA');
    expect(errors(d).filter((m) => /Hatchet/.test(m))).toEqual([]);
    d = setActuator(d, 'RA', 'hand', false);
    expect(errors(d)).toContain('Right Arm: a Hatchet needs lower arm and hand actuators.');
  });

  it('a claw replaces the hand actuator', () => {
    let d = addEquipment(at(50), 'claw', 'LA');
    expect(errors(d)).toContain('Left Arm: a claw replaces the hand actuator; remove the hand.');
    d = setActuator(d, 'LA', 'hand', false);
    expect(errors(d).filter((m) => /claw/.test(m))).toEqual([]);
  });

  it('only one melee weapon per arm, and none on a quad', () => {
    const d = addEquipment(addEquipment(at(80), 'hatchet', 'RA'), 'retractable-blade', 'RA');
    expect(errors(d).some((m) => /only one melee weapon/.test(m))).toBe(true);
    expect(allowedLocations(getEquipment('hatchet')!, setConfig(at(50), 'quad'))).toEqual([]);
  });

  it('talons are fitted to every leg as one set', () => {
    const biped = addEquipment({ ...at(75), techBase: 'Clan' }, 'talons');
    const t = biped.equipment.filter((e) => e.equipmentId === 'talons');
    expect(t.map((e) => e.location)).toEqual(['LL', 'RL']);
    expect(computeMech(biped).weights.equipment).toBe(5); // 75 / 15
    expect(errors(biped).filter((m) => /Talons/.test(m))).toEqual([]);
    expect(removeEquipment(biped, t[0].uid).equipment.some((e) => e.equipmentId === 'talons')).toBe(false);
    const quad = addEquipment(setConfig({ ...at(75), techBase: 'Clan' }, 'quad'), 'talons');
    expect(quad.equipment.filter((e) => e.equipmentId === 'talons').map((e) => e.location)).toEqual(['LA', 'RA', 'LL', 'RL']);
  });

  it('melee weapons add to offensive BV', () => {
    const d = at(50);
    expect(mechBV(addEquipment(d, 'sword', 'RA')).offensive).toBeGreaterThan(mechBV(d).offensive);
  });

  it('the canon Hatchetman HCT-3F converts with its hatchet', () => {
    const d = canon('Hatchetman HCT-3F');
    expect(d.era).toBe('3025');
    expect(computeMech(d).weights.total).toBe(45);
    expect(errors(d)).toEqual([]);
    expect(mechBV(d).total).toBe(854);
    const hatchet = mechSheetData(d).weapons.find((w) => w.name === 'Hatchet')!;
    expect(hatchet).toMatchObject({ location: 'RA', damage: '9', heat: '—' });
  });

  it('bundles canon mechs with melee weapons', () => {
    const melee = M.filter((e) => JSON.stringify(e.d).match(/"(hatchet|sword|mace|claw|retractable-blade)"/));
    expect(melee.length).toBeGreaterThan(80);
    expect(melee.filter((e) => e.ok).length / melee.length).toBeGreaterThan(0.9);
  });
});

describe('OmniMech arm actuators per configuration', () => {
  it('each configuration keeps its own lower arm and hand actuators', () => {
    let d = setOmni(newDesign('3050'), true);
    d = addConfiguration(d, true, 'A');
    d = setActuator(d, 'RA', 'hand', false);
    const prime = switchConfiguration(d, 0);
    expect(prime.actuators.RA.hand).toBe(true);
    expect(switchConfiguration(prime, 1).actuators.RA.hand).toBe(false);
  });
});
