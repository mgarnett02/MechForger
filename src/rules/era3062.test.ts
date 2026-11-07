import { describe, expect, it } from 'vitest';
import {
  addEquipment, armorPointsPerTon, armorTonnage, autoAllocate, computeMech, designStatus, engineWeight,
  getEquipment, gyroWeightFor, isEquipmentAvailable, itemWeight, newDesign, setArmorType, setCockpitType,
  setEngineType, setGyroType, setMixedTech, setTechBase, technicalReadout, validate, ERAS, parseDesign,
} from './index';
import type { MechDesign } from './types';
import { PRESETS } from '../data/canonical';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const is3062 = () => newDesign('3062');
const eq = (id: string) => getEquipment(id)!;

describe('Civil War construction tables', () => {
  it('is selectable', () => {
    expect(ERAS.find((e) => e.id === '3062')?.available).toBe(true);
  });

  it('Light engine: 75% of standard, rounded up to the half ton; 2 slots per side torso', () => {
    expect(engineWeight('light', 300)).toBe(14.5);
    expect(engineWeight('light', 200)).toBe(6.5); // 8.5 × 0.75 = 6.375
    expect(engineWeight('light', 400)).toBe(39.5); // 52.5 × 0.75 = 39.375
    const d = setEngineType(is3062(), 'light');
    expect(computeMech(d).slots.LT.slots.slice(0, 2).map((s) => s.label)).toEqual(['Light Fusion Engine', 'Light Fusion Engine']);
    expect(computeMech(d).slots.LT.slots[2].label).not.toBe('Light Fusion Engine');
  });

  it('gyros: XL half weight / 6 slots, heavy-duty double weight / 4 slots', () => {
    expect(gyroWeightFor('standard', 300)).toBe(3);
    expect(gyroWeightFor('xl', 300)).toBe(1.5);
    expect(gyroWeightFor('xl', 200)).toBe(1);
    expect(gyroWeightFor('heavy-duty', 300)).toBe(6);
    const xl = computeMech(setGyroType(is3062(), 'xl'));
    expect(xl.slots.CT.free).toBe(0);
    expect(xl.slots.CT.slots.filter((s) => s.label === 'XL Gyro')).toHaveLength(6);
    expect(computeMech(setGyroType(is3062(), 'heavy-duty')).slots.CT.free).toBe(2);
  });

  it('small cockpit: 2 tons, frees two head slots', () => {
    const d = computeMech(setCockpitType(is3062(), 'small'));
    expect(d.weights.cockpit).toBe(2);
    expect(d.slots.HD.free).toBe(2);
    expect(d.slots.HD.slots.slice(0, 4).map((s) => s.label)).toEqual(['Life Support', 'Sensors', 'Small Cockpit', 'Sensors']);
  });

  it('Light Ferro-Fibrous: ×1.06 points per ton, 7 slots', () => {
    const ppt = armorPointsPerTon('light-ferro', 'IS');
    expect(ppt).toBeCloseTo(16.96);
    expect(armorTonnage(169, ppt)).toBe(10);
    expect(armorTonnage(170, ppt)).toBe(10.5);
    const d = setArmorType(is3062(), 'light-ferro');
    expect(d.equipment.filter((e) => e.equipmentId === 'ferro-fibrous')).toHaveLength(7);
  });
});

describe('Civil War availability', () => {
  it('new components are illegal before 3062', () => {
    const d = setCockpitType(setGyroType(setEngineType(newDesign('3050'), 'light'), 'xl'), 'small');
    const e = errors(d);
    expect(e).toContain('Light engines cannot be used in the Clan Invasion era.');
    expect(e).toContain('XL gyros cannot be used in the Clan Invasion era.');
    expect(e).toContain('Small cockpits cannot be used in the Clan Invasion era.');
  });

  it('IS-only components need mixed tech on Clan designs', () => {
    const clan = setGyroType(setTechBase(newDesign('3062', 'Clan'), 'Clan'), 'xl');
    expect(errors(clan).some((m) => m.startsWith('XL gyros: Inner Sphere technology only'))).toBe(true);
    expect(errors(setMixedTech(clan, true)).some((m) => m.startsWith('XL gyros'))).toBe(false);
  });

  it('Civil War weapons', () => {
    expect(isEquipmentAvailable(eq('rac-5'), '3050', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('rac-5'), '3062', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('targeting-computer'), '3062', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('improved-c3'), '3062', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('inarc'), '3062', 'Clan')).toBe(false);
    // Introduced in the late 3050s, so already available in the Clan Invasion era.
    expect(isEquipmentAvailable(eq('light-gauss-rifle'), '3050', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('clan-medium-heavy-laser'), '3050', 'Clan')).toBe(true);
    expect(eq('ammo-clan-heavy-machine-gun-half')).toMatchObject({ tons: 0.5, ammoFor: 'clan-heavy-machine-gun' });
  });

  it('IS targeting computer: 1 ton per 4 tons of direct-fire weapons', () => {
    let d = addEquipment(is3062(), 'rac-5', 'RA');
    d = addEquipment(d, 'er-large-laser', 'LA');
    expect(itemWeight(eq('targeting-computer'), d)).toBe(4); // 15 / 4 = 3.75
  });
});

describe('Civil War samples', () => {
  for (const p of PRESETS.filter((x) => x.era === '3062')) {
    it(`${p.key} is exactly at tonnage and fully legal`, () => {
      const d = p.build();
      expect(computeMech(d).weights.total).toBe(d.tonnage);
      expect(errors(d)).toEqual([]);
      expect(designStatus(validate(d))).toBe('legal');
    });
  }

  it('Bulwark readout names the new components', () => {
    const text = technicalReadout(PRESETS.find((p) => p.key.startsWith('Bulwark'))!.build());
    expect(text).toContain('Engine: 300 Light');
    expect(text).toContain('Gyro: XL');
  });

  it('auto-allocate works with a full centre torso', () => {
    let d = setArmorType(setGyroType(is3062(), 'xl'), 'light-ferro');
    d = autoAllocate(d);
    expect(computeMech(d).unallocated).toHaveLength(0);
    expect(errors(d)).toEqual([]);
  });

  it('older files load with standard gyro and cockpit', () => {
    const { gyroType: _g, cockpitType: _c, ...old } = PRESETS[0].build();
    expect(parseDesign(JSON.parse(JSON.stringify(old)))).toMatchObject({ gyroType: 'standard', cockpitType: 'standard' });
  });
});
