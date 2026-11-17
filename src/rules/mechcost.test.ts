import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { mechCost } from './battleValue';

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
