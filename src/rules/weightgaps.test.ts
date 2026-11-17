import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import vehicles from '../data/canon/vehicles.json';
import fighters from '../data/canon/fighters.json';
import support from '../data/canon/support.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeFighter, decodeMech, decodeSupport, decodeVehicle } from '../data/canonFormat';
import { computeMech, getEquipment, isDirectFire } from './index';
import { computeVehicle, newVehicle, newVehicleUid } from './vehicle';
import { computeFighter } from './fighter';
import { computeSupport } from './support';

const find = (list: unknown, name: string) => (list as CanonEntry[]).find((e) => e.n === name)!.d;

// Canon units MechForger used to find overweight although MegaMek accepts them.
describe('weight rules matched to MegaMek', () => {
  it('fluid guns, the APDS and other non-direct-fire weapons do not size a targeting computer', () => {
    for (const id of ['fluid-gun', 'apds', 'mech-taser', 'silver-bullet-gauss', 'nail-rivet-gun']) expect(isDirectFire(getEquipment(id)!)).toBe(false);
    expect(computeMech(decodeMech(find(mechs, 'Valiant VLT-3E'))).weights.free).toBe(0);
    expect(computeVehicle(decodeVehicle(find(vehicles, 'Padilla Anti-Missile Tank'))).weights.free).toBe(0);
  });

  it('mixed-tech vehicles can mount Clan armor on an Inner Sphere chassis', () => {
    const d = decodeVehicle(find(vehicles, 'Tokugawa Heavy Tank Yumi'));
    expect(d.armorTech).toBe('Clan');
    expect(computeVehicle(d).armorPointsPerTon).toBeCloseTo(19.2);
    expect(computeVehicle(d).weights.free).toBe(0);
    // Without mixed tech the armor tech is the chassis'.
    expect(computeVehicle({ ...d, mixedTech: false }).armorPointsPerTon).toBeCloseTo(17.92);
  });

  it('Clan CASE weighs nothing', () => {
    expect(getEquipment('clan-case')).toMatchObject({ tons: 0, techBase: 'Clan' });
    expect(computeVehicle(decodeVehicle(find(vehicles, 'Skulker Wheeled Scout Tank C'))).weights.free).toBe(0);
  });

  it('laser insulators take a heat off each laser for a heat-neutral unit', () => {
    const base = { ...newVehicle('3131'), engineType: 'standard' as const, cruiseMP: 4, tonnage: 40, heatSinks: 10 };
    const lasers = ['medium-re-engineered-laser', 'medium-re-engineered-laser'].map((equipmentId) => ({ uid: newVehicleUid(), equipmentId, location: 'FR' as const }));
    expect(computeVehicle({ ...base, equipment: lasers }).energyHeat).toBe(12);
    const insulated = [...lasers, ...[1, 2].map(() => ({ uid: newVehicleUid(), equipmentId: 'laser-insulator', location: 'BD' as const }))];
    expect(computeVehicle({ ...base, equipment: insulated }).energyHeat).toBe(10);
    expect(computeVehicle(decodeVehicle(find(vehicles, 'Pandion Combat WiGE (3140 Upgrade)'))).weights.free).toBe(0);
  });

  it('chemical lasers need no power amplifiers on an ICE conventional fighter', () => {
    const s = computeFighter(decodeFighter(find(fighters, 'Medium Strike Fighter Defender II C')));
    expect(s.weights.powerAmplifiers).toBe(0);
    expect(s.weights.free).toBe(0);
  });

  it('support vehicle fire control ignores light infantry weapons, and kilogram totals are exact', () => {
    const limpet = computeSupport(decodeSupport(find(support, 'Limpet Half-Track')));
    expect(limpet.weights.fireControl).toBe(0.003);
    expect(limpet.weights.free).toBe(0);
    expect(computeSupport(decodeSupport(find(support, 'Beast Riot Car'))).weights.free).toBe(0);
  });
});
