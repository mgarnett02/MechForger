import { describe, expect, it } from 'vitest';
import V from '../data/canon/vehicles.json';
import S from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeVehicle, decodeVessel } from '../data/canonFormat';
import {
  addVehicleItem, computeVehicle, distributeVehicleArmor, hasSixFacings, isSuperheavyVehicle, newVehicle, parseVehicle,
  setVehicleItemLocation, setVehicleTonnage, suspensionFactor, validateVehicle, vehicleArmorLocations,
} from './vehicle';
import type { VehicleDesign } from './vehicle';
import { vehicleBV, vehicleCost } from './battleValue';
import {
  computeVessel, kfDriveWeight, newVessel, parseVessel, primitiveJumpShipFactor, sailWeight, validateVessel, vesselEngineWeight,
  vesselFuelPointsPerTon, vesselMaxArmor,
} from './vessel';
import type { VesselDesign } from './vessel';

const vErrors = (d: VehicleDesign) => validateVehicle(d).filter((i) => i.severity === 'error').map((i) => i.message);
const sErrors = (d: VesselDesign) => validateVessel(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('superheavy combat vehicles', () => {
  const tank = (t = 150): VehicleDesign => setVehicleTonnage({ ...newVehicle('3081'), engineType: 'standard', heatSinks: 10, cruiseMP: 2 }, t);

  it('tonnage limits and the superheavy suspension tables (as MegaMek)', () => {
    expect(isSuperheavyVehicle(tank(150))).toBe(true);
    expect(isSuperheavyVehicle(tank(100))).toBe(false);
    expect(suspensionFactor('hover', 75)).toBe(280); // 235 + 45
    expect(suspensionFactor('vtol', 55)).toBe(230); // 140 + 45 × 2
    expect(suspensionFactor('wheeled', 120)).toBe(40);
    expect(vErrors({ ...tank(), tonnage: 205 }).some((m) => /1–200 tons/.test(m))).toBe(true);
    expect(vErrors({ ...tank(), motive: 'hydrofoil', tonnage: 120 }).some((m) => /1–100 tons/.test(m))).toBe(true);
  });

  it('six armor facings, doubled structure, legal at 150 tons', () => {
    let d = distributeVehicleArmor(tank(150), 400);
    expect(hasSixFacings(d)).toBe(true);
    expect(vehicleArmorLocations(d)).toEqual(['FR', 'FRS', 'FLS', 'RRS', 'RLS', 'RR']);
    expect(d.armor.FRS + d.armor.RLS).toBeGreaterThan(0);
    const s = computeVehicle(d);
    expect(s.weights.structure).toBe(30); // 20% of 150
    expect(s.weightClass).toBe('Super-heavy');
    d = addVehicleItem(d, 'ac-20');
    d = setVehicleItemLocation(d, d.equipment[0].uid, 'FRS');
    expect(vErrors(d).filter((m) => !/unused|ammunition|Overweight/.test(m))).toEqual([]);
    expect(vehicleBV(d).total).toBeGreaterThan(0);
    expect(vehicleCost(d).total).toBeGreaterThan(vehicleCost(setVehicleTonnage(d, 100)).total);
    expect(parseVehicle(JSON.parse(JSON.stringify(d))).armor.FRS).toBe(d.armor.FRS);
  });

  it('crossing 100 tons splits or merges the side facings, keeping armor and weapons', () => {
    let d = { ...tank(100), armor: { ...tank(100).armor, LS: 21, RS: 20 } };
    d = addVehicleItem(d, 'medium-laser');
    d = setVehicleItemLocation(d, d.equipment[0].uid, 'LS');
    const big = setVehicleTonnage(d, 120);
    expect(big.armor.FLS + big.armor.RLS).toBe(21);
    expect(big.armor.LS).toBe(0);
    expect(big.equipment[0].location).toBe('FLS');
    const back = setVehicleTonnage(big, 90);
    expect(back.armor.LS).toBe(21);
    expect(back.equipment[0].location).toBe('LS');
  });

  it('superheavy VTOLs keep four facings; naval superheavies keep 10% structure', () => {
    const vtol = setVehicleTonnage({ ...newVehicle('3081'), motive: 'vtol', engineType: 'standard', cruiseMP: 6 }, 50);
    expect(isSuperheavyVehicle(vtol)).toBe(true);
    expect(hasSixFacings(vtol)).toBe(false);
    const ship = { ...newVehicle('3081'), motive: 'naval' as const, tonnage: 400, cruiseMP: 2 };
    expect(computeVehicle(ship).weights.structure).toBe(40);
  });

  it('canon superheavies convert legally at their exact tonnage', () => {
    for (const n of ['Burke II Superheavy Tank', 'Kamakiri Attack VTOL', 'Teppō Artillery Vehicle']) {
      const d = decodeVehicle((V as CanonEntry[]).find((e) => e.n === n)!.d);
      expect(isSuperheavyVehicle(d)).toBe(true);
      expect(computeVehicle(d).weights.total).toBe(d.tonnage);
      expect(vErrors(d)).toEqual([]);
    }
  });
});

describe('primitive JumpShips', () => {
  const js = (): VesselDesign => ({ ...newVessel('3025', 'IS', 'jumpship'), tonnage: 100000, driveCore: 'primitive', jumpRange: 15, primitiveYear: 2150, sail: true });

  it('primitive K-F drive: 5% + 3% per light-year', () => {
    expect(kfDriveWeight(js())).toBe(50000);
    expect(kfDriveWeight({ ...js(), jumpRange: 30 })).toBe(95000);
  });

  it('year-based engine, control, fuel and sail factors; 66% armor', () => {
    const d = { ...js(), safeThrust: 1 };
    expect(primitiveJumpShipFactor('engine', 2150)).toBe(0.12);
    expect(vesselEngineWeight(d)).toBe(12000); // 100,000 × 1 × 0.12
    expect(computeVessel(d).weights.controls).toBe(625); // 0.00625
    expect(vesselFuelPointsPerTon(d)).toBe(5); // 10 ÷ 2
    expect(sailWeight(d)).toBe(350); // 100,000 / 2000 + 300
    const modern = { ...d, driveCore: 'standard' as const };
    expect(vesselMaxArmor(d)).toBe(Math.floor(vesselMaxArmor(modern) * 0.66));
    expect(parseVessel(JSON.parse(JSON.stringify(d))).jumpRange).toBe(15);
  });

  it('checks: jump range 1–30, needs a year, only on JumpShips', () => {
    expect(sErrors({ ...js(), jumpRange: 40 })).toContain('A primitive K-F drive jumps 1–30 light-years.');
    expect(sErrors({ ...js(), primitiveYear: undefined })).toContain('A primitive K-F drive needs a year of construction.');
    expect(sErrors({ ...newVessel('3025', 'IS', 'space-station'), driveCore: 'primitive', primitiveYear: 2200 }))
      .toContain('Only JumpShips can have a primitive K-F drive core.');
  });

  it('canon primitive JumpShips are legal', () => {
    for (const n of ['Aquilla Transport JumpShip', 'Conestoga Transport JumpShip']) {
      const d = decodeVessel((S as CanonEntry[]).find((e) => e.n === n)!.d);
      expect(d.driveCore).toBe('primitive');
      expect(Math.abs(computeVessel(d).weights.total - d.tonnage)).toBeLessThan(10);
      expect(sErrors(d)).toEqual([]);
    }
  });
});
