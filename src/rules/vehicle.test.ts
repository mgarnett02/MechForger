import { describe, expect, it } from 'vitest';
import {
  addVehicleItem, computeVehicle, distributeVehicleArmor, newVehicle, parseVehicle, setVehicleEngine,
  setVehicleMotive, setVehicleTurret, suspensionFactor, validateVehicle, vehicleEngineRating,
  vehicleEngineWeight, vehicleMaxArmor, vehicleReadout, vehicleSlotCapacity, setVehicleItemLocation,
} from './index';
import type { VehicleDesign } from './vehicle';
import { VEHICLE_PRESETS } from '../data/vehicles';

const errors = (d: VehicleDesign) => validateVehicle(d).filter((i) => i.severity === 'error').map((i) => i.message);
const preset = (k: string) => VEHICLE_PRESETS.find((p) => p.key.startsWith(k))!.build();

describe('vehicle tables', () => {
  it('suspension factors', () => {
    expect(suspensionFactor('tracked', 50)).toBe(0);
    expect(suspensionFactor('wheeled', 30)).toBe(20);
    expect(suspensionFactor('hover', 10)).toBe(40);
    expect(suspensionFactor('hover', 20)).toBe(85);
    expect(suspensionFactor('hover', 50)).toBe(235);
    expect(suspensionFactor('vtol', 30)).toBe(140);
    expect(suspensionFactor('naval', 200)).toBe(30);
  });

  it('engine rating = cruise × tonnage − suspension, rounded up to 5', () => {
    expect(vehicleEngineRating('tracked', 50, 4)).toBe(200);
    expect(vehicleEngineRating('hover', 20, 8)).toBe(75);
    expect(vehicleEngineRating('vtol', 20, 10)).toBe(105);
    expect(vehicleEngineRating('wheeled', 33, 5)).toBe(145); // 165 − 20
    expect(vehicleEngineRating('hover', 5, 8)).toBe(10); // minimum
  });

  it('engine weights: ICE ×2, fusion ×1.5 for shielding', () => {
    expect(vehicleEngineWeight('ice', 200)).toBe(17);
    expect(vehicleEngineWeight('standard', 105)).toBe(5.5); // 3.5 × 1.5 = 5.25
    expect(vehicleEngineWeight('standard', 270)).toBe(22); // 14.5 × 1.5 = 21.75
    expect(vehicleEngineWeight('xl', 200)).toBe(7); // 4.5 × 1.5 = 6.75
  });

  it('armor maximum and slots', () => {
    expect(vehicleMaxArmor(50)).toBe(215);
    expect(vehicleMaxArmor(25)).toBe(127);
    expect(vehicleSlotCapacity(50)).toBe(15);
  });
});

describe('sample vehicles', () => {
  for (const p of VEHICLE_PRESETS) {
    it(`${p.key} is exactly at tonnage with no warnings or errors`, () => {
      const d = p.build();
      const s = computeVehicle(d);
      expect(s.weights.total).toBe(d.tonnage);
      expect(validateVehicle(d).filter((i) => i.severity !== 'info')).toEqual([]);
    });
  }

  it('Bastion breakdown', () => {
    const s = computeVehicle(preset('Bastion'));
    expect(s.weights).toMatchObject({ structure: 5, engine: 17, controls: 2.5, turret: 1.5, lift: 0, armor: 7 });
    expect(s.slots).toEqual({ used: 4, capacity: 15 });
  });

  it('readout', () => {
    const text = vehicleReadout(preset('Gadfly'));
    expect(text).toContain('Type: VTOL vehicle, 20 tons');
    expect(text).toContain('Rotor:');
    expect(text).toContain('Engine: 105 Fusion');
  });
});

describe('vehicle validation', () => {
  it('tonnage limits by motive type', () => {
    expect(errors({ ...newVehicle(), motive: 'vtol', tonnage: 35 }).some((m) => m.includes('1–30 tons'))).toBe(true);
    expect(setVehicleMotive({ ...newVehicle(), tonnage: 90 }, 'hover').tonnage).toBe(50);
    expect(errors({ ...newVehicle(), motive: 'naval', tonnage: 300, cruiseMP: 1 }).some((m) => m.includes('tons'))).toBe(false);
  });

  it('armor total and VTOL rotor limits', () => {
    const d = preset('Gadfly');
    expect(errors({ ...d, armor: { ...d.armor, RO: 3 } })).toContain('A VTOL rotor can carry at most 2 points of armor.');
    expect(errors({ ...d, armor: { ...d.armor, FR: 60 } }).some((m) => m.includes('exceeds the maximum of 110'))).toBe(true);
  });

  it('energy weapons need heat sinks; ICE engines need power amplifiers', () => {
    let d = setVehicleItemLocation(addVehicleItem(newVehicle(), 'large-laser'), '', null);
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, location: 'FR' as const })) };
    expect(errors(d)).toContain('Energy weapons generate 8 heat but only 0 heat sink(s) are fitted.');
    expect(computeVehicle(d).weights.powerAmplifiers).toBe(0.5);
    const fusion = setVehicleEngine(d, 'standard');
    expect(fusion.heatSinks).toBe(10);
    expect(errors(fusion).some((m) => m.includes('heat'))).toBe(false);
    expect(computeVehicle(fusion).weights.powerAmplifiers).toBe(0);
  });

  it('ballistic and missile weapons generate no vehicle heat', () => {
    const d = preset('Bastion');
    expect(computeVehicle(d).energyHeat).toBe(0);
  });

  it('item slots', () => {
    let d: VehicleDesign = { ...newVehicle(), tonnage: 10, motive: 'wheeled' }; // 7 slots
    for (let i = 0; i < 8; i++) d = addVehicleItem(d, 'machine-gun');
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, location: 'FR' as const })) };
    expect(errors(d).some((m) => m.includes('Uses 8 item slots; a 10-ton vehicle has 7'))).toBe(true);
  });

  it('turret and body placement rules', () => {
    let d = addVehicleItem(newVehicle(), 'ac-5');
    const uid = d.equipment[0].uid;
    d = setVehicleItemLocation(d, uid, 'TU');
    expect(errors(d).some((m) => m.includes('cannot be mounted in the turret'))).toBe(true);
    d = setVehicleTurret(d, true);
    expect(errors(d).some((m) => m.includes('cannot be mounted'))).toBe(false);
    expect(setVehicleTurret(d, false).equipment[0].location).toBeNull();
    const ammo = addVehicleItem(newVehicle(), 'ammo-ac-5');
    expect(ammo.equipment[0].location).toBe('BD');
  });

  it('era and tech base', () => {
    const xl = { ...newVehicle('3025'), engineType: 'xl' as const };
    expect(errors(xl)).toContain('XL engines cannot be used in the Succession Wars era.');
    const clanGun = { ...addVehicleItem(newVehicle('3050'), 'clan-er-large-laser') };
    expect(errors(clanGun).some((m) => m.includes('Clan ER Large Laser is not available to Inner Sphere'))).toBe(true);
    const masc = addVehicleItem(newVehicle('3050'), 'masc');
    expect(errors(masc)).toContain('MASC cannot be mounted on a vehicle.');
  });

  it('armor distribution respects the maximum and the rotor cap', () => {
    const d = distributeVehicleArmor({ ...newVehicle(), motive: 'vtol', tonnage: 20 }, 500);
    const total = Object.values(d.armor).reduce((a, b) => a + b, 0);
    expect(total).toBe(110);
    expect(d.armor.RO).toBe(2);
  });

  it('JSON round trip', () => {
    const d = preset('Hellforge');
    expect(computeVehicle(parseVehicle(JSON.parse(JSON.stringify(d)))).weights).toEqual(computeVehicle(d).weights);
    expect(() => parseVehicle({ unitType: 'mech' })).toThrow();
  });
});
