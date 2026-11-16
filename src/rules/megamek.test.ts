import { describe, expect, it } from 'vitest';
import M from '../data/canon/mechs.json';
import V from '../data/canon/vehicles.json';
import S from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, decodeVehicle, decodeVessel } from '../data/canonFormat';
import { mechCost, vehicleBV, vesselBV, vesselCost } from './battleValue';
import { computeVessel, validateVessel } from './vessel';

// Values from MegaMek's own BV and cost calculators (tools/megamek-check).
const find = (list: unknown, n: string) => (list as CanonEntry[]).find((e) => e.n === n)!.d;

describe('matches MegaMek', () => {
  it("'Mech cost: every double heat sink is paid for; Clan units pay for built-in CASE", () => {
    expect(mechCost(decodeMech(find(M, 'Griffin GRF-2N'))).total).toBe(5944457);
    expect(mechCost(decodeMech(find(M, 'Dark Crow'))).total).toBe(11827275);
  });

  it('vehicle BV: Artemis anywhere on the vehicle, chassis modifications in the body modifier', () => {
    expect(vehicleBV(decodeVehicle(find(V, 'Ares Medium Tank'))).total).toBe(1151);
    expect(vehicleBV(decodeVehicle(find(V, 'Aesir Medium AA Vehicle'))).total).toBe(768);
  });

  it('WarShip BV: 0.8 type modifier and speed factor from maximum thrust', () => {
    expect(vesselBV(decodeVessel(find(S, 'Aegis Heavy Cruiser (2843)'))).total).toBe(187814);
  });

  it('spacecraft cost: rear side arcs, small craft bays and quarters, primitive armor, DropShuttle hardpoints', () => {
    expect(vesselCost(decodeVessel(find(S, 'Union (2708)'))).total).toBe(214715200);
    expect(vesselCost(decodeVessel(find(S, 'Battle Taxi NL-42'))).total).toBe(14710500);
    expect(vesselCost(decodeVessel(find(S, 'Okinawa (3055)'))).total).toBe(286260800);
  });

  it('pre-2500 DropShip engines are heavier even without primitive armor', () => {
    const jumbo = decodeVessel(find(S, 'Jumbo'));
    expect(jumbo.buildYear).toBe(2423);
    expect(computeVessel(jumbo).weights.engine).toBe(3175);
  });

  it('escape pods are exempt from crew rules; station docking limits are only advice', () => {
    expect(validateVessel(decodeVessel(find(S, 'Escape Pod'))).filter((i) => i.severity === 'error')).toEqual([]);
    expect(validateVessel(decodeVessel(find(S, 'Pressurized Yard Large (2400)'))).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
