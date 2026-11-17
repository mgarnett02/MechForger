import { describe, expect, it } from 'vitest';
import vehicles from '../data/canon/vehicles.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeVehicle } from '../data/canonFormat';
import { vehicleCost } from './battleValue';
import { vehicleCargoCost } from './vehicle';

const cost = (name: string) => vehicleCost(decodeVehicle((vehicles as CanonEntry[]).find((e) => e.n === name)!.d)).total;

// Combat vehicle costs matched to MegaMek's (each figure is MegaMek's).
describe('combat vehicle costs', () => {
  it.each([
    ['Flatbed Truck', 27300], // cargo bays cost 1,000 per door, not 5,000 a ton
    ['Badger Tracked Transport A', 860438], // infantry compartments cost nothing
    ['Coolant Truck 135-K', 217350], // insulated bays: 250 a ton
    ['Bellona Hover Tank', 2246275], // Clan vehicles buy CASE where they carry explosives
    ['Eurus MBT C', 13441000], // AP Gauss rifle 8,500, ammo 1,000 a ton; CASE in the turret and the body
    ['Hanse MBT', 17897688], // plasma rifle ammo 30,000 a ton
    ['Skanda Light Tank (TSEMP)', 4809870], // TSEMP cannons call for Clan CASE
    ['Morningstar City Command Vehicle (HPG)', 5206100250], // a ground-mobile HPG needs heat sinks
    ['Chalchiuhtotolin Support Tank', 1883646], // unset armor tech level: Inner Sphere ferro-fibrous
    ['Epona Pursuit Tank E', 4644167], // slotless Clan CASE
  ])('%s', (name, c) => {
    expect(cost(name)).toBe(c);
  });

  it('prices troop space and cargo bays', () => {
    expect(vehicleCargoCost({ cargo: 6 })).toBe(1000);
    expect(vehicleCargoCost({ cargo: 4, troopSpace: 4 })).toBe(0);
    expect(vehicleCargoCost({ cargo: 9, cargoBays: 2, cargoDoors: 2, specialCargo: [{ kind: 'insulated', tons: 6.5 }, { kind: 'insulated', tons: 2.5 }] })).toBe(2000 + 250 * 7 + 250 * 3);
  });
});
