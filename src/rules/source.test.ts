import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import vehicles from '../data/canon/vehicles.json';
import type { CanonEntry } from '../data/canonFormat';
import { decodeMech, decodeVehicle } from '../data/canonFormat';
import { computeMech } from './construction';
import { newDesign } from './edit';
import { technicalReadout } from './readout';
import { sourceLine } from './types';
import { computeVehicle, vehicleReadout } from './vehicle';

describe('sourcebook in the technical readout', () => {
  it('names the books, or says the source is unknown', () => {
    expect(sourceLine({ source: 'TR:3039,TR:SW' })).toBe('Source: TR:3039, TR:SW');
    expect(sourceLine({})).toBe('Source unknown');
    expect(sourceLine({ source: ' ' })).toBe('Source unknown');
  });

  it('appears in the readouts of canon and new designs', () => {
    const e = (mechs as unknown as CanonEntry[]).find((x) => x.n === 'Atlas AS7-D')!;
    const atlas = { ...decodeMech(e.d), source: e.src };
    expect(technicalReadout(atlas, computeMech(atlas))).toContain('Source: TR:3039, TR:SW');
    const d = newDesign();
    expect(technicalReadout(d, computeMech(d))).toContain('Source unknown');
    const v = (vehicles as unknown as CanonEntry[]).find((x) => x.src)!;
    const tank = { ...decodeVehicle(v.d), source: v.src };
    expect(vehicleReadout(tank, computeVehicle(tank))).toContain(`Source: ${v.src!.split(',').join(', ')}`);
  });
});
