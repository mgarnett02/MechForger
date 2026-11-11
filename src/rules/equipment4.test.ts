import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import {
  addEquipment, computeMech, getEquipment, itemSlots, itemWeight, mechBV, mechCost, newDesign, removeEquipment, validate,
} from './index';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);
const line = (d: MechDesign, re: RegExp) => mechBV(d).lines.find(([l]) => re.test(l))?.[1];
const canon = M as CanonEntry[];
const base = (t = 50) => ({ ...newDesign('3081'), tonnage: t, walkMP: 4 });

describe('Actuator Enhancement System', () => {
  it('weighs tonnage / 35 (half ton up) with 1–4 slots by weight class', () => {
    const aes = getEquipment('aes')!;
    expect(itemWeight(aes, base(50))).toBe(1.5);
    expect(itemSlots(aes, base(50))).toBe(2);
    expect(itemSlots(aes, base(100))).toBe(4);
    expect(itemWeight(aes, { ...base(100), config: 'quad' })).toBe(2);
  });

  it('raises arm weapons ×1.25 and the tonnage factor, and costs tonnage × 500 per arm', () => {
    const d = addEquipment(base(), 'medium-laser', 'RA');
    const a = addEquipment(d, 'aes', 'RA');
    expect(line(a, /Tonnage/)).toBeCloseTo(50 * 1.1);
    expect(mechCost(a).total - mechCost(d).total).toBe(50 * 500 * 1.5);
    expect(line(a, /Weapons/)! > line(d, /Weapons/)!).toBe(true);
  });

  it('must go in arms or every leg, never with MASC or a targeting computer', () => {
    expect(errors(addEquipment(base(), 'aes', 'LL')).some((m) => /every leg/.test(m))).toBe(true);
    expect(errors(addEquipment(addEquipment(base(), 'aes', 'LL'), 'aes', 'RL')).some((m) => /every leg/.test(m))).toBe(false);
    expect(errors(addEquipment(addEquipment(base(), 'aes', 'LA'), 'masc', 'LT')).some((m) => /MASC/.test(m))).toBe(true);
  });
});

describe('partial wing', () => {
  it('comes as a pair in the side torsos, 7% of tonnage (Clan 5%), adding jump MP and heat capacity', () => {
    let d = addEquipment(base(50), 'jump-jet', 'LL');
    d = addEquipment(d, 'partial-wing');
    const wings = d.equipment.filter((e) => e.equipmentId === 'partial-wing');
    expect(wings.map((e) => e.location)).toEqual(['LT', 'RT']);
    const s = computeMech(d);
    expect(wings.reduce((a) => a + itemWeight(getEquipment('partial-wing')!, d), 0)).toBe(3.5);
    expect(s.partialWing).toEqual({ jumpBonus: 2, heatBonus: 3 });
    expect(s.totalJumpMP).toBe(3);
    expect(computeMech({ ...d, tonnage: 80 }).partialWing?.jumpBonus).toBe(1);
    expect(removeEquipment(d, wings[0].uid).equipment.some((e) => e.equipmentId === 'partial-wing')).toBe(false);
  });
});

describe('stealth systems', () => {
  it('fill one slot per location and change the BV movement and heat factors', () => {
    const d = addEquipment(base(), 'null-signature-system');
    expect(d.equipment.filter((e) => e.equipmentId === 'null-signature-system')).toHaveLength(7);
    expect(errors(d).filter((m) => /Null/.test(m))).toEqual([]);
    expect(mechBV(d).lines.find(([l]) => /TMM/.test(l))?.[0]).toMatch(/TMM 4/); // run 6 → TMM 2, +2
    const c = addEquipment(base(), 'chameleon-lps');
    expect(c.equipment.filter((e) => e.equipmentId === 'chameleon-lps')).toHaveLength(6);
  });

  it('enforce the combination rules', () => {
    const v = addEquipment(base(), 'void-signature-system');
    expect(errors(v)).toContain('A void-signature system needs an ECM suite.');
    expect(errors(addEquipment(v, 'guardian-ecm', 'LT'))).not.toContain('A void-signature system needs an ECM suite.');
    expect(errors(addEquipment(addEquipment(base(), 'null-signature-system'), 'c3-slave', 'HD'))).toContain('A null-signature system cannot be combined with C3 equipment.');
    expect(errors(addEquipment(addEquipment(base(), 'void-signature-system'), 'chameleon-lps')).some((m) => /chameleon/.test(m))).toBe(true);
  });
});

describe('laser AMS and boosted C3', () => {
  it('laser AMS counts as defensive equipment; boosted C3 matches MegaMek weights', () => {
    expect(line(addEquipment(base(), 'laser-ams', 'CT'), /Defensive equipment/)).toBe(45);
    expect(getEquipment('clan-laser-ams')).toMatchObject({ tons: 1, slots: 1, heat: 5 });
    expect(getEquipment('c3-boosted-master')).toMatchObject({ tons: 6, slots: 6 });
    expect(getEquipment('c3-boosted-slave')).toMatchObject({ tons: 3, slots: 2 });
  });

  it('canon designs with the new equipment convert', () => {
    for (const re of [/"aes"/, /partial-wing/, /laser-ams/, /c3-boosted/, /null-signature/, /void-signature/, /chameleon-lps/]) {
      expect(canon.filter((e) => re.test(JSON.stringify(e.d))).length).toBeGreaterThan(2);
    }
  });
});
