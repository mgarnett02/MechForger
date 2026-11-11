import { describe, expect, it } from 'vitest';
import INF from '../data/canon/infantry.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeInfantry } from '../data/canonFormat';
import type { InfantryDesign } from './infantry';
import {
  computeInfantry, damagePerTrooper, damageTable, infantryBV, infantryCost, infantryReadout, maxPlatoon, maxSecondary,
  maxSquadSize, maxSquads, newInfantry, parseInfantry, validateInfantry,
} from './infantry';
import { parseAny, unitTypeOf } from '../ui/storage';
import { getMM } from './mmEquipment';

const I = INF as CanonEntry[];
const canon = (n: string) => decodeInfantry(I.find((e) => e.n === n)!.d);
const errors = (d: InfantryDesign) => validateInfantry(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('conventional infantry construction', () => {
  it('a 28-trooper foot rifle platoon weighs 2.5 tons (0.085 t per trooper, rounded up)', () => {
    const d = newInfantry('3025');
    const s = computeInfantry(d);
    expect(s.troopers).toBe(28);
    expect(s.weight).toBe(2.5);
    expect(computeInfantry({ ...d, motion: 'motorized' }).weight).toBe(5.5); // 28 × 0.195
    expect(computeInfantry({ ...d, antiMek: true }).exactWeight).toBeCloseTo(28 * 0.1);
  });

  it('platoon limits depend on the motive type and specializations', () => {
    const d = newInfantry('3025');
    expect(maxSquadSize({ ...d, motion: 'wheeled' })).toBe(6);
    expect(maxSquads({ ...d, motion: 'tracked' })).toBe(4);
    expect(maxPlatoon({ ...d, motion: 'hover' })).toBe(20);
    expect(maxSecondary({ ...d, specializations: ['demo-engineers'] })).toBe(0);
    expect(maxSquads({ ...d, specializations: ['paratroops'] })).toBe(3);
    expect(errors({ ...d, motion: 'hover' }).some((m) => /squad size is 5/.test(m))).toBe(true);
  });

  it('primary damage is capped at 0.6; secondaries replace riflemen', () => {
    const mg = getMM('Machine Gun (Portable)')!;
    const d = { ...newInfantry('3025'), secondary: mg.id, secondaryPerSquad: 2 };
    expect(damagePerTrooper(d)).toBeCloseTo((0.52 * 5 + mg.infantryDamage! * 2) / 7);
    expect(damageTable(newInfantry('3025'))[27]).toBe(Math.round(0.52 * 28));
  });

  it('secondary weapon crews must fit in the squad; mechanized troops cannot take anti-Mech training', () => {
    const d = newInfantry('3025');
    expect(errors({ ...d, motion: 'wheeled', squadSize: 6, antiMek: true })).toContain('Mechanized infantry may not take anti-\'Mech training.');
    expect(errors({ ...d, secondary: null, secondaryPerSquad: 2 }).some((m) => /secondary weapon/.test(m))).toBe(true);
  });
});

describe('infantry Battle Value and cost', () => {
  it('BV counts troopers × 1.5 × damage divisor, weapons per shooter (twice for anti-Mech), times speed', () => {
    const d = newInfantry('3025');
    const b = infantryBV(d);
    expect(b.defensive).toBeCloseTo(28 * 1.5 * 1 * 1.0); // foot: TMM 0
    expect(b.total).toBe(Math.round(b.defensive + b.offensive));
    expect(infantryBV({ ...d, specializations: ['marines'] }).total).toBe(Math.round(b.total * 1.3));
  });

  it('cost: √weapon cost × 2,000 per trooper plus kits, times the motive multiplier', () => {
    const d = newInfantry('3025');
    const c = infantryCost(d);
    expect(c.total).toBe(Math.round(28 * Math.sqrt(80) * 2000 + 28 * 330));
    expect(infantryCost({ ...d, motion: 'jump' }).total).toBe(Math.round((28 * Math.sqrt(80) * 2000 + 28 * 330) * 2.6));
  });
});

describe('canon infantry', () => {
  it('bundles canon platoons, nearly all legal', () => {
    expect(I.length).toBeGreaterThan(1700);
    expect(I.filter((e) => e.ok).length / I.length).toBeGreaterThan(0.97);
    expect(I.some((e) => e.k === 'beast')).toBe(true);
  });

  it('Foot Platoon (Rifle) loads, saves and reads out', () => {
    const d = canon('Foot Platoon (Rifle)');
    expect(errors(d)).toEqual([]);
    const back = parseAny(JSON.parse(JSON.stringify(d)));
    expect(unitTypeOf(back)).toBe('infantry');
    expect(parseInfantry(JSON.parse(JSON.stringify(d))).primary).toBe(d.primary);
    expect(infantryReadout(d)).toContain('Platoon: 4 squads of 7');
  });
});
