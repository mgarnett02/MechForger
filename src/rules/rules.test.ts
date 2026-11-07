import { describe, expect, it } from 'vitest';
import {
  addEquipment, computeMech, distributeArmor, gyroWeight, internalStructure, isValid,
  maxTotalArmor, newDesign, setActuator, setEngineHeatSinks, setHeatSinkTotal, setItemLocation,
  setItemRear, setJumpMP, setTonnage, setWalkMP, standardFusionEngineWeight, technicalReadout,
  totalArmorPoints, validate, parseDesign, ERAS, designStatus, DEFAULT_ERA,
} from './index';
import type { MechDesign } from './types';
import { PRESETS } from '../data/canonical';

const preset = (key: string) => PRESETS.find((p) => p.key === key)!.build();
const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('tables', () => {
  it('standard fusion engine weights', () => {
    expect(standardFusionEngineWeight(100)).toBe(3);
    expect(standardFusionEngineWeight(160)).toBe(6);
    expect(standardFusionEngineWeight(200)).toBe(8.5);
    expect(standardFusionEngineWeight(300)).toBe(19);
    expect(standardFusionEngineWeight(400)).toBe(52.5);
    expect(standardFusionEngineWeight(405)).toBeNull();
    expect(standardFusionEngineWeight(123)).toBeNull();
  });

  it('internal structure', () => {
    expect(internalStructure(100)).toEqual({ HD: 3, CT: 31, LT: 21, RT: 21, LA: 17, RA: 17, LL: 21, RL: 21 });
    expect(internalStructure(20)?.CT).toBe(6);
    expect(internalStructure(42)).toBeNull();
  });

  it('gyro and armor maximums', () => {
    expect(gyroWeight(300)).toBe(3);
    expect(gyroWeight(301)).toBe(4);
    expect(maxTotalArmor(100)).toBe(307);
    expect(maxTotalArmor(20)).toBe(69);
  });
});

describe('canonical designs', () => {
  for (const p of PRESETS) {
    it(`${p.key} is exactly at tonnage with no errors`, () => {
      const d = p.build();
      const s = computeMech(d);
      expect(s.weights.total).toBe(d.tonnage);
      expect(errors(d)).toEqual([]);
    });
  }

  it('Atlas derived stats', () => {
    const s = computeMech(preset('Atlas AS7-D'));
    expect(s.rating).toBe(300);
    expect(s.runMP).toBe(5);
    expect(s.heatSinks.total).toBe(20);
    expect(s.armorTotal).toBe(304);
    expect(s.weights.armor).toBe(19);
    expect(s.weightClass).toBe('Assault');
  });

  it('Wasp jumps 6 for 3 tons', () => {
    const s = computeMech(preset('Wasp WSP-1A'));
    expect(s.jumpMP).toBe(6);
    expect(s.weights.jumpJets).toBe(3);
  });

  it('readout renders', () => {
    const text = technicalReadout(preset('Atlas AS7-D'));
    expect(text).toContain('Engine: 300 Fusion');
    expect(text).toContain('2 Medium Laser (R)');
  });
});

describe('validation', () => {
  it('flags overweight designs', () => {
    let d = preset('Locust LCT-1V');
    d = addEquipment(d, 'ppc', 'RT');
    expect(errors(d).some((e) => e.includes('Overweight by 7'))).toBe(true);
  });

  it('flags armor above maximum', () => {
    const d = preset('Locust LCT-1V');
    d.armor.HD = 10;
    d.armor.CTR = 5;
    const e = errors(d);
    expect(e.some((m) => m.startsWith('Head has 10'))).toBe(true);
    expect(e.some((m) => m.startsWith('Center Torso has 15'))).toBe(true);
  });

  it('flags critical slot overflow', () => {
    // AC/20 needs 10 slots; an arm with all actuators has 8 free.
    const d = addEquipment(newDesign(), 'ac-20', 'LA');
    expect(errors(d).some((m) => m.startsWith('Left Arm needs 2 more'))).toBe(true);
    // Removing the lower arm and hand frees exactly enough.
    const fixed = setActuator(d, 'LA', 'lowerArm', false);
    expect(errors(fixed).some((m) => m.startsWith('Left Arm needs'))).toBe(false);
  });

  it('flags unallocated equipment', () => {
    const d = addEquipment(newDesign(), 'medium-laser');
    expect(errors(d).some((m) => m.includes('not allocated'))).toBe(true);
  });

  it('jump jets: placement and MP limits', () => {
    let d = setJumpMP(newDesign(), 5);
    const jj = d.equipment.filter((e) => e.equipmentId === 'jump-jet');
    d = setItemLocation(d, jj[0].uid, 'LA');
    for (const j of jj.slice(1)) d = setItemLocation(d, j.uid, 'LL');
    const e = errors(d);
    expect(e.some((m) => m.includes('Jump Jet cannot be mounted in the Left Arm'))).toBe(true);
    expect(e.some((m) => m.includes('Jumping MP (5) cannot exceed walking MP (4)'))).toBe(true);
    expect(e.some((m) => m.startsWith('Left Leg needs 2 more'))).toBe(true);
  });

  it('rear mounting only in torsos', () => {
    let d = addEquipment(newDesign(), 'medium-laser', 'LA');
    const uid = d.equipment.at(-1)!.uid;
    d = setItemRear(d, uid, true);
    expect(errors(d).some((m) => m.includes('cannot be rear-mounted'))).toBe(true);
    d = setItemLocation(d, uid, 'CT');
    expect(d.equipment.at(-1)!.rear).toBe(true); // legal in a torso
    expect(errors(d).some((m) => m.includes('cannot be rear-mounted'))).toBe(false);
    d = setItemLocation(d, uid, 'RA');
    expect(d.equipment.at(-1)!.rear).toBeUndefined(); // cleared when moved out of the torso
  });

  it('hand requires lower arm', () => {
    const d = newDesign();
    d.actuators.LA = { lowerArm: false, hand: true };
    expect(errors(d).some((m) => m.includes('hand actuator requires'))).toBe(true);
  });

  it('heat sink rules', () => {
    const d = newDesign();
    expect(errors({ ...d, engineHeatSinks: 9 }).some((m) => m.includes('can hold only 8'))).toBe(true);
    expect(errors(setHeatSinkTotal(d, 9)).some((m) => m.includes('at least 10'))).toBe(true);
  });

  it('engine rating limits', () => {
    expect(errors({ ...newDesign(), tonnage: 100, walkMP: 5 }).some((m) => m.includes('exceeds the maximum'))).toBe(true);
  });

  it('new design is structurally valid apart from unused tonnage', () => {
    const issues = validate(newDesign());
    expect(isValid(issues)).toBe(true);
  });
});

describe('editing', () => {
  it('heat sink total fills the engine first', () => {
    const d = setHeatSinkTotal(newDesign(), 14);
    const s = computeMech(d);
    expect(s.heatSinks.inEngine).toBe(8);
    expect(s.heatSinks.external).toBe(6);
    expect(s.weights.heatSinks).toBe(4);
  });

  it('moving heat sinks out of the engine keeps the total', () => {
    const d = setEngineHeatSinks(newDesign(), 5);
    expect(computeMech(d).heatSinks).toMatchObject({ total: 10, inEngine: 5, external: 5 });
  });

  it('smaller engine pushes heat sinks out', () => {
    const d = setWalkMP(newDesign(), 2); // rating 100 -> capacity 4
    expect(computeMech(d).heatSinks).toMatchObject({ total: 10, inEngine: 4, external: 6 });
  });

  it('bigger engine pulls heat sinks in when it was full', () => {
    const d = setWalkMP(setWalkMP(newDesign(), 2), 6); // rating 300 -> capacity 12
    expect(computeMech(d).heatSinks).toMatchObject({ total: 10, inEngine: 10, external: 0 });
  });

  it('tonnage change clamps walk MP and armor', () => {
    let d = { ...newDesign(), walkMP: 8 };
    d.armor.CT = 32;
    d = setTonnage(d, 100);
    expect(d.walkMP).toBe(4);
    d = setTonnage({ ...d, armor: { ...d.armor, CT: 60 } }, 20);
    expect(d.armor.CT).toBe(12);
  });

  it('reducing jump MP removes unallocated jets first', () => {
    let d = setJumpMP(newDesign(), 2);
    const [a] = d.equipment.filter((e) => e.equipmentId === 'jump-jet');
    d = setItemLocation(d, a.uid, 'LL');
    d = setJumpMP(d, 1);
    const left = d.equipment.filter((e) => e.equipmentId === 'jump-jet');
    expect(left).toHaveLength(1);
    expect(left[0].uid).toBe(a.uid);
  });

  it('distributeArmor respects maximums and totals', () => {
    for (const t of [20, 55, 100]) {
      for (const pts of [0, 37, 150, 400]) {
        const a = distributeArmor(t, pts);
        expect(totalArmorPoints(a)).toBe(Math.min(pts, maxTotalArmor(t)));
        const d = { ...newDesign(), tonnage: t, armor: a };
        expect(errors(d).filter((m) => m.includes('armor points'))).toEqual([]);
      }
    }
  });

  it('JSON round trip', () => {
    const d = preset('Atlas AS7-D');
    const back = parseDesign(JSON.parse(JSON.stringify(d)));
    expect(computeMech(back).weights).toEqual(computeMech(d).weights);
    expect(() => parseDesign({ tonnage: 'x' })).toThrow();
  });
});

describe('eras', () => {
  it('start at 3025 and progress forwards', () => {
    expect(ERAS[0].id).toBe('3025');
    const years = ERAS.map((e) => e.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(ERAS.find((e) => e.id === DEFAULT_ERA)?.available).toBe(true);
  });

  it('designs record their era, defaulting to 3025 for older files', () => {
    expect(newDesign().era).toBe('3025');
    const { era: _omit, ...legacy } = preset('Atlas AS7-D');
    expect(parseDesign(JSON.parse(JSON.stringify(legacy))).era).toBe('3025');
    expect(parseDesign({ ...legacy, era: '3050' }).era).toBe('3050');
    expect(parseDesign({ ...legacy, era: 'bogus' }).era).toBe('3025');
  });
});

describe('design status', () => {
  const warnings = (d: MechDesign) => validate(d).filter((i) => i.severity === 'warning').map((i) => i.message);

  it('canon designs are fully legal (green)', () => {
    for (const p of PRESETS) expect(designStatus(validate(p.build()))).toBe('legal');
  });

  it('errors are illegal (red)', () => {
    expect(designStatus(validate(addEquipment(newDesign(), 'medium-laser')))).toBe('illegal');
  });

  it('unused tonnage or missing armor is a warning (amber)', () => {
    const d = newDesign();
    expect(designStatus(validate(d))).toBe('warnings');
    expect(warnings(d)).toContain('No armor allocated.');
  });

  it('warns about armor points paid for but not allocated', () => {
    const d = preset('Hunchback HBK-4G');
    d.armor.HD = 6; // 157 points still costs 10 tons = 160 points
    expect(warnings(d).some((m) => m.startsWith('3 armor point(s) paid for but not allocated'))).toBe(true);
  });
});
