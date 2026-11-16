import { describe, expect, it } from 'vitest';
import S from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeVessel } from '../data/canonFormat';
import { addVesselItem, computeVessel, isVesselEquipment, newVessel, validateVessel, vesselFormulaWeight } from './vessel';
import { getEquipment } from './equipment';
import { isVehicleEquipment } from './vehicle';
import { vesselCost } from './battleValue';

describe('spacecraft equipment', () => {
  it('formula weights as MegaMek: naval C3 1%, tug adaptor 100 t + 10%, Caspar by craft type', () => {
    expect(vesselFormulaWeight('naval-c3', { tonnage: 500000, vesselType: 'warship' })).toBe(5000);
    expect(vesselFormulaWeight('naval-tug-adaptor', { tonnage: 2000, vesselType: 'dropship' })).toBe(300);
    expect(vesselFormulaWeight('caspar-dcs', { tonnage: 3000, vesselType: 'dropship' })).toBe(120); // 4%
    expect(vesselFormulaWeight('improved-caspar-ii-dcs', { tonnage: 200, vesselType: 'small-craft' })).toBe(16); // 6% + 2%
    expect(vesselFormulaWeight('sds-self-destruct', { tonnage: 300000, vesselType: 'warship' })).toBe(10000); // capped
  });

  it('fixed-weight items, costs, and only on spacecraft', () => {
    const d = addVesselItem(addVesselItem({ ...newVessel('3025', 'IS', 'dropship'), tonnage: 5000 }, 'naval-comm-scanner-small'), 'caspar-dcs');
    expect(computeVessel(d).weights.equipment).toBe(100 + 200);
    expect(vesselCost(d).total).toBeGreaterThan(vesselCost({ ...d, equipment: [] }).total);
    expect(isVesselEquipment(getEquipment('naval-c3')!)).toBe(true);
    expect(isVehicleEquipment(getEquipment('naval-c3')!)).toBe(false);
  });

  it('canon craft with comm-scanner suites, naval C3 and MASH now load', () => {
    const list = (S as CanonEntry[]).map((e) => decodeVessel(e.d));
    for (const id of ['naval-comm-scanner-small', 'naval-c3', 'mash-core', 'naval-tug-adaptor']) {
      const withIt = list.filter((d) => d.equipment.some((e) => e.equipmentId === id));
      expect(withIt.length, id).toBeGreaterThan(0);
      expect(withIt.some((d) => validateVessel(d).every((i) => i.severity !== 'error')), id).toBe(true);
    }
  });
});
