import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import { computeMech, maximizeArmor, newDesign, parseDesign, validate } from './index';
import { clearPatchwork, setLocationArmorType } from './edit';
import { mechBV, mechCost } from './battleValue';
import { isPatchwork } from './types';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const base = () => maximizeArmor({ ...newDesign('3068'), tonnage: 60, walkMP: 4 });

describe('patchwork armor', () => {
  it('each location carries its own armor slots', () => {
    let d = base();
    d = setLocationArmorType(setLocationArmorType(d, 'LA', 'ferro-fibrous'), 'RA', 'ferro-fibrous');
    expect(isPatchwork(d)).toBe(true);
    const s = computeMech(d);
    expect(s.slots.LA.slots.filter((x) => x.label === 'Ferro-Fibrous')).toHaveLength(2);
    expect(s.slots.LT.slots.filter((x) => x.label === 'Ferro-Fibrous')).toHaveLength(0);
    expect(d.equipment.some((e) => e.equipmentId === 'ferro-fibrous')).toBe(false); // no spread filler slots
    expect(errors(d)).toEqual([]);
  });

  it('weight sums each location at its own points per ton, rounded up to the half ton', () => {
    const d = setLocationArmorType(base(), 'CT', 'ferro-fibrous');
    const plain = computeMech(base()).weights.armor;
    const ct = d.armor.CT + d.armor.CTR;
    const expected = Math.ceil(((computeMech(base()).armorTotal - ct) / 16 + ct / (16 * 1.12)) * 2) / 2;
    expect(computeMech(d).weights.armor).toBe(expected);
    expect(computeMech(d).weights.armor).toBeLessThanOrEqual(plain);
  });

  it('BV uses each location\'s armor multiplier; hardened anywhere costs a running MP', () => {
    const hard = setLocationArmorType(base(), 'LL', 'hardened');
    expect(mechBV(hard).total).toBeGreaterThan(mechBV(base()).total - 1); // hardened ×2 on the leg's points
    expect(computeMech(hard).runMP).toBe(computeMech(base()).runMP - 1);
    expect(mechCost(hard).total).toBeGreaterThan(mechCost(base()).total);
  });

  it('reports locations without room and is saved and loaded intact', () => {
    let d = base();
    d = setLocationArmorType(d, 'HD', 'heavy-ferro'); // 3 slots; a standard head has 2 free
    expect(errors(d).some((m) => /Head: no room for 3 Heavy Ferro-Fibrous/.test(m))).toBe(true);
    d = setLocationArmorType(base(), 'LL', 'reactive');
    expect(parseDesign(JSON.parse(JSON.stringify(d))).patchwork).toEqual({ LL: 'reactive' });
    expect(decodeMech(encodeMech(d)).patchwork).toEqual({ LL: 'reactive' });
    expect(clearPatchwork(d).patchwork).toBeUndefined();
    expect(setLocationArmorType(d, 'LL', 'standard').patchwork).toBeUndefined();
  });

  it('canon patchwork designs convert legally', () => {
    const zeus = (M as CanonEntry[]).find((e) => e.n === 'Zeus-X ZEU-X')!;
    const d = decodeMech(zeus.d);
    expect(d.patchwork?.LA).toBe('reactive');
    expect(computeMech(d).weights.total).toBe(d.tonnage);
    expect(errors(d)).toEqual([]);
  });
});
