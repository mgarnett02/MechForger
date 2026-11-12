import { describe, expect, it } from 'vitest';
import { addVehicleItem, computeVehicle, newVehicle, parseVehicle, validateVehicle, vehicleEngineWeight } from './index';
import type { VehicleDesign } from './vehicle';
import { vehicleFreeHeatSinks, vehicleSlotsUsed } from './vehicle';
import { vehicleBV, vehicleCost } from './battleValue';

const errors = (d: VehicleDesign) => validateVehicle(d).filter((i) => i.severity === 'error').map((i) => i.message);
const tank = (over: Partial<VehicleDesign> = {}): VehicleDesign => ({ ...newVehicle('3151'), tonnage: 50, cruiseMP: 4, ...over });

describe('vehicle engines and armor', () => {
  it('fuel cell, fission and XXL engines', () => {
    // Fission needs shielding (×1.5); fuel cells do not.
    expect(vehicleEngineWeight('fission', 200)).toBeGreaterThan(vehicleEngineWeight('standard', 200)!);
    expect(vehicleEngineWeight('fuel-cell', 200)).toBeLessThan(vehicleEngineWeight('ice', 200)!);
    expect(vehicleEngineWeight('none', 200)).toBe(0);
    expect(vehicleFreeHeatSinks('standard')).toBe(10);
    expect(vehicleFreeHeatSinks('fission')).toBe(5);
    expect(vehicleFreeHeatSinks('fuel-cell')).toBe(1);
    expect(vehicleFreeHeatSinks('ice')).toBe(0);
  });

  it('advanced armor uses item slots; stealth needs ECM', () => {
    const d = tank({ armorType: 'stealth' });
    expect(vehicleSlotsUsed(d)).toBe(2);
    expect(errors(d).some((m) => /needs an ECM/.test(m))).toBe(true);
    expect(errors(addVehicleItem(d, 'guardian-ecm'))).not.toContainEqual(expect.stringMatching(/needs an ECM/));
    expect(vehicleSlotsUsed(tank({ armorType: 'reactive' }))).toBe(2);
  });

  it('stealth armor raises the defensive BV', () => {
    const ecm = addVehicleItem(tank(), 'guardian-ecm');
    expect(vehicleBV({ ...ecm, armorType: 'stealth' }).total).toBeGreaterThan(vehicleBV(ecm).total);
  });
});

describe('combat WiGE', () => {
  it('needs 5 cruise MP and weighs at most 80 tons', () => {
    expect(errors(tank({ motive: 'wige', cruiseMP: 4 }))).toContain('WiGE vehicles need at least 5 cruise MP.');
    expect(errors(tank({ motive: 'wige', cruiseMP: 6 }))).toEqual([]);
    expect(errors(tank({ motive: 'wige', cruiseMP: 6, tonnage: 85 })).some((m) => /1–80 tons/.test(m))).toBe(true);
    expect(computeVehicle(tank({ motive: 'wige', cruiseMP: 6 })).weights.lift).toBe(5);
  });
});

describe('OmniVehicles and trailers', () => {
  it('omni turret weight is fixed by the base chassis', () => {
    let d = tank({ turret: true, omni: true, omniTurretTons: 1 });
    d = addVehicleItem(d, 'ppc');
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, location: 'TU' as const })) };
    expect(computeVehicle(d).weights.turret).toBe(1);
    expect(errors(d).some((m) => /Turret pods/.test(m))).toBe(false);
    const tooSmall = { ...d, omniTurretTons: 0.5 };
    expect(errors(tooSmall).some((m) => /Turret pods weigh 7/.test(m))).toBe(true);
    expect(vehicleCost(d).total).toBeGreaterThan(vehicleCost({ ...d, omni: false }).total);
    expect(parseVehicle(JSON.parse(JSON.stringify(d))).omniTurretTons).toBe(1);
  });

  it('trailers may have no engine, no cruise MP and no controls', () => {
    const t = tank({ trailer: true, noControls: true, engineType: 'none', cruiseMP: 0 });
    expect(errors(t)).toEqual([]);
    expect(computeVehicle(t).weights.controls).toBe(0);
    expect(errors(tank({ engineType: 'none', cruiseMP: 0 })).some((m) => /Only trailers/.test(m))).toBe(true);
    const parsed = parseVehicle(JSON.parse(JSON.stringify(t)));
    expect(parsed.trailer && parsed.noControls).toBe(true);
  });

  it('superchargers weigh 10% of the engine; not on VTOLs', () => {
    const d = addVehicleItem(tank({ engineType: 'standard' }), 'supercharger');
    expect(computeVehicle(d).weights.equipment).toBe(1.5); // 13.5 t engine
    expect(errors({ ...d, motive: 'vtol', tonnage: 30, cruiseMP: 8 })).toContain('VTOLs cannot mount superchargers.');
  });

  it('communications equipment takes one slot whatever its tonnage', () => {
    let d = tank();
    const base = vehicleSlotsUsed(d);
    for (let i = 0; i < 4; i++) d = addVehicleItem(d, 'communications-equipment');
    expect(vehicleSlotsUsed(d)).toBe(base + 1);
  });
});

describe('chassis modifications', () => {
  it('weigh a share of the tonnage', () => {
    const d = addVehicleItem(tank(), 'vehicle-fully-amphibious');
    expect(computeVehicle(d).weights.equipment).toBe(5);
    expect(computeVehicle(addVehicleItem(tank(), 'vehicle-limited-amphibious')).weights.equipment).toBe(2);
    expect(computeVehicle(addVehicleItem(tank(), 'armored-motive-system')).weights.equipment).toBe(7.5);
    expect(computeVehicle(addVehicleItem(tank({ techBase: 'Clan' }), 'clan-armored-motive-system')).weights.equipment).toBe(5);
  });

  it('amphibious chassis only for tracked and wheeled vehicles', () => {
    expect(errors(addVehicleItem(tank({ motive: 'hover', cruiseMP: 6 }), 'vehicle-fully-amphibious')).some((m) => /mphibious/.test(m))).toBe(true);
    expect(errors(addVehicleItem(tank(), 'vehicle-fully-amphibious'))).toEqual([]);
  });
});
