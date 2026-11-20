import { describe, expect, it } from 'vitest';
import mechs from '../data/canon/mechs.json';
import type { CanonEntry } from '../data/canonFormat';
import type { ConfigChoice, EraId } from './eras';
import { isConfigAvailable } from './eras';
import type { TechBase } from './types';

const offered = (era: EraId, techBase: TechBase, mixedTech = false) =>
  (['biped', 'quad', 'tripod', 'quadvee', 'lam-standard', 'lam-bimodal'] as ConfigChoice[])
    .filter((c) => isConfigAvailable(c, { era, techBase, mixedTech }));

describe('configurations by era and tech base', () => {
  it('offers only the configurations that exist', () => {
    expect(offered('3025', 'IS')).toEqual(['biped', 'quad', 'lam-standard']);
    expect(offered('3068', 'IS')).toEqual(['biped', 'quad', 'lam-standard']);
    expect(offered('3081', 'IS')).toEqual(['biped', 'quad']);
    expect(offered('3131', 'IS')).toEqual(['biped', 'quad', 'tripod']);
    expect(offered('3050', 'Clan')).toEqual(['biped', 'quad']);
    expect(offered('3131', 'Clan')).toEqual(['biped', 'quad', 'quadvee']);
    expect(offered('3131', 'Clan', true)).toEqual(['biped', 'quad', 'tripod', 'quadvee']);
  });

  it('agrees with the canon tripods, QuadVees and standard LAMs', () => {
    for (const e of mechs as unknown as CanonEntry[]) {
      const d = e.d as { era: EraId; techBase: TechBase; mixedTech?: boolean; config: string; lam?: string | null };
      const c = (d.lam ? `lam-${d.lam}` : d.config) as ConfigChoice;
      if (c === 'lam-bimodal') continue; // Star League era only, before any era MechForger offers
      expect(isConfigAvailable(c, d), `${e.n} (${c}, ${d.techBase}, ${d.era})`).toBe(true);
    }
  });
});
