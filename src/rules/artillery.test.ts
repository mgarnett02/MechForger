import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import vehicles from '../data/canon/vehicles.json';
import infantry from '../data/canon/infantry.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { addEquipment, computeMech, getEquipment, isDirectFire, itemWeight, mechBV, newDesign, shortEquipmentName, validate } from './index';
import { computeInfantry, newInfantry, validateInfantry } from './infantry';
import { AERO_AV } from './aeroAV';

const has = (list: unknown, id: string) => (list as CanonEntry[]).some((e) => JSON.stringify(e.d).includes(`"${id}"`));

describe('artillery', () => {
  it('tube and missile artillery carry MegaMek weights, slots, heat and ammo', () => {
    expect(getEquipment('arrow-iv')).toMatchObject({ tons: 15, slots: 15, heat: 10, ammoPerTon: 5, artillery: true });
    expect(getEquipment('arrow-iv')!.range).toBeUndefined(); // range is in mapsheets
    expect(getEquipment('clan-arrow-iv')).toMatchObject({ tons: 12, slots: 12, techBase: 'Clan' });
    expect(getEquipment('long-tom')).toMatchObject({ tons: 30, slots: 30, heat: 20 });
    expect(getEquipment('thumper')).toMatchObject({ tons: 15, ammoPerTon: 20 });
    expect(getEquipment('ammo-sniper')).toMatchObject({ tons: 1, ammoFor: 'sniper' });
  });

  it('artillery cannons fire directly too, from the Jihad era', () => {
    expect(getEquipment('sniper-cannon')).toMatchObject({ tons: 15, slots: 10, firstEra: '3068', range: { min: 2, short: 4, medium: 8, long: 12 } });
    expect(AERO_AV['long-tom-cannon']).toEqual([20, 20, 20, 0]);
  });

  it('artillery, flamers and machine guns do not size a targeting computer', () => {
    expect(isDirectFire(getEquipment('sniper-cannon')!)).toBe(false);
    expect(isDirectFire(getEquipment('flamer')!)).toBe(false);
    expect(isDirectFire(getEquipment('machine-gun')!)).toBe(false);
    expect(isDirectFire(getEquipment('lac-5')!)).toBe(true);
    const d = addEquipment(addEquipment(newDesign('3068'), 'lac-5', 'RT'), 'targeting-computer', 'LT');
    expect(itemWeight(getEquipment('targeting-computer')!, d)).toBe(2);
  });

  it('a platoon may carry only one field artillery piece, crewed by one trooper per ton', () => {
    const d = { ...newInfantry('3025'), motion: 'motorized' as const, fieldGuns: [{ uid: 'a', equipmentId: 'thumper', ammoTons: 1 }] };
    expect(computeInfantry(d).fieldGunCrew).toBe(15);
    expect(validateInfantry({ ...d, fieldGuns: [...d.fieldGuns, { uid: 'b', equipmentId: 'thumper' }] }).some((i) => /one field artillery/.test(i.message))).toBe(true);
  });
});

describe('light autocannons and rocket launchers', () => {
  it('light ACs use ammunition; rocket launchers are one-shot', () => {
    expect(getEquipment('lac-2')).toMatchObject({ tons: 4, slots: 1, ammoPerTon: 45, firstEra: '3062' });
    expect(getEquipment('ammo-lac-5')).toBeDefined();
    expect(getEquipment('rl-20')).toMatchObject({ tons: 1.5, slots: 3, heat: 5 });
    expect(getEquipment('ammo-rl-20')).toBeUndefined();
    expect(shortEquipmentName(getEquipment('rl-15')!, { mixedTech: false })).toBe('RL 15');
  });

  it('count in BV and build into legal designs', () => {
    const d = addEquipment(addEquipment(newDesign('3068'), 'rl-10', 'LT'), 'lac-2', 'RT');
    expect(validate(d).filter((i) => i.severity === 'error')).toEqual([]);
    expect(mechBV(d).total).toBeGreaterThan(mechBV(newDesign('3068')).total);
    expect(computeMech(d).weights.equipment).toBe(4.5);
  });
});

describe('canon units with the new weapons', () => {
  it('include artillery vehicles, field artillery platoons, and LAC / RL armed Mechs', () => {
    expect(has(vehicles, 'long-tom')).toBe(true);
    expect(has(infantry, 'thumper')).toBe(true);
    expect(has(mechs, 'lac-5')).toBe(true);
    expect(has(mechs, 'rl-10')).toBe(true);
    const k = decodeMech((mechs as CanonEntry[]).find((e) => e.n === 'Koschei KSC-6L')!.d);
    expect(computeMech(k).weights.free).toBe(0);
  });
});
