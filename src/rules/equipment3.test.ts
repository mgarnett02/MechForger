import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import {
  addEquipment, computeMech, getEquipment, mechBV, mechCost, newDesign, shortEquipmentName, validate,
} from './index';
import { placeItem, setItemLocation, setItemSplit } from './edit';
import { mechSheetData } from './recordSheet';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const line = (d: MechDesign, re: RegExp) => mechBV(d).lines.find(([l]) => re.test(l))?.[1];
const last = (d: MechDesign) => d.equipment[d.equipment.length - 1].uid;
const canon = M as CanonEntry[];

describe('split weapons', () => {
  const base = { ...newDesign('3050'), tonnage: 75, walkMP: 4 };

  it('an AC/20 split 7 + 3 between the right arm and right torso takes slots in both', () => {
    let d = addEquipment(base, 'ac-20', 'RA');
    d = setItemSplit(d, last(d), { location: 'RT', slots: 3 });
    const s = computeMech(d);
    expect(s.slots.RA.slots.filter((x) => x.label === 'AC/20')).toHaveLength(7);
    expect(s.slots.RT.slots.filter((x) => x.label === 'AC/20')).toHaveLength(3);
    expect(s.slots.RA.overflow).toBe(0);
    expect(errors(d).filter((m) => /AC\/20|critical slot/.test(m))).toEqual([]);
    expect(mechSheetData(d).weapons.find((w) => /AC\/20/.test(w.name))?.location).toBe('RA/RT');
  });

  it('only weapons of 8+ slots split, and only between adjacent locations', () => {
    let d = addEquipment(base, 'ac-20', 'RA');
    expect(errors(setItemSplit(d, last(d), { location: 'LT', slots: 3 })).some((m) => /adjacent/.test(m))).toBe(true);
    expect(errors(setItemSplit(d, last(d), { location: 'RT', slots: 10 })).some((m) => /leaves nothing/.test(m))).toBe(true);
    d = addEquipment(base, 'ac-10', 'RA');
    expect(errors(setItemSplit(d, last(d), { location: 'RT', slots: 2 })).some((m) => /cannot be split/.test(m))).toBe(true);
  });

  it('placing a weapon that does not fit spills the rest into the adjacent location', () => {
    let d = addEquipment(base, 'ac-20');
    d = placeItem(d, last(d), 'RA'); // 8 open arm slots with lower arm and hand
    expect(d.equipment.find((e) => e.equipmentId === 'ac-20')).toMatchObject({ location: 'RA', split: { location: 'RT', slots: 2 } });
    // Moving it to a location that is not next to the split part drops the split.
    expect(setItemLocation(d, last(d), 'LT').equipment.find((e) => e.equipmentId === 'ac-20')?.split).toBeUndefined();
  });

  it('round-trips through the canon format, and explosive split items count where either part is unprotected', () => {
    let d = addEquipment(base, 'heavy-gauss-rifle', 'RT');
    d = setItemSplit(d, last(d), { location: 'CT', slots: 2 });
    expect(decodeMech(encodeMech(d)).equipment.find((e) => e.split)?.split).toEqual({ location: 'CT', slots: 2 });
    const withCase = addEquipment(d, 'case', 'RT');
    expect(line(withCase, /Explosive/)).toBe(-11); // CASE in the RT does not cover the CT part
  });

  it('canon designs with split weapons convert and are legal', () => {
    const split = canon.filter((e) => decodeMech(e.d).equipment.some((i) => i.split));
    expect(split.length).toBeGreaterThan(50);
    expect(split.filter((e) => e.ok).length / split.length).toBeGreaterThan(0.9);
    const atlas = decodeMech(canon.find((e) => e.n === 'Atlas AS7-S2')!.d);
    expect(atlas.equipment.find((e) => e.equipmentId === 'heavy-gauss-rifle')?.split).toEqual({ location: 'CT', slots: 2 });
  });
});

describe('new weapons', () => {
  it('Clan ER pulse lasers, Streak LRMs and rotary ACs carry MegaMek stats', () => {
    expect(getEquipment('clan-er-medium-pulse-laser')).toMatchObject({ tons: 2, slots: 2, heat: 6, damage: '7', techBase: 'Clan' });
    expect(getEquipment('clan-streak-lrm-20')).toMatchObject({ tons: 10, slots: 5, heat: 6, ammoPerTon: 6 });
    expect(getEquipment('clan-rac-5')).toMatchObject({ tons: 10, slots: 8, firstEra: '3068' });
    expect(getEquipment('large-re-engineered-laser')).toMatchObject({ tons: 8, slots: 5, heat: 9, techBase: 'IS', firstEra: '3101' });
    for (const id of ['ammo-clan-streak-lrm-10', 'medium-re-engineered-laser', 'ammo-clan-lrm-10-artemis-v', 'clan-light-active-probe']) {
      expect(shortEquipmentName(getEquipment(id)!, { mixedTech: false }).length).toBeLessThanOrEqual(22);
    }
  });

  it('Streak LRMs count half heat for BV, like Streak SRMs', () => {
    const d = addEquipment(newDesign('3050', 'Clan'), 'clan-streak-lrm-20', 'LT');
    expect(line(d, /Weapons/)).toBe(345);
  });
});

describe('Artemis V', () => {
  const clan = newDesign('3050', 'Clan');

  it('raises a linked Clan LRM/SRM launcher by 30% and its ammo by 30%', () => {
    const lrm = addEquipment(addEquipment(clan, 'clan-lrm-20', 'LT'), 'ammo-clan-lrm-20-artemis-v', 'LT');
    const art = addEquipment(lrm, 'clan-artemis-v', 'LT');
    expect(line(art, /Weapons/)).toBeCloseTo(line(lrm, /Weapons/)! * 1.3);
    expect(line(art, /Ammunition/)).toBeCloseTo(line(addEquipment(addEquipment(clan, 'clan-lrm-20', 'LT'), 'ammo-clan-lrm-20', 'LT'), /Ammunition/)! * 1.3);
    expect(mechCost(art).total - mechCost(lrm).total).toBe(250000 * (1 + clan.tonnage / 100)); // × the tonnage multiplier
    expect(errors(art).filter((m) => /Artemis/.test(m))).toEqual([]);
  });

  it('needs a Clan LRM/SRM launcher in the same location', () => {
    expect(errors(addEquipment(clan, 'clan-artemis-v', 'LT')).some((m) => /Artemis V FCS/.test(m))).toBe(true);
    const ammoOnly = addEquipment(addEquipment(clan, 'clan-lrm-20', 'LT'), 'ammo-clan-lrm-20-artemis-v', 'LT');
    expect(validate(ammoOnly).some((i) => /needs an Artemis V/.test(i.message))).toBe(true);
  });
});

describe('pods and probes', () => {
  it('A-, B- and M-Pods and the light active probe count as defensive equipment', () => {
    const d = addEquipment(addEquipment(newDesign('3068'), 'b-pod', 'LL'), 'ap-pod', 'RL');
    expect(line(d, /Defensive equipment/)).toBe(3);
    expect(line(addEquipment(newDesign('3050', 'Clan'), 'clan-light-active-probe', 'HD'), /Defensive equipment/)).toBe(7);
    expect(line(addEquipment(newDesign('3068'), 'm-pod', 'LL'), /Explosive/)).toBe(-1);
  });

  it('coolant pods add ⌈heat sinks × pods / 5⌉ to heat efficiency and explode for 1 BV', () => {
    const base = newDesign('3050');
    const d = addEquipment(base, 'coolant-pod', 'LL');
    expect(line(d, /Explosive/)).toBe(-1);
    expect(computeMech(d).weights.total - computeMech(base).weights.total).toBe(1);
  });

  it('canon designs with the new equipment convert', () => {
    for (const re of [/clan-er-medium-pulse-laser/, /clan-streak-lrm/, /clan-rac/, /re-engineered/, /coolant-pod/, /clan-artemis-v/, /b-pod|m-pod|ap-pod/]) {
      expect(canon.filter((e) => re.test(JSON.stringify(e.d))).length).toBeGreaterThan(5);
    }
  });
});
