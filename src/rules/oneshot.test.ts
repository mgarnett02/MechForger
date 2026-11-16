import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import V from '../data/canon/vehicles.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, decodeVehicle } from '../data/canonFormat';
import { AMMO, getEquipment } from './equipment';
import { ITEM_VALUES } from './values';
import { mechBV, vehicleBV } from './battleValue';

describe('one-shot launchers', () => {
  it('OS: +0.5 t, no ammo, 1/5 BV, half cost; I-OS: −0.5 t, 80% cost', () => {
    const os = getEquipment('srm-6-os')!;
    const ios = getEquipment('srm-6-ios')!;
    expect(os.name).toBe('SRM 6 (OS)');
    expect(os.tons).toBe(3.5);
    expect(ios.tons).toBe(2.5);
    expect(os.ammoPerTon).toBeUndefined();
    expect(AMMO.some((a) => a.ammoFor === 'srm-6-os')).toBe(false);
    expect(ITEM_VALUES['srm-6-os']).toMatchObject({ bv: 12, cost: 40000 });
    expect(ITEM_VALUES['srm-6-ios']).toMatchObject({ bv: 12, cost: 64000 });
    expect(ITEM_VALUES['clan-lrm-20-ios']).toMatchObject({ bv: 44, cost: 200000 });
    expect(getEquipment('ios-srm-2')).toBeUndefined();
    expect(getEquipment('narc-ios')!.name).toBe('Narc Missile Beacon (I-OS)');
  });

  it('canon units match MegaMek (one-shot heat counts a quarter)', () => {
    expect(mechBV(decodeMech((M as CanonEntry[]).find((e) => e.n === 'Raven RVN-5L')!.d)).total).toBe(1035);
  });
});

describe('torpedoes', () => {
  it('LRT / SRT mirror LRM / SRM, with their own ammunition and Artemis', () => {
    expect(getEquipment('srt-6')).toMatchObject({ name: 'SRT 6', tons: 3, slots: 2, torpedo: true });
    expect(getEquipment('clan-lrt-15')).toMatchObject({ name: 'LRT 15', tons: 3.5 });
    expect(ITEM_VALUES['srt-6']).toEqual(ITEM_VALUES['srm-6']);
    expect(getEquipment('ammo-lrt-20')?.ammoFor).toBe('lrt-20');
    expect(getEquipment('ammo-clan-lrt-15-artemis-v')).toBeDefined();
    expect(getEquipment('srt-4-os')).toBeDefined();
  });

  it('canon torpedo vehicles match MegaMek', () => {
    expect(vehicleBV(decodeVehicle((V as CanonEntry[]).find((e) => e.n === 'Rommel Tank (Sealed)')!.d)).total).toBe(1270);
  });
});
