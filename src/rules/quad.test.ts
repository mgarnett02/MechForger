import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { computeMech, fixedSlots } from './construction';
import { addEquipment, maximizeArmor, newDesign, parseDesign, setConfig, setItemRear } from './edit';
import { validate } from './validation';
import { mechBV, mechCost } from './battleValue';
import { internalStructure } from './tables';
import { maxTotalArmor } from './armor';
import { technicalReadout } from './readout';
import { mechSheetData } from './recordSheet';
import { locationAbbr, locationName } from './types';

const M = mechs as CanonEntry[];
const canon = (n: string) => decodeMech(M.find((e) => e.n === n)!.d);
const errors = (d: ReturnType<typeof newDesign>) => validate(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('quad BattleMechs', () => {
  it('front legs use leg internal structure and leg armor maximums', () => {
    expect(internalStructure(80, true)).toMatchObject({ LA: 17, RA: 17, LL: 17, RL: 17, LT: 17, CT: 25 });
    expect(internalStructure(80)).toMatchObject({ LA: 13, RA: 13 });
    // 80 tons: head 9 + 2 × (25 + 17 + 17 + 4 × 17) = 263 (a biped tops out at 247)
    expect(maxTotalArmor(80, true)).toBe(263);
    expect(maxTotalArmor(80)).toBe(247);
  });

  it('has four 6-slot legs with leg actuators and no arms', () => {
    const d = setConfig(newDesign(), 'quad');
    const s = computeMech(d);
    for (const loc of ['LA', 'RA', 'LL', 'RL'] as const) {
      expect(s.slots[loc].capacity).toBe(6);
      expect(fixedSlots(d, loc)).toEqual(['Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator', null, null]);
    }
    expect(locationName(d, 'LA')).toBe('Front Left Leg');
    expect(locationName(d, 'RL')).toBe('Rear Right Leg');
    expect(locationAbbr(d, 'RA')).toBe('FRL');
  });

  it('costs four sets of leg actuators and no arm actuators', () => {
    const biped = maximizeArmor(newDesign());
    const quad = setConfig(biped, 'quad');
    const lines = Object.fromEntries(mechCost(quad).lines);
    expect(lines['Leg actuators']).toBe(4 * (150 + 80 + 120) * 50);
    expect(lines['Arm actuators']).toBeUndefined();
  });

  it('switching to quad unallocates arm items that no longer fit and trims armor', () => {
    let d = maximizeArmor(newDesign());
    d = addEquipment(d, 'ppc', 'RA');
    d = addEquipment(d, 'medium-laser', 'LA');
    const q = setConfig(d, 'quad');
    expect(q.equipment.find((e) => e.equipmentId === 'ppc')!.location).toBeNull();
    expect(q.equipment.find((e) => e.equipmentId === 'medium-laser')!.location).toBe('LA');
    // Back to biped: front-leg armor above the arm maximum is trimmed.
    const quadArmor = maximizeArmor(q);
    const b = setConfig(quadArmor, 'biped');
    expect(b.armor.LA).toBe(computeMech(b).armorMax.LA);
  });

  it('jump jets may go in any of the four legs; leg weapons may face the rear', () => {
    let d = setConfig(newDesign(), 'quad');
    d = addEquipment(d, 'jump-jet', 'LA');
    d = addEquipment(d, 'medium-laser', 'RL');
    d = setItemRear(d, d.equipment.at(-1)!.uid, true);
    expect(errors(d).filter((m) => /jump jet|rear/i.test(m))).toEqual([]);
    // A biped can't put jump jets in its arms or rear-mount leg weapons.
    let b = newDesign();
    b = addEquipment(b, 'jump-jet', 'LA');
    b = addEquipment(b, 'medium-laser', 'RL');
    b = setItemRear(b, b.equipment.at(-1)!.uid, true);
    expect(errors(b).some((m) => /cannot be mounted in the Left Arm/.test(m))).toBe(true);
    expect(errors(b).some((m) => /cannot be rear-mounted there; only torso weapons can face rear/.test(m))).toBe(true);
  });

  it('ammo in any leg of a quad counts as unprotected explosive ammo for BV', () => {
    let biped = addEquipment(addEquipment(newDesign(), 'case', 'LT'), 'ac-5', 'LT');
    biped = addEquipment(biped, 'ammo-ac-5', 'LA');
    const quad = setConfig(biped, 'quad');
    const explosive = (d: typeof biped) => mechBV(d).lines.find(([l]) => /Explosive/.test(l))?.[1] ?? 0;
    expect(explosive(biped)).toBe(0); // arm ammo is covered by CASE in the adjacent torso
    expect(explosive(quad)).toBe(-15); // a front leg is a leg
  });

  it('older saved designs without a configuration load as bipeds', () => {
    const raw = JSON.parse(JSON.stringify(newDesign()));
    delete raw.config;
    expect(parseDesign(raw).config).toBe('biped');
    const q = JSON.parse(JSON.stringify(setConfig(newDesign(), 'quad')));
    expect(parseDesign(q).config).toBe('quad');
  });

  it('bundles canon quads, including quad OmniMechs', () => {
    const quads = M.filter((e) => e.k === 'quad' || e.k.startsWith('quadomni:'));
    expect(quads.length).toBeGreaterThan(40);
    expect(quads.some((e) => e.k.startsWith('quadomni:'))).toBe(true);
    expect(quads.filter((e) => e.w).length / quads.length).toBeGreaterThan(0.95);
  });

  it.each(['Goliath GOL-1H', 'Scorpion SCP-1N', 'Goliath GOL-5D'])('%s builds legally at its canon weight', (n) => {
    const d = canon(n);
    expect(d.config).toBe('quad');
    const s = computeMech(d);
    expect(s.weights.total).toBe(d.tonnage);
    expect(errors(d)).toEqual([]);
  });

  it('prints quad location names in the readout and on the sheet', () => {
    const d = canon('Goliath GOL-5D');
    const text = technicalReadout(d);
    expect(text).toContain('Configuration: Quad');
    expect(text).toContain('Front Left Leg');
    expect(text).toContain('Rear Right Leg');
    const sheet = mechSheetData(d);
    expect(sheet.weapons.some((w) => w.location === 'RLL')).toBe(true);
  });
});
