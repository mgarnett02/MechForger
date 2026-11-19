import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, encodeMech } from '../data/canonFormat';
import { HAND_ACTUATOR_ID, LOWER_ARM_ACTUATOR_ID, armActuators } from './actuators';
import { computeMech } from './construction';
import {
  actuatorFits, addEquipment, autoAllocate, newDesign, parseDesign, placeItem, removeEquipment, setArmorType, setConfig,
  setItemLocation, splitFor,
} from './edit';
import { mechCost } from './battleValue';
import { addConfiguration, setOmni, switchConfiguration } from './omni';
import { validate } from './validation';
import type { MechDesign } from './types';

const errors = (d: MechDesign) => validate(d).filter((m) => m.severity === 'error').map((m) => m.message);
const labels = (d: MechDesign, loc: 'LA' | 'RA') => computeMech(d).slots[loc].slots.map((s) => s.label);
const find = (d: MechDesign, id: string, loc: string | null) => d.equipment.find((e) => e.equipmentId === id && e.location === loc)!;

describe('arm actuators as equipment', () => {
  it('a new design has lower arm and hand actuators in their default slots', () => {
    const d = newDesign();
    expect(labels(d, 'LA').slice(0, 5)).toEqual(['Shoulder', 'Upper Arm Actuator', 'Lower Arm Actuator', 'Hand Actuator', 'Roll Again']);
    expect(labels(d, 'RA').slice(0, 4)).toEqual(['Shoulder', 'Upper Arm Actuator', 'Lower Arm Actuator', 'Hand Actuator']);
    expect(computeMech(d).slots.LA.free).toBe(8);
    expect(errors(d)).toEqual([]);
  });

  it('they keep their slots ahead of stealth armor and other equipment', () => {
    let d = addEquipment(newDesign('3068'), 'medium-laser', 'LA');
    d = setArmorType({ ...d, equipment: [...d.equipment.slice(-1), ...d.equipment.slice(0, -1)] }, 'stealth');
    expect(labels(d, 'LA').slice(0, 7)).toEqual(['Shoulder', 'Upper Arm Actuator', 'Lower Arm Actuator', 'Hand Actuator', 'Stealth', 'Stealth', 'Medium Laser']);
  });

  it('unallocating the lower arm takes the hand out too; both can be placed back', () => {
    let d = newDesign();
    d = setItemLocation(d, find(d, LOWER_ARM_ACTUATOR_ID, 'LA').uid, null);
    expect(armActuators(d, 'LA')).toEqual({ lowerArm: false, hand: false });
    expect(computeMech(d).unallocated.map((e) => e.equipmentId).sort()).toEqual([HAND_ACTUATOR_ID, LOWER_ARM_ACTUATOR_ID]);
    expect(computeMech(d).slots.LA.free).toBe(10);
    const hand = find(d, HAND_ACTUATOR_ID, null);
    // A hand cannot go back before the lower arm.
    expect(splitFor(d, hand.uid, 'LA')).toBeNull();
    d = placeItem(d, find(d, LOWER_ARM_ACTUATOR_ID, null).uid, 'LA');
    d = placeItem(d, hand.uid, 'LA');
    expect(armActuators(d, 'LA')).toEqual({ lowerArm: true, hand: true });
    expect(labels(d, 'LA').slice(2, 4)).toEqual(['Lower Arm Actuator', 'Hand Actuator']);
  });

  it('removing an actuator frees its slot and its cost', () => {
    const d = newDesign();
    const noHand = removeEquipment(d, find(d, HAND_ACTUATOR_ID, 'RA').uid);
    expect(armActuators(noHand, 'RA')).toEqual({ lowerArm: true, hand: false });
    expect(computeMech(noHand).slots.RA.free).toBe(9);
    expect(mechCost(d).total).toBeGreaterThan(mechCost(noHand).total);
    expect(errors(noHand)).toEqual([]);
    // Removing the lower arm leaves the hand unallocated.
    const noLower = removeEquipment(d, find(d, LOWER_ARM_ACTUATOR_ID, 'RA').uid);
    expect(find(noLower, HAND_ACTUATOR_ID, null)).toBeDefined();
  });

  it('only arms take them, one of each per arm', () => {
    let d = addEquipment(newDesign(), LOWER_ARM_ACTUATOR_ID);
    const extra = d.equipment.at(-1)!;
    expect(actuatorFits(d, extra.uid, 'LA')).toBe(false);
    expect(actuatorFits(d, extra.uid, 'LT')).toBe(false);
    d = { ...d, equipment: d.equipment.map((e) => (e.uid === extra.uid ? { ...e, location: 'LA' as const } : e)) };
    expect(errors(d)).toContain('Left Arm: an arm has only one lower arm actuator.');
    d = setItemLocation(d, extra.uid, 'CT');
    expect(errors(d).some((m) => m.includes('Lower Arm Actuator cannot be mounted in the Center Torso'))).toBe(true);
  });

  it('auto-allocate puts loose actuators back in the arms, lower arm first', () => {
    let d = newDesign();
    d = { ...d, equipment: d.equipment.map((e) => (e.location === 'RA' ? { ...e, location: null } : e)).reverse() };
    d = autoAllocate(d);
    expect(armActuators(d, 'RA')).toEqual({ lowerArm: true, hand: true });
  });

  it('melee weapons still need the right actuators', () => {
    let d = addEquipment(newDesign(), 'hatchet', 'RA');
    expect(errors(d).some((m) => m.includes('needs lower arm and hand'))).toBe(false);
    d = removeEquipment(d, find(d, HAND_ACTUATOR_ID, 'RA').uid);
    expect(errors(d)).toContain('Right Arm: a Hatchet needs lower arm and hand actuators.');
  });

  it('quads drop them; getting arms back restores full actuators', () => {
    const quad = setConfig(newDesign(), 'quad');
    expect(quad.equipment.some((e) => e.equipmentId === LOWER_ARM_ACTUATOR_ID || e.equipmentId === HAND_ACTUATOR_ID)).toBe(false);
    expect(errors(quad).some((m) => m.includes('actuator'))).toBe(false);
    const back = setConfig(quad, 'biped');
    expect(armActuators(back, 'LA')).toEqual({ lowerArm: true, hand: true });
    expect(armActuators(back, 'RA')).toEqual({ lowerArm: true, hand: true });
  });

  it('older saved designs with actuator flags load as actuator items, armoring included', () => {
    const legacy = {
      ...JSON.parse(JSON.stringify(newDesign())),
      actuators: { LA: { lowerArm: true, hand: false }, RA: { lowerArm: false, hand: false } },
      armoredSlots: { LA: [0, 2] },
    };
    legacy.equipment = legacy.equipment.filter((e: { equipmentId: string }) => e.equipmentId === 'heat-sink');
    const d = parseDesign(legacy);
    expect(armActuators(d, 'LA')).toEqual({ lowerArm: true, hand: false });
    expect(armActuators(d, 'RA')).toEqual({ lowerArm: false, hand: false });
    expect(find(d, LOWER_ARM_ACTUATOR_ID, 'LA').armored).toBe(true);
    expect(d.armoredSlots).toEqual({ LA: [0] });
    expect('actuators' in d).toBe(false);
  });

  it('new saved designs round-trip, including actuators deliberately left out', () => {
    const d = newDesign();
    const lessHand = removeEquipment(d, find(d, HAND_ACTUATOR_ID, 'LA').uid);
    const back = parseDesign(JSON.parse(JSON.stringify(lessHand)));
    expect(armActuators(back, 'LA')).toEqual({ lowerArm: true, hand: false });
    expect(armActuators(back, 'RA')).toEqual({ lowerArm: true, hand: true });
    const canon = decodeMech(encodeMech(back));
    expect(armActuators(canon, 'LA')).toEqual({ lowerArm: true, hand: false });
  });

  it('OmniMech configurations keep their own actuators', () => {
    let d = setOmni(newDesign('3050'), true);
    d = addConfiguration(d, true, 'A');
    d = removeEquipment(d, find(d, LOWER_ARM_ACTUATOR_ID, 'LA').uid);
    d = removeEquipment(d, find(d, HAND_ACTUATOR_ID, null).uid);
    const prime = switchConfiguration(d, 0);
    expect(armActuators(prime, 'LA')).toEqual({ lowerArm: true, hand: true });
    expect(prime.equipment.filter((e) => e.equipmentId === LOWER_ARM_ACTUATOR_ID)).toHaveLength(2);
    const a = switchConfiguration(prime, 1);
    expect(armActuators(a, 'LA')).toEqual({ lowerArm: false, hand: false });
    expect(armActuators(a, 'RA')).toEqual({ lowerArm: true, hand: true });
  });

  it('canon units decode with their actuators in the arms', () => {
    const M = mechs as unknown as CanonEntry[];
    const locust = decodeMech(M.find((e) => e.n.startsWith('Locust LCT-1V'))!.d);
    expect(armActuators(locust, 'LA')).toEqual({ lowerArm: false, hand: false });
    for (const e of M.slice(0, 300)) {
      const d = decodeMech(e.d);
      for (const item of d.equipment.filter((x) => x.equipmentId === LOWER_ARM_ACTUATOR_ID || x.equipmentId === HAND_ACTUATOR_ID)) {
        expect(['LA', 'RA']).toContain(item.location);
      }
    }
  });
});
