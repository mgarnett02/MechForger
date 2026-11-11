import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import {
  computeMech, newDesign, parseDesign, setArmorType, setEngineType, setHeatSinkType, setItemRear, addEquipment, setMixedTech,
  setStructureType, validate,
} from './index';
import { setComponentTech } from './edit';
import { configurationDesigns } from './omni';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = M as CanonEntry[];
const is3068 = () => setMixedTech({ ...newDesign('3068'), tonnage: 75, walkMP: 4 }, true);

describe('mixed tech components', () => {
  it('Clan structure, armor, engine and heat sinks on an Inner Sphere chassis use Clan slots and points', () => {
    let d = setHeatSinkType(setEngineType(setArmorType(setStructureType(is3068(), 'endo-steel'), 'ferro-fibrous'), 'xl'), 'double');
    for (const part of ['structure', 'armor', 'engine', 'heatSinks'] as const) d = setComponentTech(d, part, 'Clan');
    expect(d.equipment.filter((e) => e.equipmentId === 'endo-steel')).toHaveLength(7);
    expect(d.equipment.filter((e) => e.equipmentId === 'ferro-fibrous')).toHaveLength(7);
    expect(d.equipment.every((e) => e.equipmentId !== 'double-heat-sink')).toBe(true);
    const s = computeMech(d);
    expect(s.slots.LT.slots.filter((x) => /XL Fusion/.test(x.label))).toHaveLength(2);
    expect(s.armorPointsPerTon).toBeCloseTo(16 * 1.2);
    expect(errors(d).filter((m) => /technology|mixed|cannot be mixed|slots \(has/.test(m))).toEqual([]);
    // Saved and loaded intact; ignored once mixed tech is off.
    expect(parseDesign(JSON.parse(JSON.stringify(d))).componentTech).toEqual({ structure: 'Clan', armor: 'Clan', engine: 'Clan', heatSinks: 'Clan' });
    expect(decodeMech(encodeMech(d)).componentTech?.engine).toBe('Clan');
    expect(setMixedTech(d, false).equipment.filter((e) => e.equipmentId === 'endo-steel')).toHaveLength(14);
  });

  it('small cockpits are open to Clan designs from 3080, and head and leg weapons may face rear', () => {
    const clan = { ...newDesign('3081', 'Clan'), cockpitType: 'small' as const };
    expect(errors(clan).some((m) => /Small cockpits/.test(m))).toBe(false);
    expect(errors({ ...newDesign('3068', 'Clan'), cockpitType: 'small' as const }).some((m) => /Small cockpits/.test(m))).toBe(true);
    let d = addEquipment(newDesign('3050'), 'small-laser', 'HD');
    d = setItemRear(d, d.equipment.at(-1)!.uid, true);
    expect(errors(d).some((m) => /rear-mounted/.test(m))).toBe(false);
  });

  it('canon mixed-tech designs and OmniMech configurations are legal', () => {
    expect(decodeMech(canon.find((e) => e.n === 'Atlas II AS7-D-H (Devlin)')!.d).componentTech).toMatchObject({ engine: 'Clan', heatSinks: 'Clan' });
    expect(canon.find((e) => e.n === 'Atlas II AS7-D-H (Devlin)')!.ok).toBe(true);
    const tw = decodeMech(canon.find((e) => e.n === 'Timber Wolf (Mad Cat)')!.d);
    expect(tw.omni!.configurations.some((c) => c.mixedTech)).toBe(true);
    expect(configurationDesigns(tw).every((c) => errors(c.design).length === 0)).toBe(true);
    expect(canon.filter((e) => e.ok).length / canon.length).toBeGreaterThan(0.99);
  });
});
