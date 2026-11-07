import { describe, expect, it } from 'vitest';
import {
  addConfiguration, addEquipment, autoAllocate, computeMech, configurationDesigns, deleteConfiguration,
  designStatus, equipmentName, getEquipment, isEquipmentAvailable, itemWeight, newDesign, parseDesign,
  renameConfiguration, setItemPod, setMixedTech, setMyomer, setOmni, setTechBase, switchConfiguration,
  technicalReadout, validate,
} from './index';
import type { MechDesign } from './types';
import { PRESETS } from '../data/canonical';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const warnings = (d: MechDesign) => validate(d).filter((i) => i.severity === 'warning').map((i) => i.message);
const grimfang = () => PRESETS.find((p) => p.key.startsWith('Grimfang'))!.build();
const is3050 = () => newDesign('3050');
const clan3050 = () => setTechBase(newDesign('3050', 'Clan'), 'Clan');
const eq = (id: string) => getEquipment(id)!;

describe('Artemis IV', () => {
  it('must share a location with an LRM/SRM launcher', () => {
    let d = addEquipment(is3050(), 'artemis-iv', 'LT');
    expect(errors(d).some((m) => m.includes('Left Torso has 1 Artemis IV FCS but only 0'))).toBe(true);
    d = addEquipment(d, 'lrm-10', 'LT');
    expect(errors(d).some((m) => m.includes('Artemis'))).toBe(false);
  });

  it('is not allowed on Streak launchers', () => {
    const d = addEquipment(addEquipment(is3050(), 'streak-srm-2', 'LT'), 'artemis-iv', 'LT');
    expect(errors(d).some((m) => m.includes('Artemis'))).toBe(true);
  });

  it('Artemis ammo feeds the launcher and warns without the FCS', () => {
    const d = addEquipment(addEquipment(is3050(), 'lrm-10', 'LT'), 'ammo-lrm-10-artemis', 'LT');
    expect(warnings(d).some((m) => m.includes('LRM 10 has no ammunition'))).toBe(false);
    expect(warnings(d).some((m) => m.includes('needs an Artemis IV FCS'))).toBe(true);
    expect(isEquipmentAvailable(eq('ammo-lrm-10-artemis'), '3025', 'IS')).toBe(false);
  });
});

describe('targeting computer', () => {
  it('Clan: 1 ton per 5 tons of direct-fire weapons, rounded up; slots = tons', () => {
    let d = addEquipment(clan3050(), 'clan-gauss-rifle', 'RT'); // 12 t
    d = addEquipment(d, 'clan-lrm-20', 'LT'); // missiles don't count
    d = addEquipment(d, 'clan-er-medium-laser', 'CT'); // 13 t direct fire
    const tc = eq('clan-targeting-computer');
    expect(itemWeight(tc, d)).toBe(3);
    d = addEquipment(d, 'clan-targeting-computer', 'LT');
    expect(computeMech(d).slots.LT.free).toBe(12 - 1 - 4 - 3); // heat sink, LRM 20, TC
  });

  it('IS version arrives with the Civil War, so 3050 IS needs the Clan one via mixed tech', () => {
    expect(isEquipmentAvailable(eq('targeting-computer'), '3050', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('clan-targeting-computer'), '3050', 'IS')).toBe(false);
    expect(isEquipmentAvailable(eq('clan-targeting-computer'), '3050', 'IS', true)).toBe(true);
  });

  it('warns when there is nothing for it to aim', () => {
    const d = addEquipment(clan3050(), 'clan-targeting-computer', 'LT');
    expect(warnings(d).some((m) => m.includes('no direct-fire'))).toBe(true);
  });
});

describe('Triple-Strength Myomer', () => {
  it('adds 6 slots and +1 walking MP when hot', () => {
    let d = setMyomer(is3050(), 'tsm');
    expect(d.equipment.filter((e) => e.equipmentId === 'tsm')).toHaveLength(6);
    expect(computeMech(d).tsmMP).toEqual({ walk: 5, run: 8 });
    d = autoAllocate(d);
    expect(errors(d)).toEqual([]);
    expect(technicalReadout(d)).toContain('Triple-Strength Myomer: 5/8');
    expect(setMyomer(d, 'standard').equipment.some((e) => e.equipmentId === 'tsm')).toBe(false);
  });

  it('cannot be combined with MASC or used before 3050', () => {
    const d = addEquipment(autoAllocate(setMyomer(is3050(), 'tsm')), 'masc', 'LT');
    expect(errors(d).some((m) => m.includes('MASC and Triple-Strength Myomer'))).toBe(true);
    expect(errors({ ...setMyomer(newDesign('3025'), 'tsm') }).some((m) => m.includes('Triple-Strength Myomer cannot be used'))).toBe(true);
  });

  it('is Inner Sphere tech: Clan needs mixed tech', () => {
    const d = autoAllocate(setMyomer(clan3050(), 'tsm'));
    expect(errors(d).some((m) => m.includes('Inner Sphere technology'))).toBe(true);
    expect(errors(setMixedTech(d, true)).some((m) => m.includes('Inner Sphere technology'))).toBe(false);
  });
});

describe('C3 and half-ton machine gun ammo', () => {
  it('C3 is Inner Sphere 3050 equipment', () => {
    expect(isEquipmentAvailable(eq('c3-master'), '3050', 'IS')).toBe(true);
    expect(isEquipmentAvailable(eq('c3-slave'), '3050', 'Clan')).toBe(false);
    expect(eq('c3-master')).toMatchObject({ tons: 5, slots: 5 });
  });

  it('half-ton MG ammo weighs 0.5 t, holds 100 rounds, Standard rules only', () => {
    expect(eq('ammo-machine-gun-half')).toMatchObject({ tons: 0.5, ammoFor: 'machine-gun' });
    expect(eq('ammo-machine-gun-half').name).toContain('(100)');
    expect(isEquipmentAvailable(eq('ammo-machine-gun-half'), '3025', 'IS')).toBe(false);
    const d = addEquipment(addEquipment(is3050(), 'machine-gun', 'RA'), 'ammo-machine-gun-half', 'RA');
    expect(warnings(d).some((m) => m.includes('Machine Gun has no ammunition'))).toBe(false);
    expect(computeMech(d).weights.equipment).toBe(1);
  });
});

describe('mixed tech', () => {
  it('allows equipment from both tech bases and labels it', () => {
    let d = addEquipment(is3050(), 'clan-er-large-laser', 'RT');
    expect(errors(d).some((m) => m.includes('not available to Inner Sphere'))).toBe(true);
    d = setMixedTech(d, true);
    expect(errors(d).some((m) => m.includes('not available'))).toBe(false);
    expect(equipmentName(eq('clan-er-large-laser'), d)).toBe('ER Large Laser (Clan)');
    expect(equipmentName(eq('er-large-laser'), d)).toBe('ER Large Laser (IS)');
    expect(technicalReadout(d)).toContain('Mixed (Inner Sphere chassis) (Advanced)');
  });

  it('is not available in 3025', () => {
    expect(errors(setMixedTech(newDesign('3025'), true)).some((m) => m.includes('Mixed tech designs cannot be used'))).toBe(true);
  });
});

describe('OmniMechs', () => {
  it('every Grimfang configuration is exactly at tonnage and legal', () => {
    const d = grimfang();
    const configs = configurationDesigns(d);
    expect(configs.map((c) => c.name)).toEqual(['Prime', 'A']);
    for (const c of configs) {
      expect(computeMech(c.design).weights.total).toBe(65);
      expect(validate(c.design).filter((i) => i.severity === 'error')).toEqual([]);
    }
    expect(designStatus(validate(d))).toBe('legal');
  });

  it('splits weight into fixed base and pod space', () => {
    const d = grimfang();
    expect(computeMech(d).omni).toEqual({ fixed: 36.5, podSpace: 28.5, podUsed: 28.5 });
    const a = switchConfiguration(d, 1);
    expect(computeMech(a).omni).toEqual({ fixed: 36.5, podSpace: 28.5, podUsed: 28.5 });
    expect(computeMech(a).heatSinks.total).toBe(15);
  });

  it('switching configurations keeps fixed items and swaps pods', () => {
    const d = grimfang();
    const a = switchConfiguration(d, 1);
    const ids = (x: MechDesign) => x.equipment.map((e) => e.equipmentId);
    expect(ids(a)).toContain('clan-gauss-rifle');
    expect(ids(a)).not.toContain('clan-uac-5');
    expect(ids(a).filter((i) => i === 'endo-steel')).toHaveLength(7);
    const back = switchConfiguration(a, 0);
    expect(ids(back).sort()).toEqual(ids(d).sort());
    expect(technicalReadout(a)).toContain('A Configuration');
  });

  it('add (copy), rename and delete configurations', () => {
    let d = addConfiguration(grimfang(), true);
    expect(d.omni!.configurations.map((c) => c.name)).toEqual(['Prime', 'A', 'B']);
    expect(d.omni!.active).toBe(2);
    expect(computeMech(d).weights.total).toBe(65); // copy of Prime
    d = renameConfiguration(d, 2, 'Brawler');
    d = addConfiguration(d, false);
    expect(computeMech(d).omni!.podUsed).toBe(0);
    d = deleteConfiguration(d, d.omni!.active);
    expect(d.omni!.configurations.map((c) => c.name)).toEqual(['Prime', 'A', 'Brawler']);
    expect(d.equipment.filter((e) => e.pod).length).toBeGreaterThan(0);
  });

  it('reports errors in configurations that are not on screen', () => {
    let d = switchConfiguration(grimfang(), 1);
    d = addEquipment(d, 'clan-er-ppc', 'RA'); // overweight A
    d = switchConfiguration(d, 0);
    expect(errors(d).some((m) => m.startsWith('Configuration A:'))).toBe(true);
  });

  it('structure slots and MASC cannot be podded', () => {
    const d = grimfang();
    const endo = d.equipment.find((e) => e.equipmentId === 'endo-steel')!;
    expect(errors(setItemPod(d, endo.uid, true)).some((m) => m.includes('cannot be pod-mounted'))).toBe(true);
  });

  it('turning Omni on pods the weapons; off keeps the active configuration', () => {
    const atlas = setOmni({ ...PRESETS.find((p) => p.key.startsWith('Atlas'))!.build(), era: '3050' }, true);
    expect(atlas.equipment.find((e) => e.equipmentId === 'ac-20')!.pod).toBe(true);
    expect(atlas.equipment.find((e) => e.equipmentId === 'heat-sink')!.pod).toBeUndefined();
    const a2 = setOmni(switchConfiguration(grimfang(), 1), false);
    expect(a2.omni).toBeNull();
    expect(a2.equipment.some((e) => e.equipmentId === 'clan-gauss-rifle')).toBe(true);
    expect(a2.equipment.some((e) => e.pod)).toBe(false);
  });

  it('OmniMechs are not available in 3025', () => {
    expect(errors(setOmni(newDesign('3025'), true)).some((m) => m.includes('OmniMechs cannot be used'))).toBe(true);
  });

  it('JSON round trip keeps configurations', () => {
    const d = switchConfiguration(grimfang(), 1);
    const back = parseDesign(JSON.parse(JSON.stringify(d)));
    expect(back.omni!.configurations.map((c) => c.name)).toEqual(['Prime', 'A']);
    expect(back.omni!.active).toBe(1);
    expect(computeMech(back).weights).toEqual(computeMech(d).weights);
    expect(computeMech(switchConfiguration(back, 0)).weights.total).toBe(65);
  });
});
