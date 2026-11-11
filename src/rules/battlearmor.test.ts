import { describe, expect, it } from 'vitest';
import BA from '../data/canon/battlearmor.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeBattleArmor } from '../data/canonFormat';
import type { BattleArmorDesign } from './battlearmor';
import {
  addAPWeapon, addBAItem, battleArmorBV, battleArmorCost, battleArmorReadout, canMakeAntiMek, computeBattleArmor, maxJumpMP,
  maxWalkMP, mountSlots, newBattleArmor, parseBattleArmor, setBAArmorType, validateBattleArmor,
} from './battlearmor';
import { getMM } from './mmEquipment';
import { parseAny, unitTypeOf } from '../ui/storage';

const B = BA as CanonEntry[];
const canon = (n: string) => decodeBattleArmor(B.find((e) => e.n === n)!.d);
const errors = (d: BattleArmorDesign) => validateBattleArmor(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('battle armor construction', () => {
  it('chassis, ground MP and jump jet weights follow the TechManual tables', () => {
    const d = { ...newBattleArmor('3050', 'IS'), walkMP: 2, jumpMP: 3, armor: 0, equipment: [] };
    const s = computeBattleArmor(d);
    expect(s.weights.chassis).toBe(0.175); // IS medium
    expect(s.weights.groundMP).toBe(0.04); // one MP beyond the free one
    expect(s.weights.motive).toBe(0.15); // 3 × 50 kg
    expect(computeBattleArmor({ ...d, techBase: 'Clan' }).weights.chassis).toBe(0.25);
  });

  it('limits movement and slots by weight class and chassis', () => {
    expect(maxWalkMP({ weightClass: 2, chassisType: 'biped' })).toBe(3);
    expect(maxWalkMP({ weightClass: 3, chassisType: 'quad' })).toBe(4);
    expect(maxJumpMP({ weightClass: 1, chassisType: 'biped', motion: 'vtol' })).toBe(6);
    expect(maxJumpMP({ weightClass: 3, chassisType: 'biped', motion: 'vtol' })).toBe(0);
    expect(mountSlots({ weightClass: 2, chassisType: 'biped' }, 'body')).toBe(4);
    expect(mountSlots({ weightClass: 4, chassisType: 'biped' }, 'LA')).toBe(4);
    expect(mountSlots({ weightClass: 3, chassisType: 'quad', turret: { size: 2, modular: true } }, 'body')).toBe(7);
  });

  it('armor weighs per point and its slots are placed as items', () => {
    let d = newBattleArmor('3068', 'IS');
    expect(computeBattleArmor(d).weights.armor).toBeCloseTo(0.25);
    d = setBAArmorType(d, 'IS BA Advanced');
    expect(d.equipment.filter((i) => i.equipmentId === 'IS BA Advanced')).toHaveLength(5);
    expect(computeBattleArmor(d).weights.armor).toBeCloseTo(0.2);
  });

  it('checks weight, armor, manipulators and anti-personnel mounts', () => {
    const d = newBattleArmor('3050', 'IS');
    expect(errors(d)).toEqual([]);
    expect(errors({ ...d, armor: 11 })).toContain('At most 10 armor points per trooper (has 11).');
    expect(errors({ ...d, chassisType: 'quad', jumpMP: 0, motion: 'leg' })).toContain('Quad battle armor cannot use manipulators.');
    const heavy = { ...addBAItem(addBAItem(d, 'ISBASRM6', 'body'), 'ISBASRM6', 'body'), armor: 10 };
    expect(errors(heavy).some((m) => /Each trooper weighs/.test(m))).toBe(true);
    const glove = addBAItem({ ...d, equipment: [] }, 'BAArmoredGlove', 'RA');
    const armed = addAPWeapon(glove, glove.equipment[0].uid, 'InfantryAssaultRifle');
    expect(armed.equipment[1]).toMatchObject({ equipmentId: 'InfantryAssaultRifle', apm: true, mount: 'RA' });
    expect(computeBattleArmor(armed).weights.equipment).toBe(0); // AP weapons are weightless in a mount
  });

  it('a squad support weapon is shared: 50% of its weight (IS), 40% (Clan)', () => {
    const d = { ...newBattleArmor('3050', 'IS'), equipment: [] };
    const w = (x: BattleArmorDesign) => computeBattleArmor(x).weights.equipment;
    const ssw = addBAItem(d, 'ISBAHeavyMachineGun', 'body');
    ssw.equipment[0].ssw = true;
    expect(w(ssw)).toBeCloseTo((getMM('ISBAHeavyMachineGun')!.tonnage as number) * 0.5);
  });
});

describe('battle armor Battle Value and cost', () => {
  it('the Elemental [Laser] (Sqd5) is 447 BV, as on the Master Unit List', () => {
    expect(battleArmorBV(canon('Elemental Battle Armor [Laser](Sqd5)')).total).toBe(447);
  });

  it('BV scales with the squad factor (0.9 + 0.1n) × n', () => {
    const d = canon('Elemental Battle Armor [Laser](Sqd5)');
    const per = battleArmorBV(d).perTrooper;
    expect(battleArmorBV({ ...d, squadSize: 4 }).total).toBe(Math.round(per * 4 * 1.3));
  });

  it('battle claws or basic manipulators allow anti-Mech attacks on light and medium suits', () => {
    expect(canMakeAntiMek(newBattleArmor('3050'))).toBe(true);
    expect(canMakeAntiMek({ ...newBattleArmor('3050'), weightClass: 3 })).toBe(false);
  });

  it('cost: chassis, movement, manipulators, armor and equipment, times the troopers', () => {
    const d = newBattleArmor('3050', 'IS');
    const c = battleArmorCost(d);
    const lines = Object.fromEntries(c.lines);
    expect(lines.Chassis).toBe(100000);
    expect(lines['Jump / VTOL / UMU']).toBe(3 * 75000);
    expect(c.total % d.squadSize).toBe(0);
  });
});

describe('canon battle armor', () => {
  it('bundles canon battle armor, all within weight and nearly all legal', () => {
    expect(B.length).toBeGreaterThan(1100);
    expect(B.every((e) => e.w)).toBe(true);
    expect(B.filter((e) => e.ok).length / B.length).toBeGreaterThan(0.98);
    expect(B.some((e) => e.k.includes(':quad:'))).toBe(true);
  });

  it('saves and loads as a battle armor file', () => {
    const d = canon('Elemental Battle Armor [Laser](Sqd5)');
    const back = parseAny(JSON.parse(JSON.stringify(d)));
    expect(unitTypeOf(back)).toBe('battlearmor');
    expect(parseBattleArmor(JSON.parse(JSON.stringify(d))).equipment.map((i) => i.equipmentId)).toEqual(d.equipment.map((i) => i.equipmentId));
    expect(battleArmorReadout(d)).toContain('Squad: 5 troopers');
  });
});
