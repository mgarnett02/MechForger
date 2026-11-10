import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { computeMech, fixedSlots, lamConversionWeight } from './construction';
import {
  addEquipment, newDesign, parseDesign, setConfig, setEngineType, setJumpMP, setLam, setStructureType, setTonnage,
  setWalkMP,
} from './edit';
import { validate } from './validation';
import { mechBV, mechCost } from './battleValue';
import { technicalReadout } from './readout';
import type { MechDesign } from './types';

const M = mechs as CanonEntry[];
const canon = (n: string) => decodeMech(M.find((e) => e.n === n)!.d);
const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
/** A 50-ton walk 5 / jump 5 standard LAM. */
const lam = () => setJumpMP(setWalkMP(setLam(newDesign('3025'), 'standard'), 5), 5);

describe("Land-Air 'Mechs", () => {
  it('conversion equipment weighs 10% of tonnage (15% bimodal), rounded up', () => {
    expect(lamConversionWeight({ tonnage: 30, lam: 'standard' })).toBe(3);
    expect(lamConversionWeight({ tonnage: 55, lam: 'standard' })).toBe(6);
    expect(lamConversionWeight({ tonnage: 55, lam: 'bimodal' })).toBe(9);
    expect(lamConversionWeight({ tonnage: 55, lam: null })).toBe(0);
    expect(computeMech(lam()).weights.conversion).toBe(5);
  });

  it('avionics and landing gear take the first open slots', () => {
    const d = lam();
    expect(fixedSlots(d, 'HD')[3]).toBe('Avionics');
    expect(fixedSlots(d, 'LT').slice(0, 2)).toEqual(['Landing Gear', 'Avionics']);
    expect(fixedSlots(d, 'RT').slice(0, 2)).toEqual(['Landing Gear', 'Avionics']);
    expect(fixedSlots(d, 'CT')[10]).toBe('Landing Gear');
  });

  it('works out AirMech and fighter movement', () => {
    const s = computeMech(lam());
    expect(s.lam).toEqual({ airMech: { walk: 2, run: 3, cruise: 15, flank: 23 }, fighter: { safe: 5, max: 8 } });
    expect(computeMech(setLam(lam(), 'bimodal')).lam!.airMech).toBeNull();
  });

  it('enforces the LAM construction limits', () => {
    expect(errors(setEngineType(lam(), 'xl')).some((m) => /standard or compact fusion/.test(m))).toBe(true);
    expect(errors(setStructureType({ ...lam(), era: '3050' }, 'endo-steel')).some((m) => /Endo Steel/.test(m))).toBe(true);
    expect(errors(setTonnage(lam(), 60)).some((m) => /more than 55 tons/.test(m))).toBe(true);
    expect(errors(setJumpMP(lam(), 2)).some((m) => /at least 3 jumping MP/.test(m))).toBe(true);
    expect(errors({ ...lam(), techBase: 'Clan' }).some((m) => /Inner Sphere technology/.test(m))).toBe(true);
    expect(errors(addEquipment(lam(), 'hatchet', 'RA')).some((m) => /no physical weapons/.test(m))).toBe(true);
  });

  it('bomb bays and LAM fuel tanks are LAM-only', () => {
    expect(errors(addEquipment(lam(), 'bomb-bay', 'LT')).filter((m) => /Bomb Bay/.test(m))).toEqual([]);
    expect(errors(addEquipment(newDesign(), 'bomb-bay', 'LT'))).toContain("Bomb Bay can only be fitted to a Land-Air 'Mech.");
  });

  it('only bipeds can be LAMs', () => {
    expect(setConfig(lam(), 'quad').lam).toBeNull();
    expect(setLam(setConfig(newDesign(), 'quad'), 'standard').config).toBe('biped');
  });

  it('saves and loads the LAM type', () => {
    expect(parseDesign(JSON.parse(JSON.stringify(lam()))).lam).toBe('standard');
    const raw = JSON.parse(JSON.stringify(newDesign()));
    expect(parseDesign(raw).lam).toBeNull();
  });

  it('adds the conversion surcharge to cost', () => {
    const lines = Object.fromEntries(mechCost(lam()).lines);
    expect(lines['LAM conversion (standard)']).toBe((lines['Internal structure'] + lines['Weapons & equipment']) * 0.75);
  });

  it('bundles the canon LAMs', () => {
    const lams = M.filter((e) => e.k === 'lam');
    expect(lams.length).toBeGreaterThanOrEqual(19);
    expect(lams.every((e) => e.w && e.ok)).toBe(true);
    expect(lams.some((e) => decodeMech(e.d).lam === 'bimodal')).toBe(true);
  });

  it('the Phoenix Hawk LAM PHX-HK2 builds at its canon weight', () => {
    const d = canon('Phoenix Hawk LAM PHX-HK2');
    const s = computeMech(d);
    expect(d.lam).toBe('standard');
    expect(s.weights.conversion).toBe(5);
    expect(s.weights.total).toBe(50);
    expect(errors(d)).toEqual([]);
    expect(mechBV(d).total).toBeGreaterThan(mechBV({ ...d, lam: null }).total); // AirMech speed raises BV
    expect(technicalReadout(d)).toContain("Configuration: Land-Air 'Mech (Standard)");
  });
});

describe('Full Head Ejection System', () => {
  it('adds 1,725,000 C-bills (canon Hatchetman)', () => {
    const d = canon('Hatchetman HCT-3F');
    expect(d.fullHeadEjection).toBe(true);
    expect(Object.fromEntries(mechCost(d).lines)['Full Head Ejection System']).toBe(1725000);
  });
});
