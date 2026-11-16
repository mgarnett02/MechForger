import { describe, expect, it } from 'vitest';
import S from '../data/canon/stationary.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeStationary } from '../data/canonFormat';
import {
  addStationaryItem, computeStationary, newStationary, parseStationary, setStationaryKind, stationaryBV, stationaryCost,
  validateStationary,
} from './stationary';
import type { StationaryDesign } from './stationary';

const errors = (d: StationaryDesign) => validateStationary(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = (n: string) => decodeStationary((S as CanonEntry[]).find((e) => e.n === n)!.d);

describe('handheld weapons (as MegaMek TestHandheldWeapon)', () => {
  it('armor 16 points per ton, one-ton heat sinks, ammo by the shot, total to the half ton', () => {
    let d = { ...newStationary('3062', 'IS', 'handheld'), tonnage: 6, armor: 32 };
    d = addStationaryItem(d, 'medium-laser');
    const s = computeStationary(d);
    expect(s.weights.armor).toBe(2);
    expect(s.heatSinks).toBe(3);
    expect(s.weights.total).toBe(6);
    expect(errors(d)).toEqual([]);
    const lrm = addStationaryItem(addStationaryItem({ ...newStationary('3062', 'IS', 'handheld'), tonnage: 6 }, 'lrm-10'), 'ammo-lrm-10');
    expect(lrm.equipment[1].shots).toBe(12);
    expect(computeStationary(lrm).weights.equipment).toBe(6);
    // A second bin of the same ammunition adds shots instead.
    expect(addStationaryItem(lrm, 'ammo-lrm-10').equipment[1].shots).toBe(24);
  });

  it('six items at most; one ammo bin per kind', () => {
    let d = { ...newStationary('3062', 'IS', 'handheld'), tonnage: 10 };
    for (let k = 0; k < 7; k++) d = addStationaryItem(d, 'machine-gun');
    expect(errors(d).some((m) => /up to 6 items/.test(m))).toBe(true);
  });

  it('BV is armor × 2 + weapons + ammo by weight; cost is twice the equipment', () => {
    const d = canon('Light Laser Weapon');
    expect(computeStationary(d).weights.total).toBe(d.tonnage);
    const bv = stationaryBV(d);
    expect(bv.defensive).toBe(64);
    expect(bv.total).toBe(64 + 46); // medium laser BV 46
    expect(stationaryCost(d).total).toBe(2 * 40000);
    expect(errors(canon('Heavy LRM Weapon'))).toEqual([]);
  });
});

describe('gun emplacements', () => {
  it('BV: defensive equipment × 0.5, offense × 0.44; legal canon turrets', () => {
    let d = newStationary('3025');
    d = addStationaryItem(addStationaryItem(d, 'ac-20'), 'ammo-ac-20');
    const bv = stationaryBV(d);
    expect(bv.offensive).toBeCloseTo((178 + 22) * 0.44, 5);
    expect(errors(d)).toEqual([]);
    expect(parseStationary(JSON.parse(JSON.stringify(d))).equipment).toHaveLength(2);
    const hh = setStationaryKind(d, 'handheld');
    expect(hh.equipment[1].shots).toBe(5);
    expect((S as CanonEntry[]).filter((e) => e.k === 'emplacement').length).toBeGreaterThan(600);
  });
});
