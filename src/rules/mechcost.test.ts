import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import fighters from '../data/canon/fighters.json';
import support from '../data/canon/support.json';
import vessels from '../data/canon/vessels.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeFighter, decodeMech, decodeSupport, decodeVessel } from '../data/canonFormat';
import { fighterCost, mechCost, supportCost, vesselCost } from './battleValue';
import { kfIntegrity } from './vessel';
import { computeSupport } from './support';
import { computeFighter } from './fighter';

const design = (name: string) => decodeMech((mechs as CanonEntry[]).find((e) => e.n === name)!.d);
const cost = (name: string) => Math.round(mechCost(design(name)).total);

// 'Mech costs matched to MegaMek's (each figure is MegaMek's).
describe("'Mech costs", () => {
  it.each([
    ['Dragon Fire DGR-3F', 17487663], // Good Reputation quirk: × 1.1
    ["Agrotera AGT-UA 'Ariel'", 14059500], // UMUs cost as jump jets
    ['Excalibur EXC-B2b-EC', 16721512], // Clan CASE counted per location, not against the total of mounted CASE
    ['Marauder IIC 4', 21794233], // a split HAG needs Clan CASE in both its locations
    ['Revenant UBM-1A', 2418650], // slotless SRCS ("nocrit:")
  ])('%s', (name, c) => {
    expect(cost(name)).toBe(c);
  });

  it('applies the Good Reputation multiplier', () => {
    const d = design('Dragon Fire DGR-3F');
    expect(d.goodReputation).toBe(1);
    const base = mechCost({ ...d, goodReputation: undefined }).total;
    expect(mechCost(d).total / base).toBeCloseTo(1.1);
    expect(mechCost({ ...d, goodReputation: 2 }).total / base).toBeCloseTo(1.25);
  });
});

const fighterCostOf = (name: string) => fighterCost(decodeFighter((fighters as CanonEntry[]).find((e) => e.n === name)!.d)).total;

// Fighter costs matched to MegaMek's (each figure is MegaMek's).
describe('fighter costs', () => {
  it.each([
    ['Kirghiz A', 20904094], // Clan fighters pay for built-in CASE where they carry explosives
    ['Medium Strike Fighter Defender II C', 835144], // and for every CASE their file lists
    ['Drake Medium Strike Fighter', 1264535], // stealth armor's 10 heat needs heat sinks on a conventional fighter
    ['Planetlifter Air Transport', 345083], // cargo bay doors: 1,000 each
    ['Battle Taxi NL-43', 20420800],
  ])('%s', (name, c) => {
    expect(Math.round(fighterCostOf(name))).toBe(c);
  });

  it('a stealth-armored conventional fighter carries the heat sinks and their weight', () => {
    const s = computeFighter(decodeFighter((fighters as CanonEntry[]).find((e) => e.n === 'Drake Medium Strike Fighter')!.d));
    expect(s.heatSinks.required).toBe(12);
    expect(s.weights.free).toBe(0);
  });
});

const supportOf = (name: string) => decodeSupport((support as CanonEntry[]).find((e) => e.n === name)!.d);

// Support vehicle costs matched to MegaMek's (each figure is MegaMek's).
describe('support vehicle costs', () => {
  it.each([
    ['Buffalo BFFL Hovertruck', 892125], // large hovercraft engines: base value 0.008
    ['Barouche Military Transport', 1510730],
    ['Lewis Skimmer Bus', 827873],
    ['Buffalo BFFL Drone Bomb', 2443500], // drone OS and booby trap weigh a tenth of the tonnage; supercharger 10,000 per engine ton
    ['Hi-Scout Drone (NapFind)', 34526],
  ])('%s', (name, c) => {
    expect(Math.round(supportCost(supportOf(name)).total)).toBe(c);
  });

  it('weighs the drone operating system and booby trap', () => {
    const w = computeSupport(supportOf('Buffalo BFFL Drone Bomb')).weights;
    expect(w.engine).toBe(23);
    expect(w.free).toBe(-2.5); // overweight in MegaMek too
  });
});

const vesselOf = (name: string) => decodeVessel((vessels as CanonEntry[]).find((e) => e.n === name)!.d);

// Spacecraft costs matched to MegaMek's (each figure is MegaMek's).
describe('spacecraft costs', () => {
  it.each([
    ['Black Lion I Battlecruiser', 7019158000], // WarShip K-F integrity: 2 + drive weight / 25,000
    ['Confederate C (3048)', 145840800], // mixed tech: Inner Sphere armor on a Clan hull
    ['Bus S-7AC', 3802500], // the armor's own tech level
    ['Mingo', 123006800], // pre-K-F boom DropShuttle: no docking collar
    ['Black Eagle', 237104000], // fuel rounds to the half ton before the 2% for pumps
    ['Habitat Small (2400)', 392471500], // primitive station armor: 5,000 a ton
    ['Conestoga Transport JumpShip', 12114913000], // primitive armor points ÷ 0.66 round up
  ])('%s', (name, c) => {
    expect(Math.round(vesselCost(vesselOf(name)).total)).toBe(c);
  });

  it('reads WarShip K-F integrity and boomless DropShips', () => {
    expect(kfIntegrity(vesselOf('Black Lion I Battlecruiser'))).toBeGreaterThan(kfIntegrity({ ...vesselOf('Black Lion I Battlecruiser'), vesselType: 'jumpship' }));
    expect(vesselOf('Mingo').noCollar).toBe(true);
    expect(vesselOf('Confederate C (3048)').armorTech).toBe('IS');
  });
});
