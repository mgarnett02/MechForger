import { describe, expect, it } from 'vitest';
import vessels from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeVessel } from '../data/canonFormat';
import {
  addVesselItem, computeVessel, isVesselEquipment, maxBayDoors, maxDockingCollars, newVessel, parseVessel, validateVessel, vesselArmorPointsPerTon,
  vesselEngineWeight, vesselFreeHeatSinks, vesselFuelPointsPerTon, vesselMaxArmorWeight, vesselReadout,
} from './vessel';
import type { VesselDesign } from './vessel';
import { getEquipment } from './equipment';
import { vesselBV, vesselCost } from './battleValue';
import { vesselSheetData } from './recordSheet';
import { parseAny, unitTypeOf } from '../ui/storage';

const V = vessels as CanonEntry[];
const canon = (n: string) => decodeVessel(V.find((e) => e.n === n)!.d);
const errors = (d: VesselDesign) => validateVessel(d).filter((i) => i.severity === 'error').map((i) => i.message);

describe('small craft and DropShip construction', () => {
  it('engine: tonnage × safe thrust × 0.065 (0.061 Clan), rounded up to the half ton', () => {
    expect(vesselEngineWeight({ tonnage: 3600, safeThrust: 3, techBase: 'IS' })).toBe(702);
    expect(vesselEngineWeight({ tonnage: 3600, safeThrust: 3, techBase: 'Clan' })).toBe(659);
  });

  it('weight-free heat sinks depend on shape and military design', () => {
    const base = { tonnage: 3600, safeThrust: 3, techBase: 'IS' as const, vesselType: 'dropship' as const };
    expect(vesselFreeHeatSinks({ ...base, shape: 'spheroid', military: true })).toBe(69);
    expect(vesselFreeHeatSinks({ ...base, shape: 'spheroid', military: false })).toBe(33);
    expect(vesselFreeHeatSinks({ ...base, shape: 'aerodyne', military: true })).toBe(35);
  });

  it('armor points per ton fall with size; SI caps armor weight', () => {
    expect(vesselArmorPointsPerTon({ vesselType: 'dropship', armorType: 'standard', techBase: 'IS', shape: 'spheroid', tonnage: 3600 })).toBe(16);
    expect(vesselArmorPointsPerTon({ vesselType: 'dropship', armorType: 'standard', techBase: 'IS', shape: 'spheroid', tonnage: 40000 })).toBe(10);
    expect(vesselArmorPointsPerTon({ vesselType: 'dropship', armorType: 'standard', techBase: 'Clan', shape: 'aerodyne', tonnage: 7000 })).toBe(17);
    expect(vesselMaxArmorWeight({ si: 11, shape: 'spheroid' })).toBe(39.5);
    expect(vesselMaxArmorWeight({ si: 8, shape: 'aerodyne' })).toBe(36);
  });

  it('DropShips carry fewer fuel points per ton as they grow', () => {
    expect(vesselFuelPointsPerTon({ vesselType: 'small-craft', tonnage: 200 })).toBe(80);
    expect(vesselFuelPointsPerTon({ vesselType: 'dropship', tonnage: 3600 })).toBe(30);
  });

  it('bay doors are limited', () => {
    expect(maxBayDoors({ vesselType: 'small-craft', shape: 'aerodyne', tonnage: 150 })).toBe(2);
    expect(maxBayDoors({ vesselType: 'dropship', shape: 'spheroid', tonnage: 3600 })).toBe(8);
  });

  it('checks crew, quarters and matching side weapons', () => {
    let d = { ...newVessel('3025'), crew: { crew: 1, officers: 0, gunners: 0, passengers: 0, marines: 0, battleArmor: 0 } };
    expect(errors(d).some((m) => /Needs a crew of/.test(m))).toBe(true);
    d = addVesselItem(newVessel('3025'), 'medium-laser');
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, location: 'LS' as const })) };
    expect(errors(d)).toContain('Left Side and right side weapons must match.');
  });

  it('weapons on DropShips get their own bay unless renumbered', () => {
    let d = addVesselItem(newVessel('3025'), 'ppc');
    d = addVesselItem(d, 'ppc');
    expect(computeVessel(d).weaponBays).toHaveLength(2);
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, bay: 1 })) };
    expect(computeVessel(d).weaponBays).toHaveLength(1);
    expect(vesselSheetData(d).bays[0]).toMatchObject({ name: '2 PPC', heat: 20, av: ['20', '20', '—', '—'] });
  });
});

describe('canon small craft and DropShips', () => {
  it('bundles small craft and DropShips, nearly all legal', () => {
    const small = V.filter((e) => /^(small-craft|dropship)/.test(e.k));
    expect(small.length).toBeGreaterThan(140);
    expect(V.some((e) => e.k.startsWith('small-craft'))).toBe(true);
    expect(small.filter((e) => e.ok).length / small.length).toBeGreaterThan(0.95);
  });

  it('the Union (2708) builds at exactly 3,600 tons', () => {
    const d = canon('Union (2708)');
    const s = computeVessel(d);
    expect(s.weights.total).toBe(3600);
    expect(s.weights.engine).toBe(702);
    expect(errors(d)).toEqual([]);
    expect(s.weaponBays.length).toBe(15);
    expect(vesselBV(d).total).toBeGreaterThan(3000);
    expect(vesselCost(d).lines.at(-1)![1]).toBe(28);
    expect(vesselReadout(d)).toContain("'Mech bay: 4 'Mechs (2 doors)");
  });

  it('saves and loads as a vessel file', () => {
    const d = canon('Union (2708)');
    const back = parseAny(JSON.parse(JSON.stringify(d)));
    expect(unitTypeOf(back)).toBe('vessel');
    expect(parseVessel(JSON.parse(JSON.stringify(d))).bays).toEqual(d.bays);
  });
});

describe('JumpShips, WarShips and space stations', () => {
  it('K-F drives, sails and capital structure', () => {
    const w = newVessel('3025', 'IS', 'warship');
    const s = computeVessel(w);
    expect(s.weights.kfDrive).toBe(Math.ceil(400000 * 0.4525));
    expect(s.weights.sail).toBe(Math.ceil(400000 / 20000) + 30);
    expect(s.weights.structure).toBe(Math.ceil(50 * 400000 / 1000));
    expect(maxDockingCollars({ tonnage: 40000, bays: [] })).toBe(0);
    expect(maxDockingCollars({ tonnage: 150000, bays: [] })).toBe(3);
  });

  it('capital weapons are large-craft only; mass drivers WarShip-only', () => {
    const nac = getEquipment('nac-20')!;
    expect(isVesselEquipment(nac, newVessel('3025', 'IS', 'dropship'))).toBe(false);
    expect(isVesselEquipment(getEquipment('scl-1')!, newVessel('3068', 'IS', 'dropship'))).toBe(true);
    expect(isVesselEquipment(nac, newVessel('3025', 'IS', 'warship'))).toBe(true);
    expect(isVesselEquipment(getEquipment('mass-driver-heavy')!, newVessel('3025', 'IS', 'jumpship'))).toBe(false);
  });

  it('capital bays print capital-scale attack values', () => {
    let d = addVesselItem(newVessel('3025', 'IS', 'warship'), 'nac-20');
    d = addVesselItem(d, 'nac-20');
    d = { ...d, equipment: d.equipment.map((e) => ({ ...e, bay: 1 })) };
    expect(vesselSheetData(d).bays[0]).toMatchObject({ capital: true, av: ['4', '4', '4', '—'] });
  });

  it('bundles canon JumpShips, WarShips and stations', () => {
    for (const t of ['jumpship', 'warship', 'space-station']) expect(V.some((e) => e.k.startsWith(t))).toBe(true);
    const large = V.filter((e) => /^(jumpship|warship)/.test(e.k));
    expect(large.filter((e) => e.ok).length / large.length).toBeGreaterThan(0.8);
  });

  it('a canon WarShip builds to its tonnage', () => {
    const e = V.find((x) => x.k.startsWith('warship') && x.ok && x.w)!;
    const d = decodeVessel(e.d);
    expect(computeVessel(d).weights.total).toBe(d.tonnage);
    expect(errors(d)).toEqual([]);
    expect(vesselBV(d).total).toBeGreaterThan(0);
    expect(vesselCost(d).total).toBeGreaterThan(0);
    const back = parseVessel(JSON.parse(JSON.stringify(d)));
    expect(back.driveCore).toBe(d.driveCore);
    expect(back.gravDecks).toEqual(d.gravDecks);
  });
});
