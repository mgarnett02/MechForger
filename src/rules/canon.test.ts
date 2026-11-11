import { describe, expect, it } from 'vitest';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech } from '../data/canonFormat';
import { parseAny } from '../ui/storage';

const lists = import.meta.glob('../data/canon/*.json', { eager: true, import: 'default' }) as Record<string, CanonEntry[]>;

describe('canon list', () => {
  it('contains no apocryphal (video game or other non-canon) designs', () => {
    for (const list of Object.values(lists)) {
      expect(list.filter((e) => /apocryph/i.test(`${e.src ?? ''} ${e.n}`))).toEqual([]);
    }
  });

  it('most designs carry their Master Unit List id, and the id survives saving and loading', () => {
    const mechs = Object.entries(lists).find(([k]) => k.endsWith('mechs.json'))![1];
    expect(mechs.filter((e) => e.mul).length / mechs.length).toBeGreaterThan(0.9);
    const e = mechs.find((x) => x.mul)!;
    const d = { ...decodeMech(e.d), mulId: e.mul };
    expect(parseAny(JSON.parse(JSON.stringify(d))).mulId).toBe(e.mul);
    expect(parseAny(JSON.parse(JSON.stringify({ ...d, mulId: undefined }))).mulId).toBeUndefined();
  });
});
