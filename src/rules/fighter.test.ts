import { describe, expect, it } from 'vitest';
import fighters from '../data/canon/fighters.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeFighter } from '../data/canonFormat';
import {
  addFighterItem, arcCapacity, computeFighter, fighterEngineRating, fighterEngineWeight, fighterMaxArmor, fighterReadout,
  fighterSI, newFighter, parseFighter, setFighterItemLocation, validateFighter,
} from './fighter';
import type { FighterDesign } from './fighter';
import { fighterBV, fighterCost } from './battleValue';
import { fighterSheetData } from './recordSheet';
import { parseAny, unitTypeOf } from '../ui/storage';

const F = fighters as CanonEntry[];
const canon = (n: string) => decodeFighter(F.find((e) => e.n === n)!.d);
const errors = (d: FighterDesign) => validateFighter(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('fighter construction', () => {
  it('engine rating: tonnage × (safe thrust − 2) for aerospace, tonnage × safe thrust for conventional', () => {
    expect(fighterEngineRating({ fighterType: 'aerospace', tonnage: 50, safeThrust: 6 })).toBe(200);
    expect(fighterEngineRating({ fighterType: 'conventional', tonnage: 20, safeThrust: 6 })).toBe(120);
  });

  it('conventional fighters need 50% shielding on a fusion engine; ICE weighs double', () => {
    expect(fighterEngineWeight({ fighterType: 'aerospace', engineType: 'standard' }, 200)).toBe(8.5);
    expect(fighterEngineWeight({ fighterType: 'conventional', engineType: 'standard' }, 200)).toBe(13);
    expect(fighterEngineWeight({ fighterType: 'conventional', engineType: 'ice' }, 200)).toBe(17);
  });

  it('structural integrity is the greater of safe thrust and a tenth of the tonnage', () => {
    expect(fighterSI({ tonnage: 65, safeThrust: 6 })).toBe(6);
    expect(fighterSI({ tonnage: 100, safeThrust: 5 })).toBe(10);
  });

  it('armor: 8 points per ton (1 for conventional); ferro-aluminum takes weapon slots', () => {
    expect(fighterMaxArmor({ fighterType: 'aerospace', tonnage: 65 })).toBe(520);
    expect(fighterMaxArmor({ fighterType: 'conventional', tonnage: 20 })).toBe(20);
    expect(arcCapacity({ armorType: 'standard' })).toEqual({ NOS: 5, LWG: 5, RWG: 5, AFT: 5 });
    expect(arcCapacity({ armorType: 'ferro-fibrous' })).toEqual({ NOS: 5, LWG: 4, RWG: 4, AFT: 5 });
    expect(arcCapacity({ armorType: 'light-ferro' })).toEqual({ NOS: 5, LWG: 5, RWG: 5, AFT: 4 });
    expect(arcCapacity({ armorType: 'heavy-ferro' })).toEqual({ NOS: 4, LWG: 4, RWG: 4, AFT: 4 });
  });

  it('places weapons in arcs and ammunition in the fuselage', () => {
    let d = newFighter('3025');
    d = addFighterItem(d, 'lrm-20');
    d = addFighterItem(d, 'ammo-lrm-20');
    expect(d.equipment.map((e) => e.location)).toEqual(['NOS', 'FUS']);
    const wrong = setFighterItemLocation(d, d.equipment[1].uid, 'NOS');
    expect(errors(wrong)).toContain('LRM 20 Ammo (6) cannot be mounted in the nose.');
  });

  it('wing weapons must match', () => {
    let d = addFighterItem(newFighter('3025'), 'medium-laser');
    d = setFighterItemLocation(d, d.equipment[0].uid, 'LWG');
    expect(errors(d)).toContain('Left and right wing weapons must match.');
  });

  it('enforces engine and heat sink rules', () => {
    expect(errors({ ...newFighter('3025'), engineType: 'ice' })).toContain('Aerospace fighters need a fusion engine.');
    expect(errors({ ...newFighter('3025'), heatSinks: 8 }).some((m) => /at least 10/.test(m))).toBe(true);
    expect(errors({ ...newFighter('3025'), tonnage: 105 }).some((m) => /5–100 tons/.test(m))).toBe(true);
  });

  it('conventional fighters carry heat sinks for their energy weapons, and power amplifiers with an ICE', () => {
    const d = addFighterItem(newFighter('3025', 'IS', 'conventional'), 'large-laser');
    const s = computeFighter(d);
    expect(s.heatSinks.required).toBe(8);
    expect(s.weights.heatSinks).toBe(8);
    expect(s.weights.powerAmplifiers).toBe(0.5);
  });
});

describe('fighter Battle Value and cost', () => {
  it('Clan fighters and fighters with CASE ignore explosive ammo', () => {
    const d = addFighterItem(addFighterItem(newFighter('3050'), 'lrm-20'), 'ammo-lrm-20');
    const explosive = (x: FighterDesign) => fighterBV(x).lines.find(([l]) => /Explosive/.test(l))?.[1] ?? 0;
    expect(explosive(d)).toBe(-15);
    expect(explosive(addFighterItem(d, 'case'))).toBe(0);
  });

  it('a small cockpit costs 5% of BV', () => {
    const d = addFighterItem(newFighter('3062'), 'medium-laser');
    const b = fighterBV(d);
    expect(fighterBV({ ...d, cockpitType: 'small' }).total).toBe(Math.round((b.defensive + b.offensive) * 0.95));
  });

  it('cost follows the aerospace formula with the (1 + tonnage/200) multiplier', () => {
    const d = newFighter('3025');
    const c = fighterCost(d);
    const lines = Object.fromEntries(c.lines);
    expect(lines.Cockpit).toBe(200000);
    expect(lines.Structure).toBe(50000 * 6);
    expect(lines['× (1 + tonnage/200)']).toBe(1.25);
    expect(fighterCost({ ...d, omni: true }).total).toBe(Math.round(c.total * 1.25));
  });
});

describe('canon fighters', () => {
  it('bundles aerospace, Omni and conventional fighters', () => {
    expect(F.length).toBeGreaterThan(380);
    expect(F.some((e) => e.k === 'omnifighter')).toBe(true);
    expect(F.some((e) => e.k === 'conventional')).toBe(true);
    expect(F.filter((e) => e.w).length / F.length).toBeGreaterThan(0.93);
    expect(F.filter((e) => e.ok).length / F.length).toBeGreaterThan(0.97);
  });

  it('the Shilone SL-17 builds at exactly 65 tons', () => {
    const d = canon('Shilone SL-17');
    const s = computeFighter(d);
    expect(s.weights.total).toBe(65);
    expect(s.rating).toBe(260);
    expect(errors(d)).toEqual([]);
    const sheet = fighterSheetData(d);
    expect(sheet.weapons.find((w) => w.name === 'LRM 20')!.av).toEqual(['12', '12', '12', '—']);
    expect(fighterReadout(d)).toContain('Structural Integrity: 6');
  });

  it('saves and loads as a fighter file', () => {
    const d = canon('Shilone SL-17');
    const back = parseAny(JSON.parse(JSON.stringify(d)));
    expect(unitTypeOf(back)).toBe('fighter');
    expect(parseFighter(JSON.parse(JSON.stringify(d))).equipment.length).toBe(d.equipment.length);
  });
});
