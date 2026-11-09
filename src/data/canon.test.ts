import { describe, expect, it } from 'vitest';
import mechs from './canon/mechs.json';
import vehicles from './canon/vehicles.json';
import type { CanonEntry } from './canonFormat';
import { decodeMech, decodeVehicle } from './canonFormat';
import { computeMech } from '../rules/construction';
import { mechBV, mechCost } from '../rules/battleValue';
import { computeVehicle } from '../rules/vehicle';
import { switchConfiguration } from '../rules/omni';

const M = mechs as CanonEntry[];
const V = vehicles as CanonEntry[];
const mech = (n: string) => decodeMech(M.find((e) => e.n === n)!.d);

describe('bundled canon units', () => {
  it('contain a large converted set', () => {
    expect(M.length).toBeGreaterThan(1500);
    expect(V.length).toBeGreaterThan(500);
  });

  it('every entry decodes and computes', () => {
    for (const e of M) expect(computeMech(decodeMech(e.d)).weights.total).toBeGreaterThan(0);
    for (const e of V) expect(computeVehicle(decodeVehicle(e.d)).weights.total).toBeGreaterThan(0);
  });

  it('nearly all canon mechs come out at exactly their published tonnage', () => {
    expect(M.filter((e) => e.w).length / M.length).toBeGreaterThan(0.98);
  });

  it.each([
    ['Atlas AS7-D', 1897], ['Hunchback HBK-4G', 1041], ['Locust LCT-1V', 432], ['Wasp WSP-1A', 384],
    ['Marauder MAD-3R', 1363], ['Warhammer WHM-6R', 1299], ['Rifleman RFL-3N', 1039], ['Catapult CPLT-C1', 1399],
    ['Commando COM-2D', 541], ['Jenner JR7-D', 875], ['Shadow Hawk SHD-2H', 1064], ['Griffin GRF-1N', 1272],
    ['Stalker STK-3F', 1559], ['BattleMaster BLR-1G', 1519], ['Thunderbolt TDR-5S', 1335],
  ])('%s has its Master Unit List BV of %i', (name, bv) => {
    expect(mechBV(mech(name)).total).toBe(bv);
  });

  it('OmniMech configurations are grouped (Timber Wolf Prime BV 2,737)', () => {
    const d = mech('Timber Wolf (Mad Cat)');
    expect(d.omni!.configurations.length).toBeGreaterThan(5);
    expect(mechBV(switchConfiguration(d, 0)).total).toBe(2737);
    expect(d.omni!.configurations[0].name).toBe('Prime');
  });

  it('Atlas AS7-D costs 9,626,000 C-bills', () => {
    expect(mechCost(mech('Atlas AS7-D')).total).toBe(9626000);
  });
});
