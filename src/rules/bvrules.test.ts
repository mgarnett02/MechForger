import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import vehicles from '../data/canon/vehicles.json';
import fighters from '../data/canon/fighters.json';
import support from '../data/canon/support.json';
import vessels from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeFighter, decodeMech, decodeSupport, decodeVehicle, decodeVessel } from '../data/canonFormat';
import { fighterBV, mechBV, supportBV, vehicleBV, vesselBV } from './battleValue';

const find = (list: unknown, name: string) => (list as CanonEntry[]).find((e) => e.n === name)!.d;

// Canon units whose BV now matches MegaMek after fixing MechForger's BV rules (MegaMek's figure in each case).
describe('BV rules matched to MegaMek', () => {
  it.each([
    ['Black Knight BLK-NT-3A', 1707], // shields are defensive equipment; medium/large shields cost a walking MP
    ['Valiant VLN-3T', 852], // small shield: defensive BV
    ['Trebuchet TBT-XK7', 1549], // modular armor's jump penalty is ignored for BV
    ['Prefect PRF-3R', 2412], // TSEMP cannons are explosive
    ['Flashfire FLS-P5', 654], // fluid gun ammunition is not explosive
    ['Hercules HRC-LS-9004', 1824], // Blue Shield: +0.2 armor and structure multipliers, explosive
    ['Centurion CN9-H', 848], // rocket launchers count a quarter of their heat
    ['Marauder MAD-9W', 1788], // improved jump jets heat for half the jump MP
    ['Demeter WLD-1 AgroMech', 321], // extended fuel tanks are explosive
    ['Mantis MTS-L', 1194], // TSM's walking MP bonus counts before a supercharger doubles it
    ['Omen 2', 2380], // HarJel III: −2 defensive BV each
    ['Cuirass CDR-2BC', 990], // vibroblades generate heat
    ['Aquagladius AQS-5 MAM', 1946], // hardened armor costs running MP only on the legs
    ["'Gestalt' D2X-G", 2329], // interface cockpit ×1.3
    ["Tessen TSN-X4R 'Rapunzel'", 1494], // RISC laser pulse module: ×1.15, +2 heat, explosive
  ])('%s', (name, bv) => {
    expect(mechBV(decodeMech(find(mechs, name))).total).toBe(bv);
  });

  it('vehicles', () => {
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Gun Trailer (Ultra)'))).total).toBe(491); // trailers count 1 MP for speed
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Pegasus Scout Hover Tank (Unarmed)'))).total).toBe(317); // empty turret keeps its armor
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Partisan Hull Defense'))).total).toBe(1207); // Blue Shield
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Bardiche Heavy Strike Tank C'))).total).toBe(1291); // mine sweeper 30 BV
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Donar Assault Helicopter (Close Support)'))).total).toBe(582); // mast mount
    expect(vehicleBV(decodeVehicle(find(vehicles, 'Mamono IFV'))).total).toBe(1422); // Apollo links anywhere on a vehicle
  });

  it('fighters, support vehicles and spacecraft', () => {
    expect(fighterBV(decodeFighter(find(fighters, 'Batu Z'))).total).toBe(3164); // iATMs count half heat
    expect(fighterBV(decodeFighter(find(fighters, 'Drake Medium Strike Fighter'))).total).toBe(437); // modular armor
    expect(fighterBV(decodeFighter(find(fighters, 'Deathstalker XF-78'))).total).toBe(2258); // CASE II protects
    expect(fighterBV(decodeFighter(find(fighters, 'Bullet Suicide Drone'))).total).toBe(77); // drone OS ×0.95 once
    expect(supportBV(decodeSupport(find(support, 'Shackleton AESV'))).total).toBe(271); // jump jets add to speed
    expect(supportBV(decodeSupport(find(support, 'Silverfin Coastal Cutter'))).total).toBe(183); // hydrofoil ×1.25 MP
    expect(vesselBV(decodeVessel(find(vessels, 'Union (3070)'))).total).toBe(4954); // AMS ammo counted by shots
    expect(vesselBV(decodeVessel(find(vessels, 'Tramp JumpShip (3071)'))).total).toBe(1788); // screen launchers defensive
  });
});
