import { describe, expect, it } from 'vitest';
import { mulSlug, mulUrl } from './mulLink';

describe('Master Unit List links', () => {
  it('slug the chassis and model as the MUL does', () => {
    expect(mulUrl('Atlas', 'AS7-D(R)')).toBe('https://masterunitlist.battletech.com/units/atlas-as7-dr');
    expect(mulSlug('Atlas', 'AS7-D')).toBe('atlas-as7-d');
    expect(mulSlug('Timber Wolf (Mad Cat)', 'Prime')).toBe('timber-wolf-mad-cat-prime');
    expect(mulSlug('Araña', 'ARA-S-1 MilitiaMech')).toBe('arana-ara-s-1-militiamech');
  });
});
