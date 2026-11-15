import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import { addEquipment, computeMech, newDesign, parseDesign, setConfig, setTonnage, setWalkMP, validate } from './index';
import { maximizeArmor, setQuadVeeMotive } from './edit';
import { mechBV, mechCost } from './battleValue';
import { allowedLocations, getEquipment, itemSlots } from './equipment';
import { configurationDesigns } from './omni';
import { cockpitWeight, internalStructure, internalStructureWeight, standardFusionEngineWeight } from './tables';
import { effectiveCockpit } from './types';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = (name: string) => decodeMech((M as CanonEntry[]).find((e) => e.n === name)!.d);

describe('superheavy BattleMechs', () => {
  const sh = () => setWalkMP(setTonnage(newDesign('3081'), 150), 2);

  it('tables: structure points, structure weight, large engines', () => {
    expect(internalStructure(150)).toMatchObject({ HD: 4, CT: 45, LT: 32, LA: 25, LL: 32 });
    expect(internalStructureWeight('standard', 150)).toBe(30); // 20%
    expect(internalStructureWeight('endo-steel', 150)).toBe(15); // 10%
    expect(internalStructureWeight('industrial', 150)).toBe(60); // 40%
    expect(standardFusionEngineWeight(450)).toBe(133.5);
  });

  it('switching to superheavy tonnage fits a superheavy gyro and halves slot counts', () => {
    const d = sh();
    expect(d.gyroType).toBe('superheavy');
    const s = computeMech(d);
    expect(s.weightClass).toBe('Superheavy');
    expect(s.weights.gyro).toBe(6); // rating 300: 3 × 2
    expect(s.slots.CT.slots.filter((x) => x.label === 'Superheavy Gyro')).toHaveLength(2);
    expect(s.slots.CT.slots.filter((x) => x.label === 'Fusion Engine')).toHaveLength(3);
    expect(s.weights.cockpit).toBe(4);
    expect(effectiveCockpit(d)).toBe('superheavy');
    expect(s.armorMax.HD).toBe(12);
    // Equipment takes half its slots, rounded up.
    expect(itemSlots(getEquipment('ac-20')!, d)).toBe(5);
    expect(itemSlots(getEquipment('medium-laser')!, d)).toBe(1);
    expect(setTonnage(d, 100).gyroType).toBe('standard');
  });

  it('two tons of the same ammunition share a slot', () => {
    let d = addEquipment(addEquipment(addEquipment(sh(), 'ac-20', 'RT'), 'ammo-ac-20', 'RT'), 'ammo-ac-20', 'RT');
    d = addEquipment(d, 'ammo-ac-20', 'RT');
    const rt = computeMech(d).slots.RT.slots.filter((x) => x.kind === 'item' && x.label !== 'Heat Sink');
    expect(rt.filter((x) => /×2/.test(x.label))).toHaveLength(1);
    expect(rt).toHaveLength(5 + 2); // AC/20 in 5 slots, 3 tons of ammo in 2
  });

  it('restrictions: no jump jets, superheavy gyro required, BattleMechs from the Jihad', () => {
    expect(errors(addEquipment(sh(), 'jump-jet', 'LL')).some((m) => /may not mount Jump Jet/.test(m))).toBe(true);
    expect(errors({ ...sh(), gyroType: 'standard' })).toContain("Superheavy 'Mechs must use a superheavy gyro.");
    expect(errors({ ...sh(), era: '3050' }).some((m) => /Superheavy BattleMechs cannot be used/.test(m))).toBe(true);
    expect(errors({ ...newDesign('3081'), gyroType: 'superheavy' }).some((m) => /Only superheavy/.test(m))).toBe(true);
  });

  it('canon superheavies are legal and weigh their tonnage', () => {
    for (const n of ['Omega SHP-4X', 'Orca OC-1X']) {
      const d = canon(n);
      expect(computeMech(d).weights.total).toBe(d.tonnage);
      expect(errors(d)).toEqual([]);
    }
    expect(mechCost(canon('Omega SHP-4X')).total).toBeGreaterThan(0);
  });
});

describe('tripods', () => {
  const tri = () => maximizeArmor(setConfig({ ...newDesign('3081'), tonnage: 75, walkMP: 4 }, 'tripod'));

  it('a center leg with leg structure, armor and slots; 10% heavier structure; tripod cockpit', () => {
    const d = tri();
    const s = computeMech(d);
    expect(s.structure!.CL).toBe(16);
    expect(s.armorMax.CL).toBe(32);
    expect(d.armor.CL).toBeGreaterThan(0);
    expect(s.slots.CL.slots.map((x) => x.label).slice(0, 4)).toEqual(['Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator']);
    expect(s.weights.structure).toBe(8.5); // 7.5 × 1.1 = 8.25 → 8.5
    expect(s.weights.cockpit).toBe(4);
    expect(allowedLocations(getEquipment('jump-jet')!, d)).toContain('CL');
    expect(errors(d).filter((m) => !/unused|not allocated/.test(m))).toEqual([]);
  });

  it('leaving tripod drops the center leg', () => {
    const d = setConfig(tri(), 'biped');
    expect(d.armor.CL).toBe(0);
    expect(computeMech(d).slots.CL.capacity).toBe(0);
  });

  it('superheavy tripod cockpit weighs 5 tons; costs more than a biped', () => {
    const d = setTonnage(tri(), 135);
    expect(effectiveCockpit(d)).toBe('superheavy-tripod');
    expect(cockpitWeight(effectiveCockpit(d))).toBe(5);
    expect(mechCost(tri()).total).toBeGreaterThan(mechCost(setConfig(tri(), 'biped')).total);
  });

  it('canon tripods (including the Ares OmniMech) are legal', () => {
    const tk = canon('Triskelion TRK-4V');
    expect(tk.config).toBe('tripod');
    expect(errors(tk)).toEqual([]);
    const ares = canon('Ares');
    expect(ares.tonnage).toBe(135);
    for (const c of configurationDesigns(ares)) expect(computeMech(c.design).weights.total).toBe(135);
    expect(errors(ares)).toEqual([]);
    expect(mechBV(ares).total).toBeGreaterThan(2000);
    expect(decodeMech(encodeMech(tk)).armor.CL).toBe(tk.armor.CL);
    expect(parseDesign(JSON.parse(JSON.stringify(tk))).config).toBe('tripod');
  });
});

describe('QuadVees', () => {
  const qv = () => setConfig({ ...newDesign('3151', 'Clan'), tonnage: 60, walkMP: 5 }, 'quadvee');

  it('conversion gear in every leg, 10% conversion equipment, tracks by default, QuadVee cockpit', () => {
    const d = qv();
    const s = computeMech(d);
    for (const l of ['LA', 'RA', 'LL', 'RL'] as const) expect(s.slots[l].slots[4].label).toBe('Conversion Gear');
    expect(s.weights.conversion).toBe(6);
    expect(d.equipment.filter((e) => e.equipmentId === 'tracks')).toHaveLength(4);
    expect(effectiveCockpit(d)).toBe('quadvee');
    expect(s.slots.HD.slots.filter((x) => x.label === 'Cockpit')).toHaveLength(2);
    expect(errors(d).filter((m) => /QuadVee|motive|Wheels/.test(m))).toEqual([]);
  });

  it('wheels weigh 15% and must match the motive; Clan, from 3130', () => {
    const w = setQuadVeeMotive(qv(), 'wheeled');
    expect(w.equipment.filter((e) => e.equipmentId === 'quadvee-wheels')).toHaveLength(4);
    expect(computeMech(w).weights.equipment).toBe(9);
    expect(errors({ ...w, quadVeeMotive: 'tracked' })).toContain('The QuadVee motive gear does not match its motive type.');
    expect(errors({ ...qv(), era: '3101' }).some((m) => /QuadVees cannot be used/.test(m))).toBe(true);
    expect(mechCost(qv()).lines.some(([l]) => l === 'QuadVee conversion')).toBe(true);
  });

  it('canon QuadVees are legal', () => {
    const arion = canon('Arion');
    expect(arion.config).toBe('quadvee');
    expect(arion.quadVeeMotive).toBe('tracked');
    expect(computeMech(arion).weights.total).toBe(35);
    expect(errors(arion)).toEqual([]);
  });
});
