import { describe, expect, it } from 'vitest';
import {
  addSupportItem, barWeightPerPoint, computeSupport, kgPerFuelPoint, newSupportVehicle, parseSupport,
  setSupportType, sizeClass, supportReadout, svMaxArmor, validateSupport,
} from './index';
import type { SupportVehicleDesign } from './support';
import support from '../data/canon/support.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeSupport } from '../data/canonFormat';

const S = support as CanonEntry[];
const errors = (d: SupportVehicleDesign) => validateSupport(d).filter((i) => i.severity === 'error').map((i) => i.message);
const canon = (n: string) => decodeSupport(S.find((e) => e.n === n)!.d);

describe('support vehicle tables', () => {
  it('size classes', () => {
    expect(sizeClass({ svType: 'wheeled', tonnage: 4.5 })).toBe('small');
    expect(sizeClass({ svType: 'wheeled', tonnage: 80 })).toBe('medium');
    expect(sizeClass({ svType: 'wheeled', tonnage: 81 })).toBe('large');
    expect(sizeClass({ svType: 'vtol', tonnage: 31 })).toBe('large');
  });

  it('BAR armor weights and maximum armor', () => {
    expect(barWeightPerPoint(5, 'D')).toBe(0.032);
    expect(barWeightPerPoint(10, 'C')).toBe(0); // not available at C
    expect(svMaxArmor({ svType: 'wheeled', tonnage: 20 })).toBe(44); // 4 + 20 × 2
    expect(svMaxArmor({ svType: 'vtol', tonnage: 20 })).toBe(24);
  });

  it('structure, engine and fuel', () => {
    // 20 t wheeled, D/D, cruise 6, ICE: structure 20 × 0.15 = 3; engine 0.0075 × (4+36) × 1.5 × 20 = 9.
    const s = computeSupport(newSupportVehicle());
    expect(s.weights.structure).toBe(3);
    expect(s.weights.engine).toBe(9);
    const plane = { ...newSupportVehicle(), svType: 'fixed-wing' as const, tonnage: 50 };
    expect(kgPerFuelPoint(plane)).toBe(20); // medium, D
    expect(kgPerFuelPoint({ ...plane, chassisMods: ['prop'] })).toBe(15);
  });

  it('chassis modifications multiply structure weight', () => {
    const base = computeSupport(newSupportVehicle()).weights.structure;
    const armored = computeSupport({ ...newSupportVehicle(), chassisMods: ['armored'] }).weights.structure;
    expect(armored).toBe(base * 1.5 > 4 ? Math.ceil(base * 1.5 * 2) / 2 : 4.5);
  });
});

describe('support vehicle validation', () => {
  it('engine availability by tech rating and type', () => {
    expect(errors({ ...newSupportVehicle(), engineType: 'fusion', engineTech: 'B', fuel: 0 })).toContain('Fusion engines are not available at engine tech rating B.');
    expect(errors({ ...newSupportVehicle(), engineType: 'maglev' }).some((m) => m.includes('cannot power wheeled'))).toBe(true);
  });

  it('chassis mods by type and size', () => {
    expect(errors({ ...newSupportVehicle(), chassisMods: ['vstol'] }).some((m) => m.includes('VSTOL modification cannot'))).toBe(true);
    expect(errors({ ...newSupportVehicle(), chassisMods: ['bicycle'] }).some((m) => m.includes('small support vehicles only'))).toBe(true);
  });

  it('fuel, BAR and small-vehicle weapons', () => {
    expect(errors({ ...newSupportVehicle(), fuel: 0 })).toContain('This engine needs some weight allocated to fuel.');
    expect(errors({ ...newSupportVehicle(), armorTech: 'C', bar: 10, armor: { FR: 5 } }).some((m) => m.includes('BAR 10 armor is not available'))).toBe(true);
    const tiny = { ...addSupportItem({ ...newSupportVehicle(), tonnage: 3 }, 'machine-gun') };
    expect(errors(tiny).some((m) => m.includes('infantry weapons'))).toBe(true);
  });

  it('switching type keeps valid settings', () => {
    const plane = setSupportType(newSupportVehicle(), 'fixed-wing');
    expect(computeSupport(plane).armorLocations).toEqual(['NO', 'LW', 'RW', 'AF']);
    const train = setSupportType({ ...newSupportVehicle(), engineType: 'steam' }, 'rail');
    expect(train.engineType).toBe('steam');
  });

  it('JSON round trip and readout', () => {
    const d = canon('Prime Mover (Succession Wars)');
    expect(computeSupport(parseSupport(JSON.parse(JSON.stringify(d)))).weights).toEqual(computeSupport(d).weights);
    expect(supportReadout(d)).toContain('Wheeled support vehicle');
  });
});

describe('canon support vehicles', () => {
  it('a substantial set is bundled', () => {
    expect(S.length).toBeGreaterThan(100);
  });

  it('most weigh exactly their published tonnage', () => {
    expect(S.filter((e) => e.w).length / S.length).toBeGreaterThan(0.6);
  });

  it.each(['Prime Mover (Succession Wars)', 'Cobra VTOL Transport', 'Caravan Heavy Transport', 'Flatbed Railcar', 'Silverback Coastal Cutter'])(
    '%s comes out at exactly its tonnage', (n) => {
      const d = canon(n);
      expect(computeSupport(d).weights.total).toBe(d.tonnage);
    },
  );
});
