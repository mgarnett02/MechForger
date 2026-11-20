import { describe, expect, it } from 'vitest';
import { addEquipment, newDesign } from './edit';
import { averageClusterHits, damageByRange, damageProfiles, hitChance } from './damage';
import { getEquipment } from './equipment';
import type { MechDesign } from './types';

const withWeapons = (ids: string[], loc: 'CT' | 'LT' | 'RT' = 'LT', base: MechDesign = newDesign('3068')) =>
  ids.reduce((d, id) => addEquipment(d, id, loc), base);

describe('damage by range', () => {
  it('2d6 hit chances and cluster averages', () => {
    expect(hitChance(2)).toBe(1);
    expect(hitChance(4)).toBeCloseTo(33 / 36);
    expect(hitChance(8)).toBeCloseTo(15 / 36);
    expect(hitChance(13)).toBe(0);
    expect(averageClusterHits(20)).toBeCloseTo(457 / 36); // an LRM 20 lands about 12.7 missiles
    expect(averageClusterHits(2)).toBeCloseTo(51 / 36);
  });

  it('a medium laser at short, medium and long range', () => {
    const p = damageByRange(withWeapons(['medium-laser']), 10, false);
    expect(p.points).toHaveLength(9);
    expect(p.points[2].expected).toBeCloseTo(5 * 33 / 36); // 3 hexes: short, 4+
    expect(p.points[3].expected).toBeCloseTo(5 * 26 / 36); // 4 hexes: medium, 6+
    expect(p.points[8].expected).toBeCloseTo(5 * 15 / 36); // 9 hexes: long, 8+
    expect(p.points.every((x) => x.ideal === 5)).toBe(true);
  });

  it('minimum range, clusters, Streaks, rates of fire and slugs', () => {
    const lrm = damageByRange(withWeapons(['lrm-20']), 30, false).points;
    expect(lrm[0].expected).toBeCloseTo(hitChance(4 + 6) * 457 / 36); // 1 hex: 6 inside the minimum
    expect(lrm[6].expected).toBeCloseTo(hitChance(4) * 457 / 36);
    expect(lrm[6].ideal).toBe(20);
    const streak = damageByRange(withWeapons(['streak-srm-6']), 30, false).points;
    expect(streak[0].expected).toBeCloseTo(hitChance(4) * 12);
    expect(damageProfiles(getEquipment('uac-5')!)[0]).toMatchObject({ cluster: 2, heat: 2 });
    expect(damageProfiles(getEquipment('lb-10x')!)[0]).toMatchObject({ cluster: 1, damage: { short: 10 } });
    expect(damageProfiles(getEquipment('heavy-gauss-rifle')!)[0].damage).toEqual({ short: 25, medium: 20, long: 10 });
  });

  it('pulse lasers and a targeting computer hit more often', () => {
    const pulse = damageByRange(withWeapons(['medium-pulse-laser']), 10, false).points;
    expect(pulse[0].expected).toBeCloseTo(6 * hitChance(2));
    const tc = withWeapons(['large-laser', 'targeting-computer']);
    expect(damageByRange(tc, 10, false).points[0].expected).toBeCloseTo(8 * hitChance(3));
  });

  it('leaves out rear-facing, unallocated, melee and no-damage weapons', () => {
    let d = withWeapons(['medium-laser', 'tag', 'hatchet']);
    d = addEquipment(d, 'small-laser');
    d = { ...d, equipment: d.equipment.map((e) => (e.equipmentId === 'medium-laser' ? { ...e, rear: true } : e)) };
    const p = damageByRange(d, 10, false);
    expect(p.counted).toBe(0);
    expect(p.omitted.sort()).toEqual(['Medium Laser', 'Small Laser', 'TAG']);
  });

  it('heat-neutral fire picks the most damage the heat sinks can cool', () => {
    const d = withWeapons(['ppc', 'ppc', 'medium-laser', 'medium-laser']);
    const all = damageByRange(d, 13, false).points[2];
    const cool = damageByRange(d, 13, true).points[2];
    expect(all.heat).toBe(26);
    expect(cool.heat).toBeLessThanOrEqual(13);
    // 13 heat: one PPC (10) and one medium laser (3) beat two medium lasers (6).
    expect(cool.weapons.map((w) => w.name).sort()).toEqual(['Medium Laser', 'PPC']);
    expect(cool.heldBack).toBe(2);
    expect(cool.ideal).toBe(15);
  });
});
