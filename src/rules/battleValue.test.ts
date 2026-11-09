import { describe, expect, it } from 'vitest';
import {
  addEquipment, mechBV, mechCost, speedFactor, targetMovementModifier, vehicleBV, vehicleCost, ALL_EQUIPMENT,
  setItemLocation,
} from './index';
import { ITEM_VALUES } from './values';
import { PRESETS } from '../data/canonical';
import { VEHICLE_PRESETS } from '../data/vehicles';

const mech = (k: string) => PRESETS.find((p) => p.key.startsWith(k))!.build();

describe('BV 2.0 matches published values for canon mechs', () => {
  it.each([
    ['Atlas AS7-D', 1897],
    ['Hunchback HBK-4G', 1041],
    ['Locust LCT-1V', 432],
    ['Wasp WSP-1A', 384],
  ])('%s = %i', (key, bv) => {
    expect(mechBV(mech(key)).total).toBe(bv);
  });
});

describe('C-bill cost matches published values', () => {
  it('Atlas AS7-D = 9,626,000', () => expect(mechCost(mech('Atlas')).total).toBe(9626000));
  it('Locust LCT-1V = 1,512,400', () => expect(mechCost(mech('Locust')).total).toBe(1512400));
});

describe('BV building blocks', () => {
  it('target movement modifiers and speed factors', () => {
    expect([2, 3, 5, 7, 10, 18, 25].map(targetMovementModifier)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(speedFactor(5)).toBe(1);
    expect(speedFactor(12)).toBe(1.89);
    expect(speedFactor(6)).toBe(1.12);
  });

  it('CASE removes the explosive ammo penalty in a side torso', () => {
    const hbk = mech('Hunchback');
    const withCase = { ...addEquipment(hbk, 'case', 'RT'), era: '3050' as const };
    // CASE costs 0.5 t (making the design overweight) but BV only looks at protection.
    expect(mechBV(withCase).defensive).toBeGreaterThan(mechBV(hbk).defensive);
  });

  it('IS XL engines make CASE ineffective; Clan mechs are always protected', () => {
    const d = { ...addEquipment(mech('Hunchback'), 'case', 'RT'), era: '3050' as const };
    const xl = { ...d, engineType: 'xl' as const };
    expect(mechBV(xl).lines.find(([n]) => n.startsWith('Explosive'))?.[1]).toBe(-30);
    expect(mechBV(d).lines.find(([n]) => n.startsWith('Explosive'))).toBeUndefined();
  });

  it('targeting computer raises direct-fire weapon BV', () => {
    const base = { ...mech('Atlas'), era: '3062' as const };
    let tc = addEquipment(base, 'targeting-computer');
    tc = setItemLocation(tc, tc.equipment.at(-1)!.uid, 'LA');
    expect(mechBV(tc).offensive).toBeGreaterThan(mechBV(base).offensive);
  });

  it('every weapon and piece of equipment has BV and cost values', () => {
    const missing = ALL_EQUIPMENT.filter(
      (e) => !e.managed && e.category !== 'Ammo' && !e.variableWeight && !ITEM_VALUES[e.id],
    ).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('OmniMechs cost 25% more', () => {
    const g = PRESETS.find((p) => p.key.startsWith('Grimfang'))!.build();
    const plain = mechCost({ ...g, omni: null });
    expect(mechCost(g).total).toBe(Math.round(plain.total * 1.25));
  });
});

describe('vehicles (approximate)', () => {
  it('produce positive BV and cost, flagged approximate', () => {
    for (const p of VEHICLE_PRESETS) {
      const d = p.build();
      const bv = vehicleBV(d);
      const cost = vehicleCost(d);
      expect(bv.total).toBeGreaterThan(0);
      expect(cost.total).toBeGreaterThan(0);
      expect(bv.approximate && cost.approximate).toBe(true);
    }
  });
});
